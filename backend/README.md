# RCM Travel and Tours API

Node 22+, Express 5, MongoDB (Mongoose 9). No new dependencies beyond the original package.json.

## Run locally
1. Install dependencies with `npm install` in `backend/` and `frontend/`.
2. Keep the local `.env` private. Its `MONGODB_URI` is configured for `127.0.0.1:27017` with `replicaSet=rcmDevRs`; `CLIENT_ORIGIN` should be `http://localhost:5173`.
3. This PC's MongoDB Server 8.2.6 is configured as the single-node replica set `rcmDevRs` and runs as the Windows service `MongoDB`. The active config is `C:\Program Files\MongoDB\Server\8.2\bin\mongod.cfg`, the existing data directory is `C:\Program Files\MongoDB\Server\8.2\data`, and MongoDB listens on `127.0.0.1:27017`. The replica set was initialized and verified as `PRIMARY`; its data directory, database contents, authentication, and loopback binding were preserved. A timestamped configuration backup is at `C:\Program Files\MongoDB\Server\8.2\bin\mongod.cfg.bak-20261028-125732`. Do not initialize the replica set again or reset/move the existing data.
   - To check or start the service, use `Get-Service MongoDB` or `Start-Service MongoDB` in PowerShell. Starting the service or changing its configuration may require an elevated PowerShell window.
   - In MongoDB Compass, connect to host `127.0.0.1`, port `27017`, replica set `rcmDevRs`, and database `rcm_dev`. Use the existing authentication settings if Compass requests credentials; do not put passwords in shell commands.
4. Create the first admin once if the database does not already have one. `create-admin` refuses if any admin exists and prompts for the password without echoing it. In local non-production mode it uses the same Google DNS resolver workaround as backend startup for MongoDB Atlas SRV lookup. Check that the `.env` targets the intended database before running it; the command does not print the URI or password:
   ```powershell
   $env:ADMIN_EMAIL = 'you@example.com'
   npm run create-admin
   Remove-Item Env:ADMIN_EMAIL
   ```
   To verify an existing production admin without changing data, use an authenticated, read-only MongoDB client and query `users` for `{ role: "admin" }`, projecting only `role` and `active`. Do not paste database URIs or credentials into shared terminals or chat. The script intentionally stops when an administrator already exists; it does not reset or reveal an account password.
5. Start the backend and frontend in separate PowerShell windows:
   ```powershell
   Set-Location F:\rcm-tours-and-travels-new\backend
   npm run dev
   ```
   ```powershell
   Set-Location F:\rcm-tours-and-travels-new\frontend
   npm run dev
   ```
   Open `http://localhost:5173`; Vite proxies `/api` requests to `http://localhost:4000`. Backend health is `http://localhost:4000/api/health`.
6. MongoDB Shell (`mongosh`) is not installed as a standalone command on this PC. It is not required for normal local operation; the backend's driver connection and transaction workflow have been verified against the replica set. If you need shell administration, use the official MongoDB Shell distribution and enter any password only at a secure prompt.

## Tests
- Safe database-free checks (PowerShell, from `backend/`): set `$env:NODE_ENV = "test"`, remove `TEST_MONGODB_URI` and `ALLOW_DESTRUCTIVE_TESTS` from that shell, then run `node --test tests\databaseSafety.test.js tests\mutationSafety.test.js tests\nodb.test.js`. They use mocks/temp directories and do not prove MongoDB isolation.
- `npm test` includes `db.test.js`, which deletes test collections if `TEST_MONGODB_URI` is present. Do not run that suite unless a disposable local replica-set database named exactly `rcm_test` is intentionally configured, verified, and `ALLOW_DESTRUCTIVE_TESTS=1` is set in the same shell.
- Request workflow transitions and payment mutations use MongoDB transactions and therefore require a supported replica set or sharded cluster. Payment revision updates use aggregation-pipeline updates (MongoDB 4.2+); use a currently supported MongoDB release. For full tests, provision a separate local replica-set database named exactly `rcm_test`, independently confirm its identity with `mongosh "$env:TEST_MONGODB_URI" --quiet --eval 'db.getName()'`, then set `ALLOW_DESTRUCTIVE_TESTS=1` and `TEST_MONGODB_URI` in the same PowerShell session and run `npm test`. The suite clears collections in that database and refuses remote hosts or lookalike names. Never use an operational database. Database-free guard tests run without either variable.

## Implemented
The API includes Helmet, single-origin CORS, rate limits, CSRF origin and content-type checks, NoSQL operator rejection, safe errors, server-side sessions, login lockout, invitation-based staff registration, and security-event logging.

`GET /api/health` is a liveness check and stays available while MongoDB is disconnected. `GET /api/ready` returns 503 until Mongoose has an active connection; use it for traffic readiness checks.

Request data and workflow actions are stored in MongoDB. Authenticated customers can create, list, and read their own requests, reply to staff, respond to a valid sent quotation, and cancel eligible requests. Staff/admin can process authorized requests, send replies, update status, assign active staff, update permitted checklists, save/send quotations, and write private notes. Customer responses never contain internal notes.

Customers activate a passwordless walk-in record by requesting a six-digit code at registration with the recorded email. The code expires after 10 minutes, is stored as a hash, allows at most five attempts, and can be resent once per minute. Successful activation sets the password on the existing customer record, preserving its ID and request history. Email is sent through Gmail SMTP using Nodemailer. Configure the SMTP variables below with a Google App Password (never an ordinary Gmail password). If configuration is missing or delivery fails, the API does not claim that an email was sent.

New customer registrations require a separate single-use, 24-hour email verification link before login. Tokens are stored as hashes; resend responses do not disclose whether an account exists and are limited per account and per IP. Existing accounts (including administrators and staff) remain verified by the schema default; newly activated walk-in customers are verified because their activation code proves control of the email address. Staff registration remains invitation-only and is not forced through the customer verification gate.

For Gmail, set these in `backend/.env`: `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=465`, `SMTP_SECURE=true`, `SMTP_USER=your-sender@gmail.com`, `SMTP_PASS=your-16-character-google-app-password`, and `EMAIL_FROM=your-sender@gmail.com`. Enable Google 2-Step Verification, create an App Password for this project, restart the backend, then request a code and check the sender account's delivery logs and recipient inbox/spam folder. Never commit `.env` or share the App Password. `backend/.env.example` contains placeholders only.

From the `backend` directory, run `npm run test:email -- recipient@example.com` in development to verify SMTP authentication and send a harmless test message. The command refuses to run when `NODE_ENV=production`, includes no activation code, and reports only safe transport diagnostics. A successful SMTP result means Gmail accepted the message for delivery; it does not guarantee inbox placement. No real SMTP credentials are included in the test suite.

Additional endpoints support self-profile updates (`PATCH /api/users/me`), authorized user directories/admin account controls (`GET /api/users/directory`, `GET /api/users`, `PATCH /api/users/:id/active`, `PATCH /api/users/:id/assignment-permission`), recipient-scoped in-app notifications, a persisted service catalog (`GET /api/services`, authenticated `GET /api/services/workspace`, admin `GET /api/services/admin`, `PUT/DELETE /api/services/:id`), public configuration (`GET /api/settings`, admin `PATCH /api/settings`), and admin-only persisted activity history (`GET /api/audit-events`). Audit records are generated by backend operations, preserve the actor-role snapshot, classify business and security events, and support `page`, `limit`, `search`, `role`, `category`, and `outcome` query filters. Important request/payment mutations write their audit event within the same MongoDB transaction. The endpoint is read-only; audit records cannot be changed through the public API. Default service catalog records are initialized idempotently; existing service records are never overwritten at startup. Staff invitations remain admin-only and single-use.

Manual payments are recorded in the `Payment` collection. Customers can report Cash, Bank Transfer, or GCash only when an admin enables that method and provides its actual instructions under Admin → System Settings. Only one report per request may be pending verification at a time; after staff reject it, the customer may submit a corrected report, and after a partial verification they may report another installment for the remaining balance. Staff review submitted reports in Payment Management. Cash received in person is recorded from Payment Management only; quotation editing and sending do not create or verify payments. Transfer and GCash reports require a JPEG, PNG, or PDF receipt (maximum 3 MB); files are signature-checked and kept outside the public static directory at `backend/private-receipts`. Receipt routes enforce customer ownership and staff request access. Keep this directory on a persistent private disk, include it in encrypted backups, and do not expose it through a web server. Ephemeral or multi-instance deployments need a persistent shared private volume before accepting receipt uploads.

Receipt files are written once before the retryable MongoDB payment transaction. Transaction errors are not followed by immediate file deletion because the commit outcome can be ambiguous. On startup and hourly, the backend removes UUID-named receipt files older than 24 hours that have no matching payment record; failed cleanup is logged and retried on a later sweep. This recovers files orphaned by process crashes or aborted transactions, but is not an atomic filesystem/database commit and does not replace persistent storage or backups.

The receipt recovery sweep runs only while MongoDB is ready, rejects symlinked storage directories and non-UUID candidates, skips active uploads and files newer than 24 hours, checks database references before deletion, and coordinates instances through a six-hour lease in `maintenanceLocks`. If MongoDB or a reference query is unavailable, the sweep deletes nothing. A crash can leave a receipt retained until it is old enough for a later successful hourly sweep; an ambiguous upload commit deliberately retains the file. The database lease and actual filesystem/database coordination still require deployment integration verification.

Request documents are signature-checked, stored outside the public directory at `backend/private-documents`, and limited to 20 files and 100 MiB total per request (20 MiB per file). File bytes are written outside the retryable transaction; the request document metadata and audit event are committed together. A failed or ambiguous transaction does not trigger deletion when its commit outcome may be unknown. Unlike receipts, request-document orphan files do not currently have an automatic recovery sweep. Payment receipts are limited to 20 files and 30 MiB total per request (3 MiB per file). These are application limits, not environment settings. Both directories need persistent private storage and inclusion in encrypted backups; confirm volume capacity, persistence, and backup recovery for the selected host before accepting uploads.

## Local Configuration

The backend requires `MONGODB_URI` and `CLIENT_ORIGIN`. For local use, the API defaults to port `4000`, and Vite serves the frontend on port `5173` and proxies `/api` to the backend. Optional local settings include `PORT`, `TRUST_PROXY` (normally unset/zero), and `COOKIE_DOMAIN` (normally unset). Session/rate settings are `SESSION_IDLE_MINUTES`, `SESSION_ABSOLUTE_HOURS`, `CUSTOMER_KEY_DAYS`, `STAFF_KEY_HOURS`, `AUTH_RATE_MAX`, `MAX_FAILED_LOGINS`, and `LOCKOUT_MINUTES`. Email uses `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, and `EMAIL_FROM`; keep these values private and verify SMTP delivery with `npm run test:email -- recipient@example.com` before enabling customer registration.

For Cloudflare Pages production, set the Pages environment variable `API_ORIGIN=https://rcm-tours-and-travels.onrender.com`. Leave `VITE_API_URL` unset so browser requests use the same-origin `/api` Pages Function proxy. Set the Render backend's `CLIENT_ORIGIN=https://rcm-tours-and-travels.pages.dev`, `COOKIE_SAME_SITE=lax`, and `COOKIE_DOMAIN` unset. The proxy keeps the existing `HttpOnly`, `Secure`, host-only session cookie first-party on mobile browsers; CORS and the origin/JSON CSRF guard still apply to the Pages origin. Add the deployed custom domain to both values if the site uses one. No token, password, or SMTP credential belongs in the frontend environment.

Local MongoDB must run as the `rcmDevRs` single-node replica set. A standalone server is intentionally rejected. The `Payment` schema enforces globally unique nonempty transaction references per payment method. A read-only check on this PC's current development database found the new unique index already present and zero duplicate `(method, transactionReference)` groups; the former request-scoped unique index is also still present. No index migration was run.

The frontend API uses same-origin `/api` paths and the Vite development proxy targets `http://localhost:4000`. Session cookies are sent with credentials. `/api/health` is liveness; `/api/ready` checks MongoDB connection readiness. Startup rejects MongoDB topologies without transaction support, and SIGINT/SIGTERM handling attempts graceful server and database shutdown. Keep the local database and both private storage directories on disk; do not delete, reset, or relocate the existing database files during replica-set setup.

The local replica set is enabled. Continue to smoke-test customer, staff, and admin sign-in and workflows locally, including authorization boundaries, request updates, payment reporting/verification, receipts, and private documents. MongoDB integration tests require a separate disposable database and must never target `rcm_dev`.

Payment reports remain pending until staff verifies them. Staff can record cash only after receiving it. Only verified amounts reduce the balance; quotation, request, and payment statuses remain separate. No funds are moved or verified by an external payment service.

Service definitions are stored in MongoDB and drive request field validation, permitted checklist entries, and quotation eligibility. Existing service records are preserved at startup. The one-time `node scripts/updateDocumentService.js` migration enables quotations for the existing Document Assistance service and updates its form definition. System settings persist public company details, payment instructions, and the customer-registration switch. Security-event responses omit email addresses, IP addresses, hashes, and secrets.

## Main endpoints
- Auth: `POST /api/auth/login|register|logout|verify-email|resend-verification`, `POST /api/auth/activation-code`, `GET /api/auth/me`
- Invitations: `POST/GET /api/invitations`, `DELETE /api/invitations/:id`
- Requests: `GET/POST /api/requests`, `GET /api/requests/:id`, `PATCH /api/requests/:id/status|assignment|checklist`, `POST /api/requests/:id/messages|notes|cancel`, and quotation `PUT/POST` actions under `/api/requests/:id/quotation`
- Users: `GET /api/users`, `GET /api/users/directory`, `PATCH /api/users/me`, `PATCH /api/users/:id/active`, `PATCH /api/users/:id/assignment-permission`
- Notifications: `GET /api/notifications`, `PATCH /api/notifications/:id/read`, `PATCH /api/notifications/read-all`
- Services/settings/audit: `GET /api/services`, `GET /api/services/admin`, `PUT/DELETE /api/services/:id`, `GET/PATCH /api/settings`, `GET /api/audit-events`
- Payments: customer `GET/POST /api/payments`; staff/admin `GET /api/payments`, `POST /api/payments/cash`, `PATCH /api/payments/:id/verification`; authorized receipt download `GET /api/payments/:id/receipt`
