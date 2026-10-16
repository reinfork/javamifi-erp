import { prisma, err } from './config.js';
import { sweepExpiredPayments } from './midtrans.js';

export const listDevices = async (req, res) => {
  await sweepExpiredPayments();
  res.json(await prisma.device.findMany({ orderBy: { serialNumber: 'asc' } }));
};

// ponytail: one shared validator for create/patch; ceiling = 3 fields only, extend if duration becomes editable
function deviceFields(body, partial) {
  const out = {};
  if (body.serialNumber !== undefined || !partial) {
    const v = String(body.serialNumber || '').trim();
    if (!v) return { error: 'serialNumber is required' };
    out.serialNumber = v;
  }
  if (body.modelName !== undefined || !partial) {
    const v = String(body.modelName || '').trim();
    if (!v) return { error: 'modelName is required' };
    out.modelName = v;
  }
  if (body.price !== undefined || !partial) {
    const v = Number(body.price);
    if (!Number.isInteger(v) || v <= 0) return { error: 'price must be a positive integer' };
    out.price = v;
  }
  if (partial && !Object.keys(out).length) return { error: 'No fields to update' };
  return { data: out };
}

export async function createDevice(req, res) {
  const { error, data } = deviceFields(req.body || {}, false);
  if (error) return err(res, 400, error);
  if (await prisma.device.findUnique({ where: { serialNumber: data.serialNumber } })) return err(res, 409, 'Device code already exists');
  res.status(201).json(await prisma.device.create({ data: { ...data, status: 'AVAILABLE' } }));
}

export async function updateDevice(req, res) {
  const { error, data } = deviceFields(req.body || {}, true);
  if (error) return err(res, 400, error);
  if (!(await prisma.device.findUnique({ where: { id: req.params.deviceId } }))) return err(res, 404, 'Device not found');
  if (data.serialNumber) {
    const clash = await prisma.device.findUnique({ where: { serialNumber: data.serialNumber } });
    if (clash && clash.id !== req.params.deviceId) return err(res, 409, 'Device code already exists');
  }
  res.json(await prisma.device.update({ where: { id: req.params.deviceId }, data }));
}

export async function deleteDevice(req, res) {
  const device = await prisma.device.findUnique({ where: { id: req.params.deviceId } });
  if (!device) return err(res, 404, 'Device not found');
  // ponytail: never-rented guard protects FK RESTRICT + history; ceiling = no soft-delete/archive, add if retired units must stay listed
  if (device.status !== 'AVAILABLE') return err(res, 409, 'Device is in use and cannot be deleted');
  if (await prisma.rentalOrder.count({ where: { deviceId: device.id } })) return err(res, 409, 'Device has rental history and cannot be deleted');
  await prisma.device.delete({ where: { id: device.id } });
  res.json({ ok: true });
}

export const listPayments = async (req, res) => {
  await sweepExpiredPayments();
  res.json(await prisma.payment.findMany({ include: { order: { include: { customer: true, device: true } } }, orderBy: { createdAt: 'desc' } }));
};
export const listCustomers = async (req, res) => res.json(await prisma.customer.findMany({ orderBy: { createdAt: 'desc' } }));

export async function importCustomer(req, res) {
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 8000);
    const r = await fetch('https://dummyjson.com/users/1', { signal: ctl.signal });
    clearTimeout(t);
    if (!r.ok) throw new Error('Provider error: ' + r.status);
    const u = await r.json();
    const email = u.email, name = `${u.firstName || ''} ${u.lastName || ''}`.trim() || email;
    const customer = await prisma.customer.upsert({
      where: { email },
      update: { name, phone: u.phone || undefined, source: 'DUMMYJSON' },
      create: { name, email, phone: u.phone || undefined, source: 'DUMMYJSON' },
    });
    res.json(customer);
  } catch (e) {
    return err(res, 502, e.name === 'AbortError' ? 'DummyJSON timeout' : 'Customer import failed: ' + e.message);
  }
}
