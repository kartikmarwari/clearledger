# ClearLedger MVP — handoff

Open `clearledger-mvp.html` in a modern desktop browser. This single-file edition includes all assets and works without credentials. It uses fictional samples; its demo changes are stored only in that browser. A local file is not a public web link.

## Try the product

1. Open Northstar Labs from Overview and inspect the next action and history.
2. Edit its blocker, owner or promised payment date.
3. Record a partial payment; the remaining balance updates across the workspace.
4. Prepare a follow-up, edit the wording and save or copy it. Add a recipient email before opening your email app. Nothing sends automatically.
5. Open Import CSV, download the example, then upload it. Map columns and review accepted/rejected rows before importing.
6. Inspect the Action queue and Payment promises; download the Weekly review and invoice CSV.

## Implemented

- Six responsive workspace views: overview, invoices, actions, promises, review and settings.
- Invoice creation/editing, search, status filters, owners and explicit payment blockers.
- Partial payment recording with outstanding-balance validation.
- Currency-separated reporting for USD, GBP, EUR, INR, AUD and CAD. No implicit FX conversion.
- Contextual editable message templates, saved drafts, copy and mailto handoff.
- Timestamped activity history and notes.
- CSV parsing, column mapping, preview, validation, duplicate detection and import; CSV and report exports.
- Supabase email/password registration and sign-in, token refresh during a session, workspace creation, data loading and writes, and adding registered teammates.
- Database membership policies, constrained financial fields, atomic batch imports, version checks against conflicting edits, and server-created history timestamps.

## Connect Supabase later

1. Create a project you own. Keep the database password and service-role key private.
2. Run `backend/schema.sql` once in its SQL editor on a new database. The script creates organizations, memberships, invoices and restricted write functions in one transaction.
3. Put the project URL and public publishable/anon key in `dist/config.js`. These are the only browser configuration values needed. Never put service-role, payment or AI secrets here.
4. Enable email/password authentication; configure the application URL and email-confirmation redirects in Supabase. Set up a reliable auth email sender before inviting customers.
5. Host `dist/` over HTTPS. Open `app.html`, register, confirm your email, sign in, and create the company workspace.
6. A teammate registers and confirms their email without creating another workspace. The company owner then adds their email in Workspace settings.
7. Run acceptance checks with two separate companies before real customer use: each must see only its own invoices; cross-company read/write calls must fail; an out-of-date edit must fail rather than overwrite a newer change; a failing import batch must roll back.

Cloud mode does not load or upload the demo samples. Sessions stay in memory; refreshing the page requires signing in again. Sign-in recovery and self-service account deletion are not implemented in this release. Account recovery must be handled through the project owner's Supabase administration until the recovery flow is added and tested.

## What is still unconnected

The database schema and cloud client are implemented but have not been applied to or tested against a live Supabase project. This is an implementation handoff, not a claim of production verification. Live authentication, tenant-isolation tests, email-confirmation delivery and database backups need verification after account setup.

Payments are manual records, not verified bank receipts. AI, scheduled emails, automatic client-email sending, Stripe/Razorpay subscriptions, accounting integrations, legal pages and custom-domain setup are not enabled. They require the accounts or decisions you deferred. Message drafting currently uses deterministic templates. Reports distinguish current balances from all-time recorded payments; they do not claim a measured reduction in payment time.

The activity timeline is append-only through the supplied write function, but event descriptions can be supplied by authorized workspace members. It is an operational history, not a certified financial audit ledger. Owners and members currently share invoice editing rights. Owner-only membership removal and granular finance roles are follow-up work before larger-team rollout.

## Validation

Eleven automated checks cover financial validation, partial payments, CSV quoting and duplicate handling, priority scoring, message content, view rendering, detail forms, saved history and escaping customer-supplied markup. JavaScript syntax was checked. Rendering tests use a lightweight document harness, not a real browser; mobile appearance, email-app handoff and live services still need browser/live acceptance testing.

Source is in the supplied ZIP. Run `node --test tests/core.test.cjs tests/app.test.cjs` to repeat tests. Run `node package-demo.cjs` from the original workspace to regenerate the standalone demo. For other directories, adjust the output path in that script. No installation is required for the static app or tests.

The Supabase authorization approach follows its official [row-level security documentation](https://supabase.com/docs/guides/database/postgres/row-level-security) and [password-authentication documentation](https://supabase.com/docs/guides/auth/passwords).
