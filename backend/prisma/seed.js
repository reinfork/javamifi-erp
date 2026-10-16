import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const price = Number(process.env.RENTAL_PRICE_IDR || 150000);
const duration = Number(process.env.RENTAL_DURATION_DAYS || 7);
// ponytail: per-device price tags differ by unit tier; ceiling = one price each, edit seeding if real catalog arrives
const devices = [
  { serialNumber: 'JM-WIFI-001', modelName: 'JavaMifi Portable WiFi', price, rentalDurationDays: duration },
  { serialNumber: 'JM-WIFI-002', modelName: 'JavaMifi Portable WiFi', price: price + 25000, rentalDurationDays: duration },
  { serialNumber: 'JM-WIFI-003', modelName: 'JavaMifi Portable WiFi', price: price + 50000, rentalDurationDays: duration },
  { serialNumber: 'JM-WIFI-004', modelName: 'JavaMifi Portable WiFi', price: price - 25000, rentalDurationDays: duration },
  { serialNumber: 'JM-WIFI-005', modelName: 'JavaMifi Portable WiFi', price: price + 100000, rentalDurationDays: duration },
];

const day = 86400000;
const ago = (n) => (n == null ? null : new Date(Date.now() - n * day));
// ponytail: fixed demo history so read-only Orders/Finance are not empty; ceiling = 4 hardcoded rows, add/remove as needed
const demoOrders = [
  { orderNumber: 'JM-DEMO-0001', serial: 'JM-WIFI-001', status: 'RETURNED', payment: 'PAID', rentedAgo: 10, returnedAgo: 2 },
  { orderNumber: 'JM-DEMO-0002', serial: 'JM-WIFI-002', status: 'RENTED', payment: 'PAID', rentedAgo: 3 },
  { orderNumber: 'JM-DEMO-0003', serial: 'JM-WIFI-003', status: 'PENDING_PAYMENT', payment: 'PENDING' },
  { orderNumber: 'JM-DEMO-0004', serial: 'JM-WIFI-004', status: 'CANCELLED', payment: 'FAILED' },
];
const deviceStatusFor = { RETURNED: 'AVAILABLE', RENTED: 'RENTED', PENDING_PAYMENT: 'RESERVED', CANCELLED: 'AVAILABLE' };

async function main() {
  const email = process.env.SEED_OPERATOR_EMAIL || 'operator@example.com';
  const password = process.env.SEED_OPERATOR_PASSWORD || 'change_me';
  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.user.upsert({
    where: { email },
    update: { passwordHash },
    create: { email, passwordHash, role: 'OPERATOR' },
  });
  for (const d of devices) {
    await prisma.device.upsert({
      where: { serialNumber: d.serialNumber },
      update: d,
      create: { ...d, status: 'AVAILABLE' },
    });
  }
  const customer = await prisma.customer.upsert({
    where: { email: 'demo.customer@example.com' },
    update: {},
    create: { name: 'Demo Customer', email: 'demo.customer@example.com', phone: '0812000001', source: 'MANUAL' },
  });
  for (const d of demoOrders) {
    const device = await prisma.device.findUnique({ where: { serialNumber: d.serial } });
    const rentedAt = ago(d.rentedAgo);
    const dueAt = rentedAt ? new Date(rentedAt.getTime() + device.rentalDurationDays * day) : null;
    const existing = await prisma.rentalOrder.findUnique({ where: { orderNumber: d.orderNumber } });
    const order = await prisma.rentalOrder.upsert({
      where: { orderNumber: d.orderNumber },
      update: {},
      create: {
        orderNumber: d.orderNumber, customerId: customer.id, deviceId: device.id, amount: device.price,
        rentalDurationDays: device.rentalDurationDays, status: d.status, rentedAt, dueAt, returnedAt: ago(d.returnedAgo),
      },
    });
    // only stamp device status on first insert so re-seeding never clobbers a live rental
    if (!existing) await prisma.device.update({ where: { id: device.id }, data: { status: deviceStatusFor[d.status] } });
    await prisma.payment.upsert({
      where: { rentalOrderId: order.id },
      update: {},
      create: {
        rentalOrderId: order.id, providerOrderId: `seed-${d.orderNumber}`, amount: device.price, status: d.payment,
        midtransTransactionId: d.payment === 'PAID' ? `seed-txn-${d.orderNumber}` : undefined,
        // ponytail: seeded PENDING mirrors a live 24h session; ceiling = static timestamp, re-seed to refresh
        snapExpiresAt: d.payment === 'PENDING' ? new Date(Date.now() + 24 * 86400000) : undefined,
      },
    });
  }
  console.log('seed ok');
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
