# RCM Tours and Travels

React/Vite frontend and Express/Mongoose backend for customer, staff, and admin service-request workflows.

## Architecture

- `frontend/`: React, JavaScript/JSX, React Router, Tailwind, Lucide, and a shared credentialed API service.
- `backend/`: Express API, MongoDB persistence, Mongoose models, server-side cookie sessions, role authorization, validation, and security middleware.
- Request records, embedded quotations, notifications, service definitions, system settings, users, sessions, invitations, and security events are stored in MongoDB. The UI does not use seeded request/user/history data as a fallback.

## Local Setup

1. Install dependencies in `backend/` and `frontend/` using each package manager/lockfile.
2. Configure the private `backend/.env` with local `MONGODB_URI` and `CLIENT_ORIGIN=http://localhost:5173`. The MongoDB URI must include `replicaSet=rcmDevRs`; standalone MongoDB is refused because transactions are required. Follow the Windows service instructions in [backend/README.md](./backend/README.md#run-locally).
3. If no admin exists, create one from PowerShell in `backend/`: `$env:ADMIN_EMAIL='you@example.com'; npm run create-admin; Remove-Item Env:ADMIN_EMAIL`.
4. Start backend and frontend in separate PowerShell windows:
   ```powershell
   Set-Location F:\rcm-tours-and-travels-new\backend
   npm run dev
   ```
   ```powershell
   Set-Location F:\rcm-tours-and-travels-new\frontend
   npm run dev
   ```
5. Open `http://localhost:5173`. The frontend uses same-origin `/api` requests and Vite proxies them to `http://localhost:4000`; backend health is `http://localhost:4000/api/health`.

## Tests and Build

- Safe database-free backend checks: from `backend/`, set `NODE_ENV=test`, ensure `TEST_MONGODB_URI` and `ALLOW_DESTRUCTIVE_TESTS` are unset, then run `node --test tests\databaseSafety.test.js tests\mutationSafety.test.js tests\nodb.test.js` in PowerShell. These tests use mocks/temp directories and do not prove MongoDB isolation.
- The full backend `npm test` command includes destructive integration tests. Do not run it unless a disposable local replica-set database named exactly `rcm_test` is intentionally configured and verified; it clears collections.
- Frontend production build: `cd frontend` then `npm run build`.
- Request workflow transitions and payment mutations use MongoDB transactions, so the backend requires a supported MongoDB replica set or sharded cluster. Payment revision updates also use aggregation-pipeline updates (MongoDB 4.2+); use a currently supported MongoDB release. Database integration tests additionally require explicit `ALLOW_DESTRUCTIVE_TESTS=1` opt-in and `TEST_MONGODB_URI` pointing to a local disposable replica-set database named exactly `rcm_test`. The suite clears collections in that database and refuses remote hosts or lookalike names. Provision and verify it separately before enabling the opt-in.
- `/api/health` is a liveness check; `/api/ready` returns 503 while MongoDB is disconnected.

## Local Operation

- MongoDB transaction support remains enforced at startup. The local MongoDB Windows service must use the single-node `rcmDevRs` replica set; transaction workflows are not supported in standalone mode.
- Keep `backend/.env` and private upload directories out of source control. Local receipts/documents are stored under `backend/private-receipts` and `backend/private-documents`; these files remain on the PC between application restarts.
- `/api/health` is liveness; `/api/ready` reports MongoDB connectivity. Neither bypasses the replica-set startup check.

## Main Routes

- Public: `/`, `/signin`, `/register`
- Customer: `/portal`, `/portal/requests`, `/portal/requests/:id`, `/portal/new`, `/portal/notifications`, `/portal/profile`
- Staff: `/staff`, `/staff/requests`, `/staff/requests/:id`, `/staff/assigned`, `/staff/awaiting`, `/staff/quotations`, `/staff/new`
- Admin: `/admin`, `/admin/requests`, `/admin/assignment`, `/admin/users`, `/admin/staff`, `/admin/services`, `/admin/reports`, `/admin/logs`, `/admin/settings`

## Integrations Not Present

Customer supporting documents and staff-received files are uploaded to private backend storage. Email delivery and external payment processing are not configured. CSV export is generated from currently loaded authorized request records in the browser.
