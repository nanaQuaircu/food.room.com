import { queryCentral } from '@/lib/db/central';
import type { PlatformAdmin } from '@/lib/db/types';
import { getPlatformBypassLogins } from '@/lib/config';
import { verifyPassword } from '@/lib/auth/credentials';

export function isPlatformBypassLogin(login: string): boolean {
  const normalized = login.trim().toLowerCase();
  if (!normalized) return false;
  return getPlatformBypassLogins().includes(normalized);
}

export async function findPlatformAdminByLogin(login: string): Promise<PlatformAdmin | null> {
  const trimmed = login.trim();
  if (!trimmed) return null;

  const rows = await queryCentral<PlatformAdmin[]>(
    `SELECT id, name, email, password_hash, is_active, must_change_password
     FROM platform_admins
     WHERE is_active = 1
       AND (LOWER(name) = LOWER(:login) OR LOWER(email) = LOWER(:login))
     LIMIT 1`,
    { login: trimmed }
  );

  return rows[0] ?? null;
}

export async function authenticatePlatformAdmin(
  login: string,
  password: string
): Promise<PlatformAdmin | null> {
  if (!isPlatformBypassLogin(login)) return null;

  const admin = await findPlatformAdminByLogin(login);
  if (!admin) return null;

  const valid = await verifyPassword(password, admin.password_hash);
  return valid ? admin : null;
}
