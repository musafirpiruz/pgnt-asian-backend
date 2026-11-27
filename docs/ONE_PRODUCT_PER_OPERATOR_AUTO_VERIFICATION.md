# One-Product-per-Operator Approval and Automated Catalog Verification

## Product decision

The owner should not have to approve every denomination in the 1,960-row catalog. The intended workflow is:

1. For each country/operator pair, the owner approves **one representative product** once in the admin panel. The sample must be a real DT One catalog product with an exact provider product ID, operator identity, destination currency, denomination/type, and current wholesale price.
2. That approval verifies the operator identity and the mapping process for that operator. It does **not** blindly approve every other product or denomination.
3. The backend automatically checks the remaining catalog rows against the authoritative DT One catalog/API and stored provider data. A row can be marked auto-verified only when all required fields match exactly and the source is authoritative and current.
4. Eligible rows may be staged as verified, but stay inactive until the country/operator/product activation gates and sandbox acceptance are satisfied.
5. Any missing, stale, conflicting, duplicate, ambiguous, or changed provider identity/price/currency/denomination goes to a small admin review queue. The owner only needs to decide exceptions, not repeat routine approvals.

## Exact automatic checks for every product

- DT One provider product ID exists and belongs to the expected provider operator and country.
- Destination currency exactly matches the canonical country currency (AFN, PKR, INR, or BDT).
- Product type is supported and denomination/range rules match the authoritative DT One product.
- Wholesale cost is obtained from the provider's current authoritative pricing response; never inferred from FX or a retail price.
- Provider product/operator IDs are unique in their proper scope.
- Catalog response freshness and provider environment are recorded.
- Repeated syncs are idempotent and do not overwrite a manually reviewed mapping without recording a change.
- A change in provider identity, currency, denomination, product type, or wholesale cost beyond configured tolerance invalidates auto-verification and sends the row back to review.

## Approval and safety model

- One representative product approval is required for each operator in each country. It cannot approve a different operator or country.
- Product-level checks remain mandatory; operator approval is not a blanket approval of unrelated provider product IDs.
- Separate states: candidate -> auto_checked/manual_review -> verified -> sandbox_accepted -> active.
- Auto-verification never activates a country, operator, product, checkout, payment, or DT One fulfillment by itself.
- No production activation or migration is authorized by this document.
- All manual approvals and automatic decisions record actor/source, timestamp, provider response reference, catalog version, and reason.
- Admin endpoints must use the repository's existing authenticated admin mechanism and least privilege; never add a weaker alternate auth path.
- Failed or ambiguous checks fail closed and remain inactive.

## Admin experience

- Show one representative product per operator as the main approval task.
- After approval, show automatic catalog-sync progress and a compact exception list.
- Group exceptions by country/operator and explain the exact mismatch; provide retry after provider catalog refresh.
- Do not ask the owner to approve every denomination individually.
- Provide a clear count of auto-verified, awaiting review, rejected, and inactive products.

## Required tests before merge

- One approved sample unlocks only the same country/operator's verification pipeline.
- A second valid denomination with an authoritative matching DT One product record is auto-verified without another owner action.
- Similar display names, guessed IDs, wrong country/operator, wrong currency, wrong denomination/type, stale pricing, duplicate provider IDs, and missing wholesale cost are rejected or queued.
- Provider catalog changes revoke auto-verification and create an auditable review item.
- Auto-verification never sets active=true.
- Unauthorized admin requests are rejected.
- Quote and checkout use the same unique verified mapping.
- All tests, syntax, and dependency security checks pass on the exact commit.

## Current implementation status (2026-11-18)

PR #249 now contains:
- One owner-approved representative sample per operator, with exact DT One detail validation and persisted approval/audit evidence.
- An authenticated `POST /api/admin/country-operators/:operatorId/catalog-auto-verify` endpoint. It requires exactly one current approved sample, uses its provider operator ID as the exact identity anchor, and processes a bounded page of up to 25 remaining inactive/unverified mapped products.
- Each candidate is fetched by its exact DT One product ID. The evaluator checks exact product ID, country, operator name, provider operator ID against the approved sample, currency, supported product type, denomination, and positive retail/wholesale prices explicitly denominated in EUR.
- Successful rows receive technical mapping verification timestamps and refreshed EUR price evidence. Mismatches/provider failures are audited as rejected/review outcomes. The endpoint returns a cursor for the next page.
- Technical verification does not activate countries, operators, mappings, or products and does not create payment, order, or top-up transactions.
- PostgreSQL-backed HTTP tests cover successful automatic verification of a second product without a second owner approval, rejection of a different provider operator ID despite a matching display name, authentication, and the requirement for a prior approved sample.

The Admin Panel now includes an authenticated operator overview, per-network sample selection/approval, bounded automatic verification controls (up to 25 products per click), and verified/pending/review/active counts. It displays per-product reason codes and checks that the API explicitly reports no activation or transaction changes. PostgreSQL HTTP tests cover the operator overview counts before/after approval and the sample-to-second-product verification flow; a static test parses the Admin Panel inline JavaScript. Earlier baseline CI passed on commit `a1150873ce596946aaa3f42eb9ad05b3da4b3e5d` (324 tests, 0 failures). Since then, durable server-side cursor recovery has been added; the Admin Panel resumes from the saved cursor after reload. Owner-confirmed retry of rejected inactive products now rewinds the cursor without starting verification, records a `product_retry_queued` append-only audit event, and requires a separate explicit verification action. Cursor advancement and audit evidence are committed atomically; stale/concurrent pages are rejected. Migration 025 creates the progress table and extends the audit event constraint. Syntax checks passed on intermediate commits, but the latest head's CI is still running; do not merge until tests finish successfully on the exact latest head. Remaining before merge: HTTP integration coverage now exercises provider 404 and 503 outcomes, confirms they remain review-only, and verifies owner-confirmed retry is audited and does not start automatically. Remaining: timeout-specific integration coverage, staging database UI validation, and per-admin identity/RBAC. Latest test run must finish on the exact current head before merge. Four-country live product/price verification and international calling remain separate outstanding work. PR #225 remains the draft integration foundation; production database, deployment, and product activation remain untouched.
