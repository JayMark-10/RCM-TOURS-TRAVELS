# RCM Tours and Travels — Readiness Review

Review date: 2026-10-28
Scope: current backend/frontend source, transaction and upload paths, configuration, tests, and deployment documentation. No `.env` values, private uploads, or production data were accessed. No MongoDB connection or destructive test was run.

## Current Implementation

- The frontend is React/Vite with protected customer, staff, and admin workspaces. Auth state is restored from the server session; a temporary API failure is shown as a retryable connection error rather than treated as logout. Logout is confirmed by the API before local navigation. The shared API client uses `VITE_API_URL` when provided and otherwise uses relative `/api` URLs.
- Request status, assignment, messaging, quotation, cancellation, notes, checklist, creation, and document metadata/audit mutations use MongoDB transactions where they write related request and audit/notification records. Stale request updates use compare filters and return a conflict.
- Receipt report, verification, and cash mutations serialize on the Request record, calculate payment amounts in integer cents, and commit payment/audit changes in transactions. Receipt transaction references have a unique nonempty index scoped globally per payment method.
- Payment serialization uses MongoDB aggregation-pipeline updates (MongoDB 4.2+); use a currently supported MongoDB release.
- Receipt file writes happen once, outside retryable callbacks. Recovery is conservative: UUID-only names, private non-symlink directory checks, age threshold, active-operation guard, reference queries, bounded batches, and a cross-instance lease. If MongoDB/reference status is unavailable or ambiguous, the sweep deletes nothing.
- Request document upload authorization runs before its large JSON parser. File bytes remain outside the transaction; RequestFile metadata, the request filename update, and the audit record commit together. Ambiguous outcomes retain the file rather than risk deleting one referenced by a committed record.
- Startup validates configuration and MongoDB transaction topology. `/api/health` is liveness; `/api/ready` reports MongoDB readiness. SIGINT/SIGTERM handlers attempt graceful HTTP and MongoDB shutdown.

## Verified Locally

- Backend: with `NODE_ENV=test`, `TEST_MONGODB_URI` and `ALLOW_DESTRUCTIVE_TESTS` removed from the process environment, `npm test` completed with 43 passed, 0 failed, and 29 skipped. The skips are the MongoDB integration tests in `db.test.js`; no database connection was made.
- Syntax: `node --check` passed for all 14 changed backend JavaScript files.
- Frontend: `npm run build` passed. Vite emitted an 832.09 kB minified JavaScript chunk warning (240.35 kB gzip).
- Database-free mocks do not prove transaction isolation or deployed index state.

No MongoDB integration suite, live HTTP/deployment test, SMTP delivery test, browser role workflow, or production infrastructure check was run. MongoDB tests in `backend/tests/db.test.js` clear collections and were intentionally not executed.

## Deployment Blockers and Risks

### Database behavior not verified

- Provide a TLS-enabled replica set or sharded MongoDB cluster and verify transaction behavior under concurrent requests.
- Before rollout, find duplicate nonempty `(method, transactionReference)` values, create the unique partial index declared by `backend/models/Payment.js`, and retire the former request-scoped index. A schema declaration does not prove that the production database has the required index.
- Verify database-user permissions for application collections and the `maintenanceLocks` recovery lease. Run migration and concurrency integration tests against a separately provisioned disposable replica-set database.

### Filesystem and operations

- Use persistent, private, shared storage for `private-documents` and `private-receipts` in multi-instance deployments. Include both directories with MongoDB in encrypted, access-restricted backups; rehearse a paired restore in isolation.
- Receipt orphan recovery waits at least 24 hours and runs hourly. It is not an atomic filesystem/database commit, and ambiguous receipt uploads are retained for safety. Request-document orphan files do not currently have an automatic recovery sweep. Monitor storage capacity and define manual reconciliation for retained/orphaned files.
- HTTPS, exact production CORS origin, secure cookie behavior, trusted proxy hop count, host firewall/database allowlist, and frontend SPA fallback must be configured and verified on the selected host.
- No automated backup/restore procedure or external payment processor is provided. Email activation depends on separately configured SMTP.

### Required release checks

1. Complete the payment-reference index migration after duplicate preflight.
2. Verify transaction/topology and concurrent payment/request behavior against disposable replica-set integration tests.
3. Configure and test persistent private storage, backups, and isolated restore.
4. Configure HTTPS, CORS, cookies, proxy trust, frontend SPA fallback, and liveness/readiness routing.
5. Run customer, staff, and admin browser smoke tests, including ownership denials, payment verification, receipt download, document access, and logout.

This review does not certify production readiness or deployment.
