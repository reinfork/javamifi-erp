import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();
export const env = {
  jwtSecret: process.env.JWT_SECRET || '',
  midtransServerKey: process.env.MIDTRANS_SERVER_KEY || '',
  midtransProd: process.env.MIDTRANS_IS_PRODUCTION === 'true',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  n8nUrl: process.env.N8N_WEBHOOK_URL || '',
  n8nSecret: process.env.N8N_WEBHOOK_SECRET || '',
  devTunnel: process.env.ENABLE_DEV_TUNNEL === 'true',
};
// ponytail: mutable runtime URL (explicit PUBLIC_BASE_URL wins, else self-opened dev tunnel fills it).
// Ceiling: in-memory only, lost on restart; persist if stable URLs ever matter.
export const runtime = { publicBaseUrl: (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '') };
export const err = (res, status, message) => res.status(status).json({ error: message });
