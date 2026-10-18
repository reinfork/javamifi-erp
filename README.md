# JavaMifi Rental Desk (demo)

A small internal dashboard for a portable Wi-Fi rental operation: rent out devices, take payment, track inventory and payments.

## How to run 
Make sure you had WSL/Docker Desktop running.

1. Copy the repository into your machine
```
git clone https://github.com/reinfork/javamifi-erp.git
```

2. Copy .env into project root directory
```
cp .env
```
fill your `TELEGRAM_BOT_TOKEN` & `TELEGRAM_CHAT_ID` to activate the n8n workflow
https://gist.github.com/nafiesl/4ad622f344cd1dc3bb1ecbe468ff9f8a

3. Run the command
```
docker compose up -d --build
```

Migration and seeding run automatically.
- Frontend: http://localhost:5173
- Backend: http://localhost:3000
- n8n: http://localhost:5678
- PostgreSQL: localhost:5432

## Operator Credentials
- email: admin@example.com
- password: admin123

## Key Features
- Idempotent Payment: no double payment if there is a pending status
- Payment Webhook: catch status update for Midtrans using Cloudflared
- Order notification: instant notification through telegram using n8n

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
