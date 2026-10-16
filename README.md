# JavaMifi Rental Desk (demo)

Internal Micro-ERP demo for portable Wi-Fi rental ops: Orders, Inventory, Finance, operator login, DummyJSON import, Midtrans Snap Sandbox, n8n → Telegram on verified payment. Fictional data only.

## Architecture

Modular monolith: one Express API, one PostgreSQL, one Prisma schema, React+Vite frontend, n8n container for automation. Orders/Inventory/Finance are in-process modules, no inter-service HTTP.

- `backend/src/app.js` — routes; `auth.js`, `orders.js`, `directory.js` (devices/payments/customers/DummyJSON), `midtrans.js` (Snap + webhook + n8n notify), `config.js`, `server.js`
- `frontend/src` — `App.jsx` (state switcher, no router), `api.js` (fetch + `sessionStorage` token), `ui.jsx` (minimal shadcn-style Button/Card/Input/Select/Badge), `pages/`
- `automation/n8n/payment-success-workflow.json` — Webhook → Telegram `sendMessage`

## Schema & statuses

User (`OPERATOR`), Customer (email unique, `MANUAL`/`DUMMYJSON`), Device (serial, `price`, `rentalDurationDays`, `AVAILABLE`/`RESERVED`/`RENTED`, seeded `JM-WIFI-001..005` with distinct prices), RentalOrder (`PENDING_PAYMENT`/`RENTED`/`RETURNED`/`CANCELLED`, amount + duration snapshot from the device at checkout), Payment (`PENDING`/`PAID`/`FAILED`/`EXPIRED`, `providerOrderId` unique). One device per order, one payment per order. `RENTAL_PRICE_IDR`/`RENTAL_DURATION_DAYS` are seed defaults only.

Key transitions (all Prisma transactions): checkout reserves `AVAILABLE→RESERVED` atomically (409 on race); verified `settlement`/`capture+accept` → `PAID`+`RENTED`+`RENTED` + `dueAt`, idempotent, never reverts `RETURNED`; `deny/cancel/expire` → `FAILED`/`EXPIRED` + cancel pending + release only if still `RESERVED`; return (`RENTED`-only) → `RETURNED`+`AVAILABLE` from Order Details.

## Modules

Shop is the default landing page: all devices with prices and status badges (Rent disabled unless AVAILABLE), a sidebar with customer name/email, the selected device summary with total, and a Pay/Checkout button that opens Midtrans Snap. Shop checkout is public; it upserts the customer by email and reopens that email's live pending payment instead of duplicating it (a stale one cancels, releases, and recreates). Orders is a read-only history log: created/rented/due/returned dates, customer, device, amount, status; a RENTED order can be marked returned from its details. An Operator/Admin button leads to login and the Orders/Inventory/Finance modules. Seeded demo history (`JM-DEMO-0001..0004`) spans RETURNED/RENTED/PENDING_PAYMENT/CANCELLED. Inventory is full CRUD for devices (code/name/price); delete is blocked unless the device is AVAILABLE and has no rental history. Finance lists payments with status, amount, provider/txn ids, and created date.

> Deviations from AGENTS.md: a 4th page (Shop) with a public checkout (§2/§5); Orders has no create UI; Inventory gains device CRUD (§2/§10/§14 previously out of scope) and shows prices.

## Setup

```bash
cp .env.example .env   # fill secrets, never commit
docker compose up --build
# in backend container (or locally with DATABASE_URL set):
npx prisma migrate deploy
npm run seed   # repeatable upserts; or: node prisma/seed.js
```

Local dev without compose: `npm install` in both dirs, run postgres locally, `npx prisma migrate dev`, `npm run seed`, `node src/server.js` (:3000), `npm run dev` (:5173).

## Midtrans Sandbox

Set `MIDTRANS_SERVER_KEY` (backend only) + `VITE_MIDTRANS_CLIENT_KEY` (browser). Checkout creates a Snap session server-side; browser gets only token. Truth comes from `POST /api/webhooks/midtrans` (SHA512 `order_id+status_code+gross_amount+server_key`, timing-safe compare, amount + order match, idempotent). Browser callbacks only refetch. Localhost is unreachable by Midtrans: use an HTTPS tunnel and set the notification URL in the Midtrans dashboard to `<public-url>/api/webhooks/midtrans`.

Local tunnel (dev only): set `ENABLE_DEV_TUNNEL=true` and the backend self-opens a cloudflared quick tunnel on boot, logs its URL, and sends it as `X-Override-Notification` on each Snap request so that transaction notifies the tunnel without dashboard edits. `PUBLIC_BASE_URL` overrides it with a fixed origin when set. Never enable the tunnel in production.

## n8n → Telegram

Notify fires on order creation (checkout, before payment), not on settlement — operator decision, deviates from `AGENTS.md` §2 step 7 / §9 "only after verified payment". Failures are logged and never block the order.

Zero-click handoff: fill `N8N_WEBHOOK_SECRET`, `TELEGRAM_BOT_TOKEN` (BotFather), `TELEGRAM_CHAT_ID` in `.env`, then `docker compose up`. On a fresh volume the n8n entrypoint runs `automation/n8n/seed.mjs`, which imports both credentials, the workflow (fixed id `javamifi-payment-success`), and publishes it, so `POST http://n8n:5678/webhook/payment-success` is live immediately. This replaces the spec's manual UI setup (§9) — secrets still never touch the repo. First message the bot once (so it can see the chat), or delivery fails at Telegram's side.

Preservation: n8n state lives in the `n8n-data` volume. `docker compose down` keeps it; `docker compose down -v` wipes credentials + workflow + activation (and the database) — the next boot re-seeds from `.env`. Keep `N8N_ENCRYPTION_KEY` fixed or existing credentials stop decrypting. Seeding runs first-boot only; later JSON edits need a manual re-import/publish.

## Happy path

Login → Import Demo Customer → select customer + available device → Checkout → pay in Snap sandbox → (webhook) Orders/Inventory/Finance update + Telegram message → Order Details → Mark returned → device `AVAILABLE`.

Unfinished checkout: `POST /api/orders/:orderId/pay` returns the stored Snap session for a `PENDING_PAYMENT` order (same token, no new Midtrans session); `410` when the session expired → create a new rental. Webhook transitions are atomic claims: concurrent or late duplicates are no-ops, and a late success/failure never revives or downgrades a terminal order.

## Deviations & limits

- Telegram used instead of `AGENTS.md` Discord; backend→n8n contract unchanged.
- shadcn allowed per `AGENTS.md` §18; still no router/store/Axios, plain JS.
- Verified: frontend `npm run build` OK, backend syntax OK, `prisma generate` OK, signature/state-predicate unit check OK. Live `migrate deploy` + seed + compose run blocked: Docker daemon unavailable in this environment (`dockerDesktopLinuxEngine` pipe missing); run the commands above on a host with Docker Desktop running.
