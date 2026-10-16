import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma, env, err } from './config.js';

export function requireAuth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  if (!token) return err(res, 401, 'Missing token');
  try {
    req.user = jwt.verify(token, env.jwtSecret);
    next();
  } catch {
    return err(res, 401, 'Invalid token');
  }
}

export async function login(req, res) {
  const { email, password } = req.body || {};
  if (!email || !password) return err(res, 400, 'Email and password required');
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) return err(res, 401, 'Invalid credentials');
  const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, env.jwtSecret, { expiresIn: '8h' });
  res.json({ token, user: { email: user.email, role: user.role } });
}

export async function me(req, res) {
  const user = await prisma.user.findUnique({ where: { id: req.user.id }, select: { email: true, role: true } });
  if (!user) return err(res, 401, 'Operator not found');
  res.json({ user });
}
