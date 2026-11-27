'use strict';

// Isolated HTTP/PostgreSQL approval tests. DT One is replaced by a local HTTP fixture;
// Stripe uses a test-only key and no payment endpoint is exercised.
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const net = require('node:net');
const path = require('node:path');
const http = require('node:http');
const { Pool } = require('pg');

const databaseUrl = process.env.DATABASE_URL;

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return server.address().port;
}

async function freePort() {
  const server = net.createServer();
  const port = await listen(server);
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return port;
}

function providerProduct(id, operatorId, operatorName, amount) {
  return {
    id: Number(id),
    type: 'FIXED_VALUE_RECHARGE',
    operator: { id: operatorId, name: operatorName, country: { iso_code: 'AFG' } },
    destination: { unit: 'AFN', amount },
    prices: { retail: { amount: 3.5, unit: 'EUR' }, wholesale: { amount: 3.0, unit: 'EUR' } },
  };
}

test('country operator approval HTTP routes persist samples safely and roll back failures', {
  skip: !databaseUrl ? 'DATABASE_URL is not configured; requires isolated PostgreSQL test database' : false,
  timeout: 60000,
}, async () => {
  const db = new Pool({ connectionString: databaseUrl, max: 4 });
  const providerProducts = new Map();
  const providerFailures = new Map();
  const providerMutations = new Map();
  const providerServer = http.createServer(async (req, res) => {
    const id = decodeURIComponent((req.url || '').split('/').pop());
    const mutation = providerMutations.get(id);
    if (mutation) {
      providerMutations.delete(id);
      await db.query(
        "UPDATE country_operator_approvals SET sample_product_catalog_id=$1 WHERE operator_id=$2 AND status='approved'",
        [mutation.sampleProductCatalogId, mutation.operatorId],
      );
    }
    const failure = providerFailures.get(id);
    if (failure && failure.delay) return setTimeout(() => res.writeHead(failure.status || 200).end(JSON.stringify({ error: 'simulated provider delay' })), failure.delay);
    if (failure) return res.writeHead(failure).end(JSON.stringify({ error: 'simulated provider failure' }));
    const product = providerProducts.get(id);
    res.setHeader('content-type', 'application/json');
    if (!product) return res.writeHead(404).end(JSON.stringify({ error: 'not found' }));
    return res.writeHead(200).end(JSON.stringify(product));
  });
  const providerPort = await listen(providerServer);
  const port = await freePort();
  const baseUrl = 'http://127.0.0.1:' + port;
  const adminKey = 'ci-country-approval-test-admin-key';
  const fixtures = [];
  let child = null;
  let triggerInstalled = false;

  async function fixture(suffix, productId, amount, canonicalProviderId) {
    const key = 'ci-approval-' + suffix;
    const name = 'CI Approval ' + suffix;
    const operator = await db.query(
      'INSERT INTO country_operators (country_code,provider,provider_operator_id,operator_key,display_name,active,verified_at) VALUES ($1,$2,$3,$4,$5,FALSE,NULL) RETURNING id',
      ['AF', 'dtone', canonicalProviderId || null, key, name],
    );
    const operatorId = operator.rows[0].id;
    const product = await db.query(
      'INSERT INTO product_catalog (country,operator,amount,currency,product_id,price_eur_cents,wholesale_price_eur_cents,active,updated_at) VALUES ($1,$2,$3,$4,$5,350,300,FALSE,NOW()) RETURNING id',
      ['AF', name, amount, 'AFN', productId],
    );
    const productCatalogId = product.rows[0].id;
    await db.query(
      'INSERT INTO country_operator_products (country_code,operator_key,product_catalog_id,active,verified_at) VALUES ($1,$2,$3,FALSE,NULL)',
      ['AF', key, productCatalogId],
    );
    const item = { operatorId, productCatalogId, productId, operatorName: name, amount };
    fixtures.push(item);
    return item;
  }

  try {
    await db.query(
      "INSERT INTO country_registry (country_code,country_name,destination_currency,calling_code,phone_min_digits,phone_max_digits,provider,status) VALUES ('AF','Afghanistan','AFN','+93',9,9,'dtone','legacy') ON CONFLICT (country_code) DO NOTHING",
    );

    const good = await fixture('good', 2147483001, 101, null);
    const mismatch = await fixture('mismatch', 2147483002, 102, 'canonical-provider-operator');
    const rollback = await fixture('rollback', 2147483003, 103, null);

    providerProducts.set(String(good.productId), providerProduct(good.productId, 'provider-operator-good', good.operatorName, good.amount));
    providerProducts.set(String(mismatch.productId), providerProduct(mismatch.productId, 'different-provider-operator', mismatch.operatorName, mismatch.amount));
    providerProducts.set(String(rollback.productId), providerProduct(rollback.productId, 'provider-operator-rollback', rollback.operatorName, rollback.amount));

    // Fail the final audit write to prove that approval, mapping and price updates roll back together.
    await db.query(
      'CREATE OR REPLACE FUNCTION ci_fail_country_approval_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.operator_id = ' +
      Number(rollback.operatorId) +
      " AND NEW.event_type = 'sample_approved' THEN RAISE EXCEPTION 'CI simulated audit persistence failure'; END IF; RETURN NEW; END; $$",
    );
    await db.query(
      'CREATE TRIGGER ci_fail_country_approval_audit_trigger BEFORE INSERT ON catalog_verification_audit FOR EACH ROW EXECUTE FUNCTION ci_fail_country_approval_audit()',
    );
    triggerInstalled = true;

    child = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
      env: {
        ...process.env,
        PORT: String(port),
        DATABASE_URL: databaseUrl,
        ADMIN_API_KEY: adminKey,
        DTONE_API_KEY: 'ci-local-provider-fixture-key',
        DTONE_API_SECRET: 'ci-local-provider-fixture-secret',
        DTONE_API_BASE_URL: 'http://127.0.0.1:' + providerPort,
        DTONE_CATALOG_VERIFY_TIMEOUT_MS: '250',
        STRIPE_SECRET_KEY: 'sk_test_ci_country_approval_no_network',
        STRIPE_WEBHOOK_SECRET: '',
        NODE_ENV: 'test',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let logs = '';
    child.stdout.on('data', chunk => { logs += chunk.toString(); });
    child.stderr.on('data', chunk => { logs += chunk.toString(); });
    let ready = false;
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
      if (child.exitCode !== null) throw new Error('Test server exited early (' + child.exitCode + '). Logs: ' + logs);
      try {
        const response = await fetch(baseUrl + '/health', { signal: AbortSignal.timeout(1000) });
        if (response.status === 200) { ready = true; break; }
      } catch (_) { /* wait for startup */ }
      await new Promise(resolve => setTimeout(resolve, 150));
    }
    assert.ok(ready, 'Test server did not become healthy. Logs: ' + logs);

    const overviewUnauth = await fetch(baseUrl + '/api/admin/country-operators');
    assert.equal(overviewUnauth.status, 401);
    const overviewBefore = await fetch(baseUrl + '/api/admin/country-operators', {
      headers: { 'x-admin-api-key': adminKey },
    });
    assert.equal(overviewBefore.status, 200);
    const overviewBeforeBody = await overviewBefore.json();
    const overviewGoodBefore = overviewBeforeBody.operators.find(item => String(item.id) === String(good.operatorId));
    assert.ok(overviewGoodBefore);
    assert.equal(overviewGoodBefore.approval, null);
    assert.equal(overviewGoodBefore.counts.total, 1);
    assert.equal(overviewGoodBefore.counts.pending, 1);

    const unauth = await fetch(baseUrl + '/api/admin/country-operators/' + good.operatorId + '/catalog-candidates');
    assert.equal(unauth.status, 401);

    const autoUnauth = await fetch(baseUrl + '/api/admin/country-operators/' + good.operatorId + '/catalog-auto-verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ limit: 25 }),
    });
    assert.equal(autoUnauth.status, 401);

    const autoBeforeApproval = await fetch(baseUrl + '/api/admin/country-operators/' + good.operatorId + '/catalog-auto-verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-admin-api-key': adminKey },
      body: JSON.stringify({ limit: 25 }),
    });
    assert.equal(autoBeforeApproval.status, 409);


    const invalid = await fetch(baseUrl + '/api/admin/country-operators/not-a-number/catalog-candidates', {
      headers: { 'x-admin-api-key': adminKey },
    });
    assert.equal(invalid.status, 400);

    const noConfirm = await fetch(baseUrl + '/api/admin/country-operators/' + good.operatorId + '/approve-sample', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-admin-api-key': adminKey },
      body: JSON.stringify({ productCatalogId: good.productCatalogId }),
    });
    assert.equal(noConfirm.status, 400);
    assert.equal((await noConfirm.json()).confirmationRequired, true);

    const approved = await fetch(baseUrl + '/api/admin/country-operators/' + good.operatorId + '/approve-sample', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-admin-api-key': adminKey },
      body: JSON.stringify({ productCatalogId: good.productCatalogId, confirmApproval: true }),
    });
    assert.equal(approved.status, 201);
    const body = await approved.json();
    assert.equal(body.approved, true);
    assert.equal(body.operatorActive, false);
    assert.equal(body.productMappingActive, false);
    assert.equal(body.productActive, false);
    assert.equal(body.activationChanged, false);
    assert.equal(body.transactionCreated, false);
    const overviewAfter = await fetch(baseUrl + '/api/admin/country-operators', {
      headers: { 'x-admin-api-key': adminKey },
    });
    assert.equal(overviewAfter.status, 200);
    const overviewAfterBody = await overviewAfter.json();
    const overviewGoodAfter = overviewAfterBody.operators.find(item => String(item.id) === String(good.operatorId));
    assert.equal(String(overviewGoodAfter.approval.sampleProductCatalogId), String(good.productCatalogId));
    assert.equal(overviewGoodAfter.counts.verified, 1);
    assert.equal(overviewGoodAfter.counts.pending, 0);

    const saved = await db.query(
      "SELECT a.provider_product_id,a.provider_operator_id,a.destination_currency,a.retail_price_eur_cents,a.wholesale_price_eur_cents,o.provider_operator_id AS operator_provider_id,o.active AS operator_active,m.active AS mapping_active,m.verified_at AS mapping_verified_at,p.active AS product_active,p.price_eur_cents,p.wholesale_price_eur_cents AS product_wholesale FROM country_operator_approvals a JOIN country_operators o ON o.id=a.operator_id JOIN country_operator_products m ON m.country_code=o.country_code AND m.operator_key=o.operator_key JOIN product_catalog p ON p.id=m.product_catalog_id WHERE a.operator_id=$1 AND a.sample_product_catalog_id=$2 AND a.status='approved'",
      [good.operatorId, good.productCatalogId],
    );
    assert.equal(saved.rowCount, 1);
    assert.equal(saved.rows[0].provider_product_id, String(good.productId));
    assert.equal(saved.rows[0].provider_operator_id, 'provider-operator-good');
    assert.equal(saved.rows[0].operator_provider_id, 'provider-operator-good');
    assert.equal(saved.rows[0].destination_currency, 'AFN');
    assert.equal(saved.rows[0].retail_price_eur_cents, 350);
    assert.equal(saved.rows[0].wholesale_price_eur_cents, 300);
    assert.equal(saved.rows[0].price_eur_cents, 350);
    assert.equal(saved.rows[0].product_wholesale, 300);
    assert.equal(saved.rows[0].operator_active, false);
    assert.equal(saved.rows[0].mapping_active, false);
    assert.equal(saved.rows[0].product_active, false);
    assert.ok(saved.rows[0].mapping_verified_at);

    // One manually approved sample should unlock exact-identity automatic verification
    // for another denomination on the same operator, without another owner approval.
    const autoProduct = await db.query(
      "INSERT INTO product_catalog (country,operator,amount,currency,product_id,price_eur_cents,wholesale_price_eur_cents,active,updated_at) VALUES ('AF',$1,111,'AFN',2147483006,350,300,FALSE,NOW()) RETURNING id",
      [good.operatorName],
    );
    const autoCandidate = {
      operatorId: good.operatorId,
      productCatalogId: autoProduct.rows[0].id,
      productId: 2147483006,
      operatorName: good.operatorName,
      amount: 111,
    };
    fixtures.push(autoCandidate);
    await db.query(
      'INSERT INTO country_operator_products (country_code,operator_key,product_catalog_id,active,verified_at) SELECT country_code,operator_key,$1,FALSE,NULL FROM country_operators WHERE id=$2',
      [autoCandidate.productCatalogId, good.operatorId],
    );
    providerProducts.set(String(autoCandidate.productId),
      providerProduct(autoCandidate.productId, 'provider-operator-good', good.operatorName, autoCandidate.amount));

    const autoMismatchProduct = await db.query(
      "INSERT INTO product_catalog (country,operator,amount,currency,product_id,price_eur_cents,wholesale_price_eur_cents,active,updated_at) VALUES ('AF',$1,112,'AFN',2147483007,350,300,FALSE,NOW()) RETURNING id",
      [good.operatorName],
    );
    const autoMismatch = {
      operatorId: good.operatorId,
      productCatalogId: autoMismatchProduct.rows[0].id,
      productId: 2147483007,
      operatorName: good.operatorName,
      amount: 112,
    };
    fixtures.push(autoMismatch);
    await db.query(
      'INSERT INTO country_operator_products (country_code,operator_key,product_catalog_id,active,verified_at) SELECT country_code,operator_key,$1,FALSE,NULL FROM country_operators WHERE id=$2',
      [autoMismatch.productCatalogId, good.operatorId],
    );
    // Same display name but a different provider operator ID must be sent to review.
    providerProducts.set(String(autoMismatch.productId),
      providerProduct(autoMismatch.productId, 'different-provider-operator-id', good.operatorName, autoMismatch.amount));

    const autoNotFoundProduct = await db.query(
      "INSERT INTO product_catalog (country,operator,amount,currency,product_id,price_eur_cents,wholesale_price_eur_cents,active,updated_at) VALUES ('AF',$1,113,'AFN',2147483008,350,300,FALSE,NOW()) RETURNING id",
      [good.operatorName],
    );
    const autoNotFound = {operatorId:good.operatorId,productCatalogId:autoNotFoundProduct.rows[0].id,
      productId:2147483008,operatorName:good.operatorName,amount:113};
    fixtures.push(autoNotFound);
    await db.query('INSERT INTO country_operator_products (country_code,operator_key,product_catalog_id,active,verified_at) SELECT country_code,operator_key,$1,FALSE,NULL FROM country_operators WHERE id=$2',
      [autoNotFound.productCatalogId,good.operatorId]);
    providerFailures.set(String(autoNotFound.productId),404);

    const autoUnavailableProduct = await db.query(
      "INSERT INTO product_catalog (country,operator,amount,currency,product_id,price_eur_cents,wholesale_price_eur_cents,active,updated_at) VALUES ('AF',$1,114,'AFN',2147483009,350,300,FALSE,NOW()) RETURNING id",
      [good.operatorName],
    );
    const autoUnavailable = {operatorId:good.operatorId,productCatalogId:autoUnavailableProduct.rows[0].id,
      productId:2147483009,operatorName:good.operatorName,amount:114};
    fixtures.push(autoUnavailable);
    await db.query('INSERT INTO country_operator_products (country_code,operator_key,product_catalog_id,active,verified_at) SELECT country_code,operator_key,$1,FALSE,NULL FROM country_operators WHERE id=$2',
      [autoUnavailable.productCatalogId,good.operatorId]);
    providerFailures.set(String(autoUnavailable.productId),503);

    const autoTimeoutProduct = await db.query(
      "INSERT INTO product_catalog (country,operator,amount,currency,product_id,price_eur_cents,wholesale_price_eur_cents,active,updated_at) VALUES ('AF',$1,115,'AFN',2147483010,350,300,FALSE,NOW()) RETURNING id",
      [good.operatorName],
    );
    const autoTimeout = {operatorId:good.operatorId,productCatalogId:autoTimeoutProduct.rows[0].id,
      productId:2147483010,operatorName:good.operatorName,amount:115};
    fixtures.push(autoTimeout);
    await db.query('INSERT INTO country_operator_products (country_code,operator_key,product_catalog_id,active,verified_at) SELECT country_code,operator_key,$1,FALSE,NULL FROM country_operators WHERE id=$2',
      [autoTimeout.productCatalogId,good.operatorId]);
    providerFailures.set(String(autoTimeout.productId),{delay:1000,status:200});

    const autoResponse = await fetch(baseUrl + '/api/admin/country-operators/' + good.operatorId + '/catalog-auto-verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-admin-api-key': adminKey },
      body: JSON.stringify({ limit: 25 }),
    });
    assert.equal(autoResponse.status, 200);
    const autoBody = await autoResponse.json();
    assert.equal(autoBody.requestedCount, 5);
    assert.equal(autoBody.verifiedCount, 1, JSON.stringify(autoBody));
    assert.equal(autoBody.reviewCount, 4);
    assert.ok(autoBody.items.some(item => item.productCatalogId === autoNotFound.productCatalogId && item.reasons.includes('provider_product_not_found')));
    assert.ok(autoBody.items.some(item => item.productCatalogId === autoUnavailable.productCatalogId && item.reasons.includes('provider_unavailable')));
    assert.ok(autoBody.items.some(item => item.productCatalogId === autoTimeout.productCatalogId && item.reasons.includes('provider_timeout_or_network_error')));
    assert.equal(autoBody.activationChanged, false);
    assert.equal(autoBody.transactionCreated, false);

    const savedProgress=await db.query(
      'SELECT last_processed_product_catalog_id,pages_completed FROM country_operator_catalog_verification_progress WHERE operator_id=$1',
      [good.operatorId]);
    assert.equal(Number(savedProgress.rows[0].last_processed_product_catalog_id),Number(autoBody.nextAfterProductCatalogId));
    assert.equal(Number(savedProgress.rows[0].pages_completed),1);
    const staleCursor=await fetch(baseUrl + '/api/admin/country-operators/' + good.operatorId + '/catalog-auto-verify',{
      method:'POST',headers:{'content-type':'application/json','x-admin-api-key':adminKey},
      body:JSON.stringify({limit:25,afterProductCatalogId:0}),
    });
    assert.equal(staleCursor.status,409);
    assert.equal(Number((await staleCursor.json()).nextAfterProductCatalogId),Number(autoBody.nextAfterProductCatalogId));
    const autoState = await db.query(
      "SELECT m.verified_at,p.price_eur_cents,p.wholesale_price_eur_cents,p.active,m.active AS mapping_active,(SELECT COUNT(*)::int FROM catalog_verification_audit a WHERE a.operator_id=$1 AND a.product_catalog_id=$2 AND a.event_type='product_verified') AS verified_audits FROM country_operator_products m JOIN product_catalog p ON p.id=m.product_catalog_id WHERE m.product_catalog_id=$2",
      [good.operatorId, autoCandidate.productCatalogId],
    );
    assert.equal(autoState.rows[0].verified_audits, 1);
    assert.ok(autoState.rows[0].verified_at);
    assert.equal(autoState.rows[0].price_eur_cents, 350);
    assert.equal(autoState.rows[0].wholesale_price_eur_cents, 300);
    assert.equal(autoState.rows[0].active, false);
    assert.equal(autoState.rows[0].mapping_active, false);
    const autoMismatchState = await db.query(
      "SELECT m.verified_at,(SELECT COUNT(*)::int FROM catalog_verification_audit a WHERE a.operator_id=$1 AND a.product_catalog_id=$2 AND a.event_type='product_rejected') AS rejected_audits FROM country_operator_products m WHERE m.product_catalog_id=$2",
      [good.operatorId, autoMismatch.productCatalogId],
    );
    assert.equal(autoMismatchState.rows[0].verified_at, null);
    assert.equal(autoMismatchState.rows[0].rejected_audits, 1);

    const retryResponse = await fetch(baseUrl + '/api/admin/country-operators/' + good.operatorId + '/catalog-retry-reviewed', {
      method: 'POST', headers: {'content-type':'application/json','x-admin-api-key':adminKey},
      body: JSON.stringify({confirmRetry:true}),
    });
    assert.equal(retryResponse.status,200);
    const retryBody=await retryResponse.json();
    assert.equal(retryBody.retryQueued,true);
    assert.equal(retryBody.verificationStarted,false);
    assert.equal(retryBody.activationChanged,false);
    assert.equal(retryBody.transactionCreated,false);
    const retryAudit=await db.query(
      "SELECT COUNT(*)::int AS count FROM catalog_verification_audit WHERE operator_id=$1 AND event_type='product_retry_queued' AND product_catalog_id=$2",
      [good.operatorId,autoMismatch.productCatalogId]);
    assert.equal(retryAudit.rows[0].count,1);
    const retryRun=await fetch(baseUrl + '/api/admin/country-operators/' + good.operatorId + '/catalog-auto-verify',{
      method:'POST',headers:{'content-type':'application/json','x-admin-api-key':adminKey},
      body:JSON.stringify({limit:25}),
    });
    assert.equal(retryRun.status,200);
    const retryRunBody=await retryRun.json();
    assert.ok(retryRunBody.items.some(item=>item.productCatalogId===autoMismatch.productCatalogId));

    // A sample approval changed while the provider request was in flight must
    // invalidate the page before any verification audit, price, mapping or cursor write.
    const raceProduct = await db.query(
      "INSERT INTO product_catalog (country,operator,amount,currency,product_id,price_eur_cents,wholesale_price_eur_cents,active,updated_at) VALUES ('AF',$1,116,'AFN',2147483011,350,300,FALSE,NOW()) RETURNING id",
      [good.operatorName],
    );
    const raceCandidate = {operatorId:good.operatorId,productCatalogId:raceProduct.rows[0].id,
      productId:2147483011,operatorName:good.operatorName,amount:116};
    fixtures.push(raceCandidate);
    await db.query(
      'INSERT INTO country_operator_products (country_code,operator_key,product_catalog_id,active,verified_at) SELECT country_code,operator_key,$1,FALSE,NULL FROM country_operators WHERE id=$2',
      [raceCandidate.productCatalogId,good.operatorId],
    );
    providerProducts.set(String(raceCandidate.productId),
      providerProduct(raceCandidate.productId,'provider-operator-good',good.operatorName,raceCandidate.amount));
    providerMutations.set(String(raceCandidate.productId),{
      operatorId:good.operatorId,sampleProductCatalogId:mismatch.productCatalogId,
    });
    const progressBeforeRace = await db.query(
      'SELECT last_processed_product_catalog_id,pages_completed FROM country_operator_catalog_verification_progress WHERE operator_id=$1',
      [good.operatorId],
    );
    const raceResponse = await fetch(baseUrl + '/api/admin/country-operators/' + good.operatorId + '/catalog-auto-verify',{
      method:'POST',headers:{'content-type':'application/json','x-admin-api-key':adminKey},
      body:JSON.stringify({limit:25}),
    });
    assert.equal(raceResponse.status,409);
    assert.match((await raceResponse.json()).error,/approval or identity changed/);
    const raceState = await db.query(
      "SELECT m.verified_at,p.price_eur_cents,m.active,(SELECT COUNT(*)::int FROM catalog_verification_audit a WHERE a.operator_id=$1 AND a.product_catalog_id=$2 AND a.event_type IN ('product_verified','product_rejected')) AS audit_count,(SELECT last_processed_product_catalog_id FROM country_operator_catalog_verification_progress WHERE operator_id=$1) AS cursor,(SELECT pages_completed FROM country_operator_catalog_verification_progress WHERE operator_id=$1) AS pages FROM product_catalog p JOIN country_operator_products m ON m.product_catalog_id=p.id WHERE p.id=$2",
      [good.operatorId,raceCandidate.productCatalogId],
    );
    assert.equal(raceState.rows[0].verified_at,null);
    assert.equal(raceState.rows[0].price_eur_cents,350);
    assert.equal(raceState.rows[0].active,false);
    assert.equal(raceState.rows[0].audit_count,0);
    assert.equal(String(raceState.rows[0].cursor),String(progressBeforeRace.rows[0].last_processed_product_catalog_id));
    assert.equal(Number(raceState.rows[0].pages),Number(progressBeforeRace.rows[0].pages_completed));

    const duplicate = await fetch(baseUrl + '/api/admin/country-operators/' + good.operatorId + '/approve-sample', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-admin-api-key': adminKey },
      body: JSON.stringify({ productCatalogId: good.productCatalogId, confirmApproval: true }),
    });
    assert.equal(duplicate.status, 409);
    const duplicateCounts = await db.query(
      "SELECT (SELECT COUNT(*)::int FROM country_operator_approvals WHERE operator_id=$1 AND status='approved') AS approvals,(SELECT COUNT(*)::int FROM catalog_verification_audit WHERE operator_id=$1 AND event_type='sample_approved') AS audit_rows",
      [good.operatorId],
    );
    assert.equal(duplicateCounts.rows[0].approvals, 1);
    assert.equal(duplicateCounts.rows[0].audit_rows, 1);

    const mismatchResponse = await fetch(baseUrl + '/api/admin/country-operators/' + mismatch.operatorId + '/approve-sample', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-admin-api-key': adminKey },
      body: JSON.stringify({ productCatalogId: mismatch.productCatalogId, confirmApproval: true }),
    });
    assert.equal(mismatchResponse.status, 409);
    const mismatchState = await db.query(
      'SELECT (SELECT COUNT(*)::int FROM country_operator_approvals WHERE operator_id=$1) AS approvals,(SELECT COUNT(*)::int FROM catalog_verification_audit WHERE operator_id=$1 AND event_type=$2) AS audit_rows,(SELECT active FROM country_operators WHERE id=$1) AS operator_active,(SELECT active FROM product_catalog WHERE id=$3) AS product_active',
      [mismatch.operatorId, 'sample_approved', mismatch.productCatalogId],
    );
    assert.equal(mismatchState.rows[0].approvals, 0);
    assert.equal(mismatchState.rows[0].audit_rows, 0);
    assert.equal(mismatchState.rows[0].operator_active, false);
    assert.equal(mismatchState.rows[0].product_active, false);

    const rollbackResponse = await fetch(baseUrl + '/api/admin/country-operators/' + rollback.operatorId + '/approve-sample', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-admin-api-key': adminKey },
      body: JSON.stringify({ productCatalogId: rollback.productCatalogId, confirmApproval: true }),
    });
    assert.equal(rollbackResponse.status, 500);
    const rollbackState = await db.query(
      "SELECT (SELECT COUNT(*)::int FROM country_operator_approvals WHERE operator_id=$1) AS approvals,(SELECT COUNT(*)::int FROM catalog_verification_audit WHERE operator_id=$1) AS audit_rows,(SELECT provider_operator_id FROM country_operators WHERE id=$1) AS provider_operator_id,(SELECT verified_at FROM country_operators WHERE id=$1) AS operator_verified_at,(SELECT verified_at FROM country_operator_products WHERE country_code='AF' AND operator_key=(SELECT operator_key FROM country_operators WHERE id=$1)) AS mapping_verified_at,(SELECT price_eur_cents FROM product_catalog WHERE id=$2) AS retail_price",
      [rollback.operatorId, rollback.productCatalogId],
    );
    assert.equal(rollbackState.rows[0].approvals, 0);
    assert.equal(rollbackState.rows[0].audit_rows, 0);
    assert.equal(rollbackState.rows[0].provider_operator_id, null);
    assert.equal(rollbackState.rows[0].operator_verified_at, null);
    assert.equal(rollbackState.rows[0].mapping_verified_at, null);
    assert.equal(rollbackState.rows[0].retail_price, 350);
    // Operator-scoped batch preview is bounded, mapped-only, audited, and never activates.
    const previewGood = await fixture('preview-good', 2147483004, 104, null);
    const previewBadProduct = await db.query(
      "INSERT INTO product_catalog (country,operator,amount,currency,product_id,price_eur_cents,wholesale_price_eur_cents,active,updated_at) VALUES ('AF',$1,$2,'AFN',$3,350,300,FALSE,NOW()) RETURNING id",
      [previewGood.operatorName, 105, 2147483005],
    );
    const previewBad = {
      operatorId: previewGood.operatorId,
      productCatalogId: previewBadProduct.rows[0].id,
      productId: 2147483005,
      operatorName: previewGood.operatorName,
      amount: 105,
    };
    fixtures.push(previewBad);
    await db.query(
      'INSERT INTO country_operator_products (country_code,operator_key,product_catalog_id,active,verified_at) SELECT country_code,operator_key,$1,FALSE,NULL FROM country_operators WHERE id=$2',
      [previewBad.productCatalogId, previewGood.operatorId],
    );
    providerProducts.set(String(previewGood.productId),
      providerProduct(previewGood.productId, 'provider-operator-preview-good', previewGood.operatorName, previewGood.amount));
    providerProducts.set(String(previewBad.productId),
      providerProduct(previewBad.productId, 'provider-operator-preview-bad', 'A different operator', previewBad.amount));

    const previewNoFlag = await fetch(baseUrl + '/api/admin/country-operators/' + previewGood.operatorId + '/catalog-batch-preview', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-admin-api-key': adminKey },
      body: JSON.stringify({ productCatalogIds: [previewGood.productCatalogId], dryRun: false }),
    });
    assert.equal(previewNoFlag.status, 400);

    const tooMany = await fetch(baseUrl + '/api/admin/country-operators/' + previewGood.operatorId + '/catalog-batch-preview', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-admin-api-key': adminKey },
      body: JSON.stringify({ productCatalogIds: Array.from({ length: 26 }, (_, i) => i + 1), dryRun: true }),
    });
    assert.equal(tooMany.status, 400);

    const previewResponse = await fetch(baseUrl + '/api/admin/country-operators/' + previewGood.operatorId + '/catalog-batch-preview', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-admin-api-key': adminKey },
      body: JSON.stringify({
        productCatalogIds: [Number(previewGood.productCatalogId), Number(previewBad.productCatalogId)],
        dryRun: true,
      }),
    });
    assert.equal(previewResponse.status, 200);
    const previewBody = await previewResponse.json();
    assert.equal(previewBody.dryRun, true);
    assert.equal(previewBody.requestedCount, 2);
    assert.equal(previewBody.verifiedCount, 1);
    assert.equal(previewBody.rejectedCount, 1);
    assert.equal(previewBody.auditPersisted, true);
    assert.equal(previewBody.applyAvailable, false);
    assert.equal(previewBody.activationChanged, false);
    assert.equal(previewBody.transactionCreated, false);
    assert.equal(previewBody.items.find(item => item.productCatalogId === previewGood.productCatalogId).verified, true);
    assert.equal(previewBody.items.find(item => item.productCatalogId === previewBad.productCatalogId).verified, false);

    const previewState = await db.query(
      "SELECT (SELECT COUNT(*)::int FROM country_operator_approvals WHERE operator_id=$1) AS approvals,(SELECT COUNT(*)::int FROM catalog_verification_audit WHERE operator_id=$1 AND event_type='batch_previewed' AND outcome='preview') AS preview_audits,(SELECT bool_and(NOT active) FROM country_operators WHERE id=$1) AS operator_inactive,(SELECT bool_and(NOT p.active AND NOT m.active) FROM product_catalog p JOIN country_operator_products m ON m.product_catalog_id=p.id WHERE p.id=ANY($2::bigint[])) AS products_inactive",
      [previewGood.operatorId, [previewGood.productCatalogId, previewBad.productCatalogId]],
    );
    assert.equal(previewState.rows[0].approvals, 0);
    assert.equal(previewState.rows[0].preview_audits, 2);
    assert.equal(previewState.rows[0].operator_inactive, true);
    assert.equal(previewState.rows[0].products_inactive, true);

    assert.doesNotMatch(logs, /sk_live_/);
  } finally {
    if (child) {
      child.kill('SIGTERM');
      await Promise.race([
        new Promise(resolve => child.once('exit', resolve)),
        new Promise(resolve => setTimeout(resolve, 3000)),
      ]);
      if (child.exitCode === null) child.kill('SIGKILL');
    }
    if (triggerInstalled) {
      await db.query('DROP TRIGGER IF EXISTS ci_fail_country_approval_audit_trigger ON catalog_verification_audit');
      await db.query('DROP FUNCTION IF EXISTS ci_fail_country_approval_audit()');
    }
    for (const item of fixtures) {
      // Progress is tied to the current approval with ON DELETE RESTRICT;
      // remove the scoped cursor before deleting its approval fixture.
      await db.query('DELETE FROM country_operator_catalog_verification_progress WHERE operator_id=$1', [item.operatorId]);
      await db.query('DELETE FROM country_operator_approvals WHERE operator_id=$1', [item.operatorId]);
      await db.query('DELETE FROM catalog_verification_audit WHERE operator_id=$1', [item.operatorId]);
      await db.query('DELETE FROM country_operator_products WHERE product_catalog_id=$1', [item.productCatalogId]);
      await db.query('DELETE FROM product_catalog WHERE id=$1', [item.productCatalogId]);
    }
    for (const operatorId of [...new Set(fixtures.map(item => item.operatorId))]) {
      await db.query('DELETE FROM country_operators WHERE id=$1', [operatorId]);
    }
    await db.end();
    await new Promise(resolve => providerServer.close(resolve));
  }
});
