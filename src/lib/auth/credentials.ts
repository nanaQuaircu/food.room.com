import bcrypt from 'bcryptjs';
import { getPlatformBypassLogins } from '@/lib/config';

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export function isPlatformBypassLogin(login: string): boolean {
  const list = getPlatformBypassLogins();
  return list.includes(login.trim().toLowerCase());
}

export function slugify(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export { suggestedDatabaseName } from '@/lib/tenant/database-name';

/** Six-digit booking code guests can say at the front desk (e.g. 482917). */
export function generateConfirmationCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}
