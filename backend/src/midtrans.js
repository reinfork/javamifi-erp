import crypto from 'node:crypto';
import { env, prisma, runtime } from './config.js';

export const SNAP_TTL_HOURS = 24;

// ponytail: fire-and-forget fetch, no queue; ceiling = loss on crash, upgrade to outbox if volume matters
export function notifyN8n(payload) {
  if (!env.n8nUrl) return;
  fetch(env.n8nUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Webhook-Secret': env.n8nSecret },
    body: JSON.stringify(payload),
  }).catch((e) => console.error('n8n notify failed (payment stays PAID):', e.message));
}

export async function createSnapTx({ providerOrderId, amount, customer }) {
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    Authorization: 'Basic ' + Buffer.from(env.midtransServerKey + ':').toString('base64'),
  };
  // ponytail: override (not append) so local testing ignores the dashboard URL; ceiling = one URL, add append if multi-target needed
  if (runtime.publicBaseUrl) headers['X-Override-Notification'] = `${runtime.publicBaseUrl}/api/webhooks/midtrans`;
  const res = await fetch('https://app.sandbox.midtrans.com/snap/v1/transactions', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      transaction_details: {
        order_id: providerOrderId,
        gross_amount: amount,
        // ponytail: fixed 24h expiry drives the expire-webhook -> release path; per-order TTL if needed later
        expiry: { unit: 'hour', duration: SNAP_TTL_HOURS },
      },
      customer_details: { first_name: customer.name, email: customer.email, phone: customer.phone || undefined },
    }),
  });
  if (!res.ok) throw new Error('Snap request failed: ' + res.status);
  return res.json(); // { token, redirect_url }
}

export function validSignature({ order_id, status_code, gross_amount, signature_key }) {
  const hash = crypto.createHash('sha512').update(`${order_id}${status_code}${gross_amount}${env.midtransServerKey}`).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(signature_key || ''));
  } catch {
    return false;
  }
}

// ponytail: lazy local sweep for abandoned sessions; called from list endpoints. Ceiling: only runs on reads, no cron/worker; NULL snapExpiresAt rows are skipped by SQL null semantics.
export async function sweepExpiredPayments() {
  const stale = await prisma.payment.findMany({
    where: { status: 'PENDING', snapExpiresAt: { lt: new Date() } },
    select: { id: true, rentalOrderId: true, order: { select: { deviceId: true } } },
  });
  for (const p of stale) {
    await prisma.$transaction(async (tx) => {
      const pc = await tx.payment.updateMany({ where: { id: p.id, status: 'PENDING' }, data: { status: 'EXPIRED' } });
      if (!pc.count) return;
      await tx.rentalOrder.updateMany({ where: { id: p.rentalOrderId, status: 'PENDING_PAYMENT' }, data: { status: 'CANCELLED' } });
      await tx.device.updateMany({ where: { id: p.order.deviceId, status: 'RESERVED' }, data: { status: 'AVAILABLE' } });
    });
  }
}

export function isSuccess(n) {
  if (n.transaction_status === 'settlement') return true;
  if (n.transaction_status === 'capture' && (n.fraud_status === 'accept' || !n.fraud_status)) return true;
  return false;
}

export async function handleNotification(n) {
  const { order_id, status_code, gross_amount } = n;
  if (!order_id || !validSignature(n)) { const e = new Error('Invalid signature'); e.status = 403; throw e; }
  const payment = await prisma.payment.findUnique({ where: { providerOrderId: order_id }, include: { order: { include: { customer: true, device: true } } } });
  if (!payment) { const e = new Error('Unknown order'); e.status = 404; throw e; }
  // ponytail: Midtrans may add a customer-imposed fee on top of our amount; compare the base original_amount when present. Ceiling: relies on Midtrans fee metadata shape, strict otherwise.
  const billed = Number(n.metadata?.extra_info?.gross_amount_info?.original_amount ?? gross_amount);
  if (billed !== payment.amount) { const e = new Error('Amount mismatch'); e.status = 403; throw e; }
  if (payment.status === 'PAID') return { already: true }; // fast path; atomic claim below is authoritative

  if (isSuccess(n)) {
    const rentedAt = new Date();
    const dueAt = new Date(rentedAt.getTime() + payment.order.rentalDurationDays * 86400000);
    // ponytail: who-wins decided by conditional update inside the tx, not by the read above.
    // Concurrent duplicates: one claims, others get count 0 -> no double notify.
    // Late settlement after cancel/expire/return: order no longer PENDING -> no-op, no revival.
    const claimed = await prisma.$transaction(async (tx) => {
      const oc = await tx.rentalOrder.updateMany({
        where: { id: payment.rentalOrderId, status: 'PENDING_PAYMENT' },
        data: { status: 'RENTED', rentedAt, dueAt },
      });
      if (!oc.count) return false;
      await tx.payment.update({ where: { id: payment.id }, data: { status: 'PAID', midtransTransactionId: n.transaction_id || undefined, paymentType: n.payment_type || undefined } });
      await tx.device.updateMany({ where: { id: payment.order.deviceId, status: 'RESERVED' }, data: { status: 'RENTED' } });
      return true;
    });
    if (!claimed) return { already: true };
    return { paid: true };
  }

  if (['deny', 'cancel'].includes(n.transaction_status) || n.transaction_status === 'expire') {
    const failed = n.transaction_status === 'expire' ? 'EXPIRED' : 'FAILED';
    // ponytail: claim on PENDING only; a late failure after PAID is a no-op, never downgrades a success
    const claimed = await prisma.$transaction(async (tx) => {
      const pc = await tx.payment.updateMany({ where: { id: payment.id, status: 'PENDING' }, data: { status: failed } });
      if (!pc.count) return false;
      await tx.rentalOrder.updateMany({ where: { id: payment.rentalOrderId, status: 'PENDING_PAYMENT' }, data: { status: 'CANCELLED' } });
      await tx.device.updateMany({ where: { id: payment.order.deviceId, status: 'RESERVED' }, data: { status: 'AVAILABLE' } });
      return true;
    });
    return claimed ? { failed } : { already: true };
  }
  return { pending: true };
}
