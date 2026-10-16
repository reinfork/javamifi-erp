# JavaMifi Rental Desk (demo)

A small internal dashboard for a portable Wi-Fi rental operation: rent out devices, take payment, track inventory and money. All customers, serials, and prices are fictional.

## Run it
Make sure you had WSL/Docker Desktop running.

1. Copy .env into project root directory

```bash
cp .env
```
fill your telegram bot ID & telegram chat ID to activate the n8n workflow. Make sure every mandatory variables is filled.


2. Run the command
```
docker compose up -d --build
```

Migration and seeding run automatically inside the backend container.
- Shop: http://localhost:5173
- API: http://localhost:3000
- n8n: http://localhost:5678
- PostgreSQL: localhost:5432

## Operator Credentials
- email: admin@example.com
- password: admin123

these are defaults from .env, or change it directly from .env

## Features

- A main page shows devices list and payment checkout forms
- Payment by midtrans (sandbox) along with webhook notifications
- Modules management
- Quick tunneling by cloudflare
- n8n immediate telegram notification of arrived orders

## Architecture

- `backend`: Express.js, JWT authentication
- `database`: PostgreSQL
- `ORM`: Prisma
- `Frontend`: React.js + vite + shadcn
- `Payment Gateway`: Midtrans (sandbox)
- `Automation`: n8n (telegram)
- `Tunnel`: Cloudflare Quick Tunnel (catch midtrans notification, used as node package)

## Modules

- **Shop** Shows all devices and checkout page
- **Orders** — read-only rental history. Opening a `RENTED` order shows a Mark returned button.
- **Inventory** — the devices with add/edit/delete.
- **Finance** — every payment with status, amount, order number, and provider transaction ids.
- **Login** — single operator account, seeded from environment values.

## Workflow

1. Open the shop, pick an available device, enter name + email, check out.
2. Pay in the Midtrans Snap sandbox window.
3. An immediate telegram notification will arrived from n8n (if you setup your telegram variables)
4. Login as operator
4. See the order as `RENTED` in Orders, the device as `RENTED` in Inventory, the payment as `PAID` in Finance, and the Telegram message.
4. Open the order details, Mark returned — the device is `AVAILABLE` again.


## Data model and statuses

`User` (operator login) → `Customer` (unique email) → `RentalOrder` (one customer, one device) → `Payment` (one per order). `Device` carries its own price and rental duration, so editing a device changes future rentals but never past orders — each order snapshots the amount at checkout.

- Device: `AVAILABLE` / `RESERVED` / `RENTED`
- Rental order: `PENDING_PAYMENT` / `RENTED` / `RETURNED` / `CANCELLED`
- Payment: `PENDING` / `PAID` / `FAILED` / `EXPIRED`

Checkout atomically reserves the device only if still available. A verified successful payment flips payment, order, and device in one transaction and sets the due date. Failed or expired payments cancel a still-pending order and free the device only if it's still reserved for it. Repeat notifications are harmless no-ops. Abandoned sessions are also swept to `EXPIRED` whenever a list view loads.


## Payment (Midtrans Sandbox)

Sandbox only. The server key stays in the backend; the browser only ever receives a Snap token. Checkout creates the Snap session server-side; payment truth comes exclusively from `POST /api/webhooks/midtrans`, which checks the SHA512 signature and the amount before touching anything. Browser callbacks (`onSuccess`, `onClose`, …) only refresh the page.

Midtrans cannot reach `localhost`, so with `ENABLE_DEV_TUNNEL=true` the backend opens its own Cloudflare quick tunnel on boot, logs the URL, and attaches it to every Snap request — no Midtrans dashboard edit needed. Set `PUBLIC_BASE_URL` instead if you have a fixed public origin. The tunnel URL is random per backend restart, so only sessions created after a restart notify the current URL.

Note: Midtrans may add a small customer-paid fee on top of our amount; the backend compares the base amount it reports, so the fee doesn't break verification.

## Telegram (n8n)

Every new order fires one Telegram message (order number, customer, device, amount). On a fresh n8n volume the container imports both credentials, the workflow, and publishes it automatically — zero clicks. Set in `.env`:

- `N8N_WEBHOOK_SECRET` — shared header secret, backend and n8n must agree
- `TELEGRAM_BOT_TOKEN` — the full BotFather token (`123456:ABC…`, not just the numeric part)
- `TELEGRAM_CHAT_ID` — the numeric chat id

Message the bot once first, or Telegram refuses delivery. State lives in the `n8n-data` volume: plain `down` keeps it, `down -v` wipes it (the next boot re-seeds from `.env`). Keep `N8N_ENCRYPTION_KEY` unchanged or existing credentials stop decrypting. Seeding runs on first boot only; later workflow edits need a manual re-import.
