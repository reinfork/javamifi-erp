import { prisma, err } from './config.js';
import { startCheckout } from './orders.js';
import { sweepExpiredPayments } from './midtrans.js';

export const listShopDevices = async (req, res) => {
  await sweepExpiredPayments();
  res.json(await prisma.device.findMany({ orderBy: { serialNumber: 'asc' } }));
};

const emailOk = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e || '');

// ponytail: public storefront checkout, unauthenticated by design; ceiling = no rate limit/abuse guard, add before any real exposure
export async function shopCheckout(req, res) {
  const { email, name, deviceId } = req.body || {};
  if (!emailOk(email)) return err(res, 400, 'Valid email required');
  if (!String(name || '').trim()) return err(res, 400, 'Name required');
  if (!deviceId) return err(res, 400, 'deviceId required');
  const norm = { email: email.trim().toLowerCase(), name: name.trim() };
  const customer = await prisma.customer.upsert({
    where: { email: norm.email },
    update: { name: norm.name },
    create: { ...norm, source: 'SHOP' },
  });
  // ponytail: idempotency key = email only; a live pending always reopens, an expired one cancels+releases then recreates.
  // Ceiling: switching device abandons the old reservation until Midtrans expires it; key by (email,device) if that bites.
  const pending = await prisma.rentalOrder.findFirst({
    where: { customerId: customer.id, status: 'PENDING_PAYMENT' },
    include: { customer: true, device: true, payment: true },
    orderBy: { createdAt: 'desc' },
  });
  const live =
    pending?.payment?.status === 'PENDING' && pending.payment.snapToken &&
    (!pending.payment.snapExpiresAt || pending.payment.snapExpiresAt > new Date());
  if (live) {
    return res.json({ reused: true, order: pending, snapToken: pending.payment.snapToken, redirectUrl: pending.payment.snapRedirectUrl });
  }
  if (pending?.payment) {
    await prisma.$transaction(async (tx) => {
      await tx.payment.updateMany({ where: { id: pending.payment.id, status: 'PENDING' }, data: { status: 'EXPIRED' } });
      await tx.rentalOrder.updateMany({ where: { id: pending.id, status: 'PENDING_PAYMENT' }, data: { status: 'CANCELLED' } });
      await tx.device.updateMany({ where: { id: pending.deviceId, status: 'RESERVED' }, data: { status: 'AVAILABLE' } });
    });
  }
  try {
    res.status(201).json({ reused: false, ...(await startCheckout({ customerId: customer.id, deviceId })) });
  } catch (e) {
    return err(res, e.status || 500, e.message || 'Checkout failed');
  }
}
