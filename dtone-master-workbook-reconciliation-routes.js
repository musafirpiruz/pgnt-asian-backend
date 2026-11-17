'use strict';

const crypto = require('node:crypto');
const pathModule = require('node:path');
const { parseOfficialMasterWorkbook } = require('./dtone-master-workbook-parser');
const { normalizeDtOneProductDetail } = require('./dtone-product-detail-adapter');
const { compareWorkbookProduct } = require('./dtone-master-catalog-reconciliation');

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const RATE_LOCK_ID = 71230941;
const COUNTRY_CODES = Object.freeze(['AF', 'PK', 'IN', 'BD']);
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function validRunId(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
}

function registerDtOneMasterWorkbookRoutes({
  app, express, pool, requireAdmin, dtoneApiBaseUrl, dtoneApiBaseUrlExplicit, getDtOneAuthHeader,
}) {
  if (!app || !express || typeof requireAdmin !== 'function') {
    throw new Error('DT One master reconciliation routes require app, express, and admin authentication.');
  }

  let apiOrigin = null;
  try {
    const parsedApiUrl = new URL(dtoneApiBaseUrl);
    if (parsedApiUrl.protocol === 'https:' && (parsedApiUrl.hostname === 'dtone.com' || parsedApiUrl.hostname.endsWith('.dtone.com'))) {
      apiOrigin = parsedApiUrl.origin;
    }
  } catch (_) {}

  async function loadCountryCodeMap() {
    if (!pool) throw new Error('Database is not configured.');
    const result = await pool.query(
      "SELECT country_code, provider_country_code FROM country_registry " +
      "WHERE LOWER(provider) = 'dtone' AND country_code::text = ANY($1::text[]) " +
      "AND provider_country_code IS NOT NULL AND BTRIM(provider_country_code) <> ''",
      [COUNTRY_CODES]
    );
    const map = {};
    const seenCountries = new Set();
    for (const row of result.rows) {
      const country = String(row.country_code || '').trim().toUpperCase();
      const providerCode = String(row.provider_country_code || '').trim().toUpperCase();
      if (!COUNTRY_CODES.includes(country) || !providerCode || map[providerCode] || seenCountries.has(country)) {
        throw new Error('DT One provider-country mapping is ambiguous.');
      }
      map[providerCode] = country;
      seenCountries.add(country);
    }
    const missing = COUNTRY_CODES.filter((country) => !seenCountries.has(country));
    if (missing.length) throw new Error('DT One provider-country mappings are missing for: ' + missing.join(', '));
    return map;
  }

  async function getSummary(runId) {
    const runResult = await pool.query(
      "SELECT id, source_file_name, source_sha256, sheet_name, report_version, " +
      "total_products, country_counts, product_type_counts, status, resume_after, last_error_code, api_origin, " +
      "created_at, started_at, completed_at, updated_at " +
      "FROM dtone_master_reconciliation_runs WHERE id = $1",
      [runId]
    );
    if (!runResult.rowCount) return null;
    const countsResult = await pool.query(
      "SELECT status, COUNT(*)::int AS count FROM dtone_master_reconciliation_items " +
      "WHERE run_id = $1 GROUP BY status",
      [runId]
    );
    const counts = {
      pending: 0, in_progress: 0, matched: 0, mismatch: 0,
      missing_at_provider: 0, lookup_error: 0,
    };
    for (const row of countsResult.rows) counts[row.status] = Number(row.count);
    const checked = counts.matched + counts.mismatch + counts.missing_at_provider + counts.lookup_error;
    return {
      ...runResult.rows[0],
      counts,
      checked_products: checked,
      remaining_products: counts.pending + counts.in_progress,
      safe_to_import: false,
      catalog_products_imported: false,
      products_activated: false,
      payments_created: false,
      topups_created: false,
    };
  }

  let workerPromise = null;
  function startWorker() {
    if (!pool || workerPromise) return;
    workerPromise = runWorker()
      .catch((error) => {
        console.error('DT One master reconciliation worker stopped:', {
          errorCode: error?.code || null,
          errorName: error?.name || 'Error',
        });
      })
      .finally(async () => {
        workerPromise = null;
        await delay(5000);
        try {
          const pending = await pool.query("SELECT 1 FROM dtone_master_reconciliation_runs WHERE status IN ('queued', 'running') LIMIT 1");
          if (pending.rowCount) startWorker();
        } catch (_) {}
      });
  }

  async function runWorker() {
    const lockClient = await pool.connect();
    let locked = false;
    try {
      const lockResult = await lockClient.query(
        'SELECT pg_try_advisory_lock($1) AS locked',
        [RATE_LOCK_ID]
      );
      locked = lockResult.rows[0]?.locked === true;
      if (!locked) return;

      await pool.query(
        "UPDATE dtone_master_reconciliation_items SET status = 'pending', " +
        "last_error_code = 'WORKER_RESTARTED' WHERE status = 'in_progress'"
      );
      await pool.query(
        "UPDATE dtone_master_reconciliation_runs SET status = 'queued', updated_at = NOW() " +
        "WHERE status = 'running'"
      );

      while (true) {
        const runResult = await pool.query(
          "SELECT id FROM dtone_master_reconciliation_runs " +
          "WHERE status IN ('queued', 'running') ORDER BY created_at ASC LIMIT 1"
        );
        if (!runResult.rowCount) break;
        const runId = runResult.rows[0].id;

        let countryCodeMap;
        try {
          countryCodeMap = await loadCountryCodeMap();
        } catch (_) {
          await pool.query(
            "UPDATE dtone_master_reconciliation_runs SET status = 'paused', last_error_code = 'COUNTRY_MAPPING_INCOMPLETE', updated_at = NOW() WHERE id = $1",
            [runId]
          );
          break;
        }

        const itemResult = await pool.query(
          "SELECT product_id, expected FROM dtone_master_reconciliation_items " +
          "WHERE run_id = $1 AND status = 'pending' ORDER BY product_id::bigint ASC LIMIT 1",
          [runId]
        );
        if (!itemResult.rowCount) {
          await pool.query(
            "UPDATE dtone_master_reconciliation_runs SET status = 'completed', " +
            "completed_at = NOW(), updated_at = NOW() WHERE id = $1 AND status IN ('queued', 'running')",
            [runId]
          );
          continue;
        }

        const item = itemResult.rows[0];
        const claim = await pool.query(
          "UPDATE dtone_master_reconciliation_items SET status = 'in_progress', " +
          "attempt_count = attempt_count + 1 WHERE run_id = $1 AND product_id = $2 " +
          "AND status = 'pending' RETURNING product_id, expected",
          [runId, item.product_id]
        );
        if (!claim.rowCount) continue;

        await pool.query(
          "UPDATE dtone_master_reconciliation_runs SET status = 'running', " +
          "started_at = COALESCE(started_at, NOW()), updated_at = NOW() " +
          "WHERE id = $1 AND status IN ('queued', 'running')",
          [runId]
        );

        const currentRun = await pool.query(
          'SELECT status FROM dtone_master_reconciliation_runs WHERE id = $1',
          [runId]
        );
        if (!currentRun.rowCount || currentRun.rows[0].status !== 'running') {
          await pool.query(
            "UPDATE dtone_master_reconciliation_items SET status = 'pending' " +
            "WHERE run_id = $1 AND product_id = $2 AND status = 'in_progress'",
            [runId, item.product_id]
          );
          break;
        }

        let pauseRun = false;
        try {
          const response = await fetch(
            dtoneApiBaseUrl.replace(/\/+$/, '') + '/v1/products/' + encodeURIComponent(item.product_id),
            {
              method: 'GET',
              headers: { Authorization: getDtOneAuthHeader(), Accept: 'application/json' },
              signal: AbortSignal.timeout(20000),
            }
          );

          if (response.status === 404) {
            await pool.query(
              "UPDATE dtone_master_reconciliation_items SET status = 'missing_at_provider', " +
              "provider = NULL, differences = '[\"provider product not found\"]'::jsonb, " +
              "provider_http_status = 404, last_error_code = NULL, checked_at = NOW() " +
              "WHERE run_id = $1 AND product_id = $2",
              [runId, item.product_id]
            );
          } else if (response.status === 429) {
            const retryHeader = response.headers.get('retry-after');
            let retrySeconds = /^\d+$/.test(String(retryHeader || '')) ? Number(retryHeader) : 60;
            retrySeconds = Math.max(5, Math.min(3600, retrySeconds));
            await pool.query(
              "UPDATE dtone_master_reconciliation_items SET status = 'pending', " +
              "provider_http_status = 429, last_error_code = 'HTTP_429', checked_at = NOW() " +
              "WHERE run_id = $1 AND product_id = $2",
              [runId, item.product_id]
            );
            await pool.query(
              "UPDATE dtone_master_reconciliation_runs SET status = 'paused', last_error_code = 'HTTP_429', " +
              "resume_after = NOW() + ($2::int * INTERVAL '1 second'), updated_at = NOW() WHERE id = $1",
              [runId, retrySeconds]
            );
            pauseRun = true;
          } else if (!response.ok) {
            await pool.query(
              "UPDATE dtone_master_reconciliation_items SET status = 'lookup_error', " +
              "provider_http_status = $3, last_error_code = $4, differences = $5::jsonb, checked_at = NOW() " +
              "WHERE run_id = $1 AND product_id = $2",
              [runId, item.product_id, response.status, 'HTTP_' + response.status,
                JSON.stringify(['DT One detail lookup returned HTTP ' + response.status])]
            );
            await pool.query(
              "UPDATE dtone_master_reconciliation_runs SET status = 'paused', last_error_code = $2, updated_at = NOW() WHERE id = $1",
              [runId, 'HTTP_' + response.status]
            );
            pauseRun = true;
          } else {
            const detail = await response.json();
            const normalized = normalizeDtOneProductDetail(detail, item.product_id, countryCodeMap);
            const comparison = compareWorkbookProduct(item.expected, normalized);
            await pool.query(
              "UPDATE dtone_master_reconciliation_items SET status = $3, provider = $4::jsonb, " +
              "differences = $5::jsonb, provider_http_status = $6, last_error_code = NULL, checked_at = NOW() " +
              "WHERE run_id = $1 AND product_id = $2",
              [
                runId, item.product_id,
                comparison.status === 'MATCHED' ? 'matched' : 'mismatch',
                JSON.stringify(normalized), JSON.stringify(comparison.differences), response.status,
              ]
            );
          }
        } catch (error) {
          await pool.query(
            "UPDATE dtone_master_reconciliation_items SET status = 'lookup_error', " +
            "last_error_code = $3, differences = $4::jsonb, checked_at = NOW() " +
            "WHERE run_id = $1 AND product_id = $2",
            [
              runId, item.product_id,
              error?.message && /product ID does not match/.test(error.message)
                ? 'DETAIL_ID_MISMATCH' : 'DETAIL_LOOKUP_FAILED',
              JSON.stringify(['DT One detail could not be safely normalized']),
            ]
          );
          await pool.query(
            "UPDATE dtone_master_reconciliation_runs SET status = 'paused', last_error_code = 'DETAIL_LOOKUP_FAILED', updated_at = NOW() WHERE id = $1",
            [runId]
          );
          pauseRun = true;
        }

        // The advisory lock serializes calls across Render instances. Waiting
        // after each GET enforces at most one product-detail request per second.
        await delay(1000);
        await pool.query(
          'UPDATE dtone_master_reconciliation_runs SET updated_at = NOW() WHERE id = $1',
          [runId]
        );
        if (pauseRun) break;
      }
    } finally {
      if (locked) {
        try { await lockClient.query('SELECT pg_advisory_unlock($1)', [RATE_LOCK_ID]); } catch (_) {}
      }
      lockClient.release();
    }
  }

  app.get('/admin-dtone-master-reconciliation', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'"
    );
    return res.sendFile(pathModule.join(__dirname, 'admin-dtone-master-reconciliation.html'));
  });

  app.post(
    '/api/admin/dtone/master-reconciliation/runs',
    requireAdmin,
    express.raw({ type: XLSX_MIME, limit: '2mb' }),
    async (req, res) => {
      if (!pool) return res.status(503).json({ error: 'Database is not configured.' });
      if (!dtoneApiBaseUrlExplicit || !apiOrigin) {
        return res.status(503).json({ error: 'Set an explicit HTTPS DTONE_API_BASE_URL on a *.dtone.com host before starting master-catalog verification. The default pre-production fallback is not accepted.' });
      }
      if (req.headers['x-read-only-confirmation'] !== 'true') {
        return res.status(400).json({ confirmationRequired: true, error: 'Explicit read-only reconciliation confirmation is required.' });
      }
      if (!Buffer.isBuffer(req.body)) {
        return res.status(415).json({ error: 'Upload the official XLSX workbook using the XLSX content type.' });
      }

      let fileName;
      try {
        fileName = decodeURIComponent(String(req.headers['x-workbook-file-name'] || ''));
      } catch (_) {
        return res.status(400).json({ error: 'Workbook filename header is invalid.' });
      }

      try {
        const parsed = await parseOfficialMasterWorkbook(req.body, fileName);
        await loadCountryCodeMap();
        const client = await pool.connect();
        const runId = crypto.randomUUID();
        try {
          await client.query('BEGIN');
          await client.query(
            "INSERT INTO dtone_master_reconciliation_runs " +
            "(id, source_file_name, source_sha256, api_origin, sheet_name, report_version, total_products, " +
            "country_counts, product_type_counts, status) " +
            "VALUES ($1, $2, $3, $4, $5, 1, $6, $7::jsonb, $8::jsonb, 'queued')",
            [
              runId, parsed.sourceFileName, parsed.sourceSha256, apiOrigin, parsed.sheetName,
              parsed.rowCount, JSON.stringify(parsed.countryCounts), JSON.stringify(parsed.productTypeCounts),
            ]
          );
          const stagedRows = parsed.rows.map((row) => ({
            productId: row.productId, countryCode: row.country, expected: row,
          }));
          await client.query(
            "INSERT INTO dtone_master_reconciliation_items (run_id, product_id, country_code, expected) " +
            "SELECT $1, item->>'productId', item->>'countryCode', item->'expected' " +
            "FROM jsonb_array_elements($2::jsonb) AS item",
            [runId, JSON.stringify(stagedRows)]
          );
          await client.query('COMMIT');
        } catch (error) {
          try { await client.query('ROLLBACK'); } catch (_) {}
          throw error;
        } finally {
          client.release();
        }

        startWorker();
        return res.status(201).json({
          runId,
          status: 'queued',
          sourceFileName: parsed.sourceFileName,
          sourceSha256: parsed.sourceSha256,
          apiOrigin,
          totalProducts: parsed.rowCount,
          countryCounts: parsed.countryCounts,
          productTypeCounts: parsed.productTypeCounts,
          stagingOnly: true,
          productCatalogChanged: false,
          productsActivated: false,
          paymentsCreated: false,
          topupsCreated: false,
        });
      } catch (error) {
        console.error('DT One master workbook staging failed:', {
          errorCode: error?.code || null,
          errorName: error?.name || 'Error',
          errorMessage: String(error?.message || '').slice(0, 180),
        });
        const clientError = /workbook|sheet|column|product|country|range|currency|filename|header|duplicate|unsupported/i.test(String(error?.message || ''));
        return res.status(clientError ? 400 : 503).json({
          error: clientError ? error.message : 'Could not safely stage the DT One master workbook.',
          productCatalogChanged: false,
        });
      }
    }
  );

  app.get('/api/admin/dtone/master-reconciliation/runs/:runId', requireAdmin, async (req, res) => {
    if (!pool) return res.status(503).json({ error: 'Database is not configured.' });
    if (!validRunId(req.params.runId)) return res.status(400).json({ error: 'Invalid reconciliation run ID.' });
    try {
      const summary = await getSummary(req.params.runId);
      if (!summary) return res.status(404).json({ error: 'Reconciliation run not found.' });
      return res.json(summary);
    } catch (error) {
      console.error('DT One reconciliation status lookup failed:', error.message);
      return res.status(503).json({ error: 'Could not retrieve reconciliation progress.' });
    }
  });

  app.post('/api/admin/dtone/master-reconciliation/runs/:runId/pause', requireAdmin, async (req, res) => {
    if (!pool) return res.status(503).json({ error: 'Database is not configured.' });
    if (!validRunId(req.params.runId)) return res.status(400).json({ error: 'Invalid reconciliation run ID.' });
    if (req.body?.confirmPause !== true) return res.status(400).json({ confirmationRequired: true, error: 'Explicit pause confirmation is required.' });
    const result = await pool.query(
      "UPDATE dtone_master_reconciliation_runs SET status = 'paused', updated_at = NOW() " +
      "WHERE id = $1 AND status IN ('queued', 'running') RETURNING id",
      [req.params.runId]
    );
    if (!result.rowCount) return res.status(409).json({ error: 'Run is not currently queued or running.' });
    return res.json({ paused: true, runId: req.params.runId, currentLookupMayFinish: true });
  });

  app.post('/api/admin/dtone/master-reconciliation/runs/:runId/resume', requireAdmin, async (req, res) => {
    if (!pool) return res.status(503).json({ error: 'Database is not configured.' });
    if (!validRunId(req.params.runId)) return res.status(400).json({ error: 'Invalid reconciliation run ID.' });
    if (req.body?.confirmResume !== true) return res.status(400).json({ confirmationRequired: true, error: 'Explicit resume confirmation is required.' });
    const current = await pool.query(
      'SELECT status, resume_after FROM dtone_master_reconciliation_runs WHERE id = $1',
      [req.params.runId]
    );
    if (!current.rowCount) return res.status(404).json({ error: 'Reconciliation run not found.' });
    if (current.rows[0].status !== 'paused') return res.status(409).json({ error: 'Only a paused run can be resumed.' });
    if (current.rows[0].resume_after && new Date(current.rows[0].resume_after).getTime() > Date.now()) {
      const seconds = Math.ceil((new Date(current.rows[0].resume_after).getTime() - Date.now()) / 1000);
      return res.status(429).json({ retryAfterSeconds: seconds, error: 'DT One rate-limit cooldown has not expired.' });
    }
    await pool.query(
      "UPDATE dtone_master_reconciliation_items SET status = 'pending', provider = NULL, " +
      "differences = '[]'::jsonb, provider_http_status = NULL, last_error_code = NULL " +
      "WHERE run_id = $1 AND status = 'lookup_error'",
      [req.params.runId]
    );
    await pool.query(
      "UPDATE dtone_master_reconciliation_runs SET status = 'queued', resume_after = NULL, last_error_code = NULL, updated_at = NOW() WHERE id = $1",
      [req.params.runId]
    );
    startWorker();
    return res.json({ resumed: true, runId: req.params.runId, automaticRetry: false });
  });

  app.get('/api/admin/dtone/master-reconciliation/runs/:runId/report', requireAdmin, async (req, res) => {
    if (!pool) return res.status(503).json({ error: 'Database is not configured.' });
    if (!validRunId(req.params.runId)) return res.status(400).json({ error: 'Invalid reconciliation run ID.' });
    try {
      const summary = await getSummary(req.params.runId);
      if (!summary) return res.status(404).json({ error: 'Reconciliation run not found.' });
      const items = await pool.query(
        "SELECT product_id, country_code, expected, status, provider, differences, " +
        "provider_http_status, last_error_code, attempt_count, checked_at " +
        "FROM dtone_master_reconciliation_items WHERE run_id = $1 ORDER BY product_id::bigint ASC",
        [req.params.runId]
      );
      return res.json({
        reportVersion: summary.report_version,
        run: summary,
        items: items.rows.map((item) => ({
          productId: item.product_id,
          country: item.country_code,
          expected: item.expected,
          status: String(item.status).toUpperCase(),
          provider: item.provider,
          differences: item.differences,
          providerHttpStatus: item.provider_http_status,
          lastErrorCode: item.last_error_code,
          attemptCount: item.attempt_count,
          checkedAt: item.checked_at,
        })),
        safeToImport: false,
        productCatalogChanged: false,
        productsActivated: false,
        paymentsCreated: false,
        topupsCreated: false,
      });
    } catch (error) {
      console.error('DT One reconciliation report failed:', error.message);
      return res.status(503).json({ error: 'Could not retrieve the reconciliation report.' });
    }
  });

  // All new runs require an admin upload and explicit read-only confirmation.
  // On restart, only previously authorized queued/running staging runs resume.
  setTimeout(startWorker, 2000).unref?.();
}

module.exports = { registerDtOneMasterWorkbookRoutes };
