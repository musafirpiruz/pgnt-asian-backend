# Admin authentication and audit identity

Admin routes accept the existing `x-admin-api-key` header. To attribute sensitive actions to a real named administrator, configure one credential per administrator in the Render environment:

```text
ADMIN_API_KEYS_JSON={"owner-admin":"<at-least-32-character-random-secret>","support-admin":"<different-at-least-32-character-random-secret>"}
```

Each administrator enters their own secret in the existing Admin Panel key field. The server maps the credential to its stable admin ID; callers cannot choose an audit identity in a request header or body. Credential comparisons use constant-time byte comparisons. When `ADMIN_API_KEYS_JSON` is present it takes precedence over the legacy key.

Single-admin compatibility is available with both `ADMIN_API_KEY` and `ADMIN_ACTOR_ID`. A legacy key without an explicit actor ID fails closed, because writing a generic `admin-session` value would make the audit record misleading.

Keep secrets in Render environment variables, never in source control, the APK, browser storage, or logs. Use a different random secret for every administrator and rotate/revoke a person's key when their access ends. This mechanism names the credential principal; it does not prove which human physically used a shared credential, so administrators must not share keys.

FX approvals, network product approval batches, pricing policy drafts/approvals, and persisted pricing previews now record the authenticated actor ID. Approval remains separate from product activation and live price changes.
