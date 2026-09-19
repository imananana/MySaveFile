# Deployment Reference

## Live URL
- **Primary:** https://mysavefile.com  (and https://www.mysavefile.com)
- **Railway origin** (still resolves, used as the CNAME target): https://sims-save-file-planner-production.up.railway.app

Custom domain went live 2026-06-03. See "Custom domain & DNS" below.

---

## Services

### Railway (hosting + database)
- Platform: railway.app
- Plan: Hobby ($5/month)
- App service: runs the Express server + serves the React frontend
- Postgres service: managed PostgreSQL database, auto-injects `DATABASE_URL`
- Start command: `cd server && npx tsx src/index.ts`
- Build command: `vite build && cd server && npm install`
- Public HTTP port: **8080** (`process.env.PORT`). `app.set('trust proxy', 1)` is set so per-IP rate limiting keys on the real client IP behind Railway's proxy.

### Custom domain & DNS (Cloudflare)
- Registrar **and** DNS host: **Cloudflare** (domain `mysavefile.com`). DNS is managed entirely in Cloudflare — not GoDaddy, and records are **DNS-only (grey cloud)**, not proxied.
- **Web (Railway custom domains):** both `mysavefile.com` and `www.mysavefile.com` are added in Railway → Settings → Networking (target port 8080). Each needs:
  - a **CNAME** in Cloudflare → the Railway target (apex `@` uses Cloudflare CNAME-flattening; `www` is a normal CNAME), grey cloud
  - a **TXT `_railway-verify`** record (Railway ownership check; required for the apex)
  - Railway auto-issues TLS once DNS resolves. Because records are DNS-only, Cloudflare's SSL/TLS mode is irrelevant (Railway terminates TLS).
- ⚠️ **Do not delete-and-re-add** a Railway custom domain to "fix" it — Railway may issue a fresh `_railway-verify`/CNAME target, forcing new Cloudflare records. Use the edit/re-save nudge instead.

### Resend (transactional email — password reset)
- Console: resend.com
- Verified sending domain: **subdomain** `mail.mysavefile.com` (subdomain isolates root-domain reputation). DNS records (DKIM TXT, SPF TXT, MX, optional DMARC) were added via Resend's Cloudflare integration.
- Click tracking is **disabled** so password-reset links aren't rewritten through a tracking redirect.
- From address: `noreply@mail.mysavefile.com` → env var `EMAIL_FROM`.
- API key: Resend → API Keys (Sending-access scope is enough). Wrapper: `server/src/lib/email.ts` — gated on `RESEND_API_KEY`; if unset it console-logs the email instead of sending (safe local-dev fallback). Sends to arbitrary recipients require the domain to be **Verified** in Resend.
- **DMARC (deliverability):** Resend's integration does NOT add DMARC (it's optional there). It was added manually in Cloudflare as `_dmarc.mysavefile.com` TXT `v=DMARC1; p=none;`. **This was the fix that moved reset emails out of spam into the inbox** — DKIM + SPF alone weren't enough; Gmail favours senders with a DMARC record. Don't remove it.

### Cloudflare Email Routing (inbound — privacy@mysavefile.com)
- The contact address in the legal pages (`privacy@mysavefile.com`) receives via **Cloudflare → Email → Email Routing**, forwarding to the owner's Gmail. There's also a catch-all rule forwarding any `@mysavefile.com` address.
- Enabling it adds root `mysavefile.com` MX records (`route1/2/3.mx.cloudflare.net`) + a root SPF TXT. **No conflict with Resend** — Resend sends from the `send.mail.mysavefile.com` subdomain (different hostname); inbound receiving is on the root.
- ⚠️ A destination address must be **verified** (click the Cloudflare confirmation email) before forwarding works.
- Forwarded mail often lands in Gmail spam (forwarding breaks the original sender's SPF). Low stakes for this occasional inbox — mark Not Spam / add a Gmail filter. This does NOT affect outbound product email (Resend), which is the path that matters.

### Cloudflare R2 (photo storage)
- Bucket: `sims-save-file-planner`
- Public URL: see `VITE_PHOTO_BASE_URL` in Railway variables
- API tokens: managed at Cloudflare dashboard → R2 → Manage R2 API Tokens
- **The app uses S3-compatible credentials** (Access Key ID + Secret Access Key) — create these from **R2 → Manage R2 API Tokens** (its result screen shows the S3 keys). The *generic* account API-tokens page only emits a bearer token and is the wrong page.
- Current prod token: **`railway-prod`** — least-privilege: scoped to the `sims-save-file-planner` bucket only, **Object Read & Write**, no expiration. (Rotated 2026-06-03 after old keys were exposed; the prior `R2 Account Token` and the Admin/all-buckets `sims-planner-r2` were revoked.)
- **Rotation order:** create new token → update Railway `R2_ACCESS_KEY`/`R2_SECRET_KEY` → verify an upload works on the live site → *then* revoke the old token. `R2_ACCOUNT_ID` and `R2_BUCKET` don't change on rotation.

### Google OAuth
- Console: console.cloud.google.com
- Authorized redirect URI: `https://mysavefile.com/api/auth/google/callback`
- Credentials: stored in Railway variables and server/.env
- ⚠️ **After the custom-domain move, the redirect URI + `GOOGLE_CALLBACK_URL` must use `mysavefile.com`.** If the callback still points at the `up.railway.app` origin, the auth cookie gets set on that domain and won't apply to `mysavefile.com`, so Google sign-in silently fails on the custom domain. Keep the old railway.app URI in Google Console too if you still use that origin.

### Sentry (error reporting)
- Console: sentry.io
- Two projects in the same org:
  - **React** project — DSN goes into `VITE_SENTRY_DSN` (frontend errors)
  - **Node.js** project — DSN goes into `SENTRY_DSN` (server errors)
- Both DSNs are optional. If unset, Sentry is a silent no-op (safe for local dev).
- `tracesSampleRate` is 0 — only errors are reported, no performance/transaction data.
  Toggle in `src/lib/sentry.ts` (frontend) / `server/src/instrument.ts` (backend) if you ever want performance monitoring.
- **Pre-launch operational checklist:**
  - [ ] **G1 — Confirm DSNs are live.** Set `SENTRY_DSN` + `VITE_SENTRY_DSN` in Railway prod (`VITE_*` is build-time → redeploy after changing). Verify:
    - Server: deploy logs print `[sentry] server monitoring enabled (env=production)`.
    - Browser: prod console shows `[sentry] browser monitoring enabled (env=production)`.
    - End-to-end: throw a test error and confirm it lands in Sentry.
  - [ ] **G2 — Source maps.** Plumbing is wired in `vite.config.ts`, gated on `SENTRY_AUTH_TOKEN`. To enable readable prod stack traces, set `SENTRY_AUTH_TOKEN` + `SENTRY_ORG` + `SENTRY_PROJECT` (browser project slug) in the Railway **build** env. The build then emits hidden source maps, uploads them, and deletes them locally (never served publicly). Without the token the build runs unchanged (no maps, no upload).
  - [ ] **G3 — Alert rule.** In Sentry → Alerts → Create Alert → "Number of errors" spike → notify email/Slack, so crashes surface before users report them.

---

## Environment Variables

### Railway (app service variables)
| Variable | Description |
|---|---|
| `DATABASE_URL` | Auto-injected by Railway Postgres service (use `${{Postgres.DATABASE_URL}}`) |
| `NODE_ENV` | `production` |
| `JWT_SECRET` | Secret for signing JWT tokens |
| `SESSION_SECRET` | Secret for Express sessions |
| `GOOGLE_CLIENT_ID` | From Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | From Google Cloud Console |
| `GOOGLE_CALLBACK_URL` | `https://mysavefile.com/api/auth/google/callback` (must match Google Console + the live domain) |
| `CLIENT_URL` | `https://mysavefile.com` — drives reset-link URLs and the OAuth post-login redirect |
| `RESEND_API_KEY` | Resend sending key. If unset, email is console-logged (no send) — see `server/src/lib/email.ts` |
| `EMAIL_FROM` | `MySaveFile <noreply@mail.mysavefile.com>` — the display name is what recipients see as the sender, and the address MUST be on the Resend-verified domain or sends are rejected |
| `R2_ACCOUNT_ID` | Cloudflare Account ID (from dashboard homepage sidebar) |
| `R2_ACCESS_KEY` | R2 API token Access Key ID (from R2 → Manage R2 API Tokens; current token `railway-prod`) |
| `R2_SECRET_KEY` | R2 API token Secret Access Key |
| `R2_BUCKET` | `sims-save-file-planner` |
| `VITE_PHOTO_BASE_URL` | R2 public bucket URL (e.g. `https://pub-xxxx.r2.dev`) |
| `SENTRY_DSN` | Server-side Sentry DSN (Node.js project). If unset, Sentry is a no-op |
| `VITE_SENTRY_DSN` | Client-side Sentry DSN (React project). `VITE_*` is baked at build time, so changes require a redeploy |
| `SENTRY_AUTH_TOKEN` | (Optional, G2) Org auth token w/ `project:releases` scope. If set at build time, source maps upload to Sentry; if unset, the build runs unchanged |
| `SENTRY_ORG` | (Optional, G2) Sentry org slug — only needed when `SENTRY_AUTH_TOKEN` is set |
| `SENTRY_PROJECT` | (Optional, G2) Sentry project slug for the browser app — only needed when `SENTRY_AUTH_TOKEN` is set |

### Local dev (server/.env)
Same variables but with local values:
- `DATABASE_URL=postgresql://localhost:5432/sims_planner`
- `GOOGLE_CALLBACK_URL=http://localhost:3001/api/auth/google/callback`
- `CLIENT_URL=http://localhost:5173`
- `PORT=3001`
- `RESEND_API_KEY` / `EMAIL_FROM`: leave **unset** locally — `email.ts` falls back to printing the email (incl. the reset link) to the server console, so the reset flow is fully testable without sending real mail.

### Local dev (root .env)
- `VITE_PHOTO_BASE_URL=https://pub-xxxx.r2.dev` (same R2 URL as production)

---

## How to deploy changes
Just push to `main` on GitHub — Railway auto-deploys on every push.

## How to redeploy without code changes
Go to Railway dashboard → your app service → Deployments → Redeploy.

## Database
Schema is applied automatically on server startup (`server/src/db/schema.sql`).
No manual migrations needed — all tables use `CREATE TABLE IF NOT EXISTS`.

### Backups — Point-in-Time Recovery (PITR)
- **Enabled 2026-06-27** on the prod Postgres service (Railway → Postgres → Backups → Enable PITR). Continuous backups + WAL archiving; restore to any point within the retention window.
- WAL archives go to a Railway-provisioned bucket (`Postgres-PITR`, region `iad`); the Postgres service holds the `WAL_ARCHIVE_*` vars wiring it up. These are managed by Railway — don't edit by hand.
- **To restore:** Railway → Postgres → Backups → pick a timestamp → *Restore to this moment*. It spins up a **new** Postgres service at that state and leaves the live one running — so a restore is non-destructive. After verifying the restored copy, repoint `DATABASE_URL` if you actually want to cut over.
- ⚠️ Requires the Pro plan; if the plan lapses, PITR/backups stop. Optional belt-and-braces: a scheduled `pg_dump → R2` job (not set up).

## Adding a new env var
1. Add to Railway Variables
2. Add to `server/.env` (local)
3. If it's a `VITE_*` var, also add to root `.env` and redeploy (Vite bakes these in at build time)
