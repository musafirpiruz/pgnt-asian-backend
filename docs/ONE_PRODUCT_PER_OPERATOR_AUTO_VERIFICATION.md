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

## Current implementation status

This document records the approved product behavior and acceptance criteria. It does not claim the automation or admin UI has been implemented. PR #225 remains the draft integration foundation; production database, deployment, and product activation remain untouched.
