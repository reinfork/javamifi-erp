import { prisma, err } from './config.js';
import { createSnapTx, SNAP_TTL_HOURS, notifyN8n, sweepExpiredPayments } from './midtrans.js';

const include = { customer: true, device: true, payment: true };
const orderNo = () => `JM-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

export const listOrders = async (req, res) => {
  await sweepExpiredPayments();
  res.json(await prisma.rentalOrder.findMany({ include, orderBy: { createdAt: 'desc' } }));
};

export async function orderDetail(req, res) {
  const order = await prisma.rentalOrder.findUnique({ where: { id: req.params.orderId }, include });
  if (!order) return err(res, 404, 'Order not found');
  res.json(order);
}

export async function checkout(req, res) {
  const { customerId, deviceId } = req.body || {};
  if (!customerId || !deviceId) return err(res, 400, 'customerId and deviceId required');
  try {
    res.status(201).json(await startCheckout({ customerId, deviceId }));
  } catch (e) {
    return err(res, e.status || 500, e.message || 'Checkout failed');
  }
}

// ponytail: one shared reserve->order->Snap flow for operator + public shop; throws {status,message}, handlers translate.
// Ceiling: sync call inline, no queue; fine for demo checkout volume.
export async function startCheckout({ customerId, deviceId }) {
  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer) throw { status: 404, message: 'Customer not found' };

  const device = await prisma.device.findUnique({ where: { id: deviceId } });
  if (!device) throw { status: 404, message: 'Device not found' };
  const reserved = await prisma.device.updateMany({ where: { id: deviceId, status: 'AVAILABLE' }, data: { status: 'RESERVED' } });
  if (!reserved.count) throw { status: 409, message: 'Device not available' };

  const amount = device.price, rentalDurationDays = device.rentalDurationDays;
  const orderNumber = orderNo(), providerOrderId = `jm-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  let order, payment;
  try {
    order = await prisma.rentalOrder.create({ data: { orderNumber, customerId, deviceId, amount, rentalDurationDays, status: 'PENDING_PAYMENT' } });
    payment = await prisma.payment.create({ data: { rentalOrderId: order.id, providerOrderId, amount, status: 'PENDING' } });
    const snap = await createSnapTx({ providerOrderId, amount, customer });
    const snapExpiresAt = new Date(Date.now() + SNAP_TTL_HOURS * 3600000);
    payment = await prisma.payment.update({ where: { id: payment.id }, data: { snapToken: snap.token, snapRedirectUrl: snap.redirect_url, snapExpiresAt } });
    // ponytail: notify on created order only; failed Snap rolls back above with no notification. Ceiling: no retry, logged in notifyN8n.
    notifyN8n({ event: 'order.created', eventId: order.id, orderNumber, customerName: customer.name, deviceSerialNumber: device.serialNumber, amount, currency: 'IDR' });
    return { order: { ...order, customer, payment }, snapToken: snap.token, redirectUrl: snap.redirect_url };
  } catch (e) {
    // release reservation, cancel partials
    await prisma.$transaction(async (tx) => {
      if (payment) await tx.payment.update({ where: { id: payment.id }, data: { status: 'FAILED' } }).catch(() => {});
      if (order) await tx.rentalOrder.update({ where: { id: order.id }, data: { status: 'CANCELLED' } }).catch(() => {});
      await tx.device.updateMany({ where: { id: deviceId, status: 'RESERVED' }, data: { status: 'AVAILABLE' } });
    });
    throw { status: 502, message: e.message || 'Checkout failed' };
  }
}

export async function resumeCheckout(req, res) {
  const order = await prisma.rentalOrder.findUnique({ where: { id: req.params.orderId }, include });
  if (!order) return err(res, 404, 'Order not found');
  if (order.status !== 'PENDING_PAYMENT' || !order.payment || order.payment.status !== 'PENDING') {
    return err(res, 409, 'Order is not awaiting payment');
  }
  const p = order.payment;
  // ponytail: same session returned, no new Midtrans call; ceiling = dead token after TTL -> 410, new rental instead
  if (!p.snapToken || (p.snapExpiresAt && p.snapExpiresAt <= new Date())) {
    return err(res, 410, 'Payment session expired, create a new rental');
  }
  res.json({ order, snapToken: p.snapToken, redirectUrl: p.snapRedirectUrl });
}

export async function returnOrder(req, res) {
  const order = await prisma.rentalOrder.findUnique({ where: { id: req.params.orderId } });
  if (!order) return err(res, 404, 'Order not found');
  if (order.status !== 'RENTED') return err(res, 409, 'Only RENTED orders can be returned');
  const [updated] = await prisma.$transaction([
    prisma.rentalOrder.update({ where: { id: order.id }, data: { status: 'RETURNED', returnedAt: new Date() } }),
    prisma.device.update({ where: { id: order.deviceId }, data: { status: 'AVAILABLE' } }),
  ]);
  res.json(updated);
}
