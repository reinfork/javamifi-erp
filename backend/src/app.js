import express from 'express';
import cors from 'cors';
import { login, me, requireAuth } from './auth.js';
import { listOrders, orderDetail, checkout, resumeCheckout, returnOrder } from './orders.js';
import { listDevices, createDevice, updateDevice, deleteDevice, listPayments, listCustomers, importCustomer } from './directory.js';
import { handleNotification } from './midtrans.js';
import { listShopDevices, shopCheckout } from './shop.js';
import { prisma } from './config.js';

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', async (req, res) => {
  try { await prisma.$queryRaw`SELECT 1`; res.json({ ok: true }); }
  catch { res.status(500).json({ error: 'DB unreachable' }); }
});
app.post('/api/auth/login', login);
app.post('/api/webhooks/midtrans', async (req, res) => {
  try { res.json(await handleNotification(req.body || {})); }
  catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});
app.get('/api/shop/devices', listShopDevices);
app.post('/api/shop/checkout', shopCheckout);

app.use('/api', requireAuth);
app.get('/api/auth/me', me);
app.get('/api/orders', listOrders);
app.get('/api/orders/:orderId', orderDetail);
app.post('/api/orders/checkout', checkout);
app.post('/api/orders/:orderId/pay', resumeCheckout);
app.post('/api/orders/:orderId/return', returnOrder);
app.get('/api/devices', listDevices);
app.post('/api/devices', createDevice);
app.patch('/api/devices/:deviceId', updateDevice);
app.delete('/api/devices/:deviceId', deleteDevice);
app.get('/api/payments', listPayments);
app.get('/api/customers', listCustomers);
app.post('/api/integrations/dummyjson/import-customer', importCustomer);

export default app;
