import type { DbConfig } from '@/lib/db/central';
import type { SessionPayload } from '@/lib/db/types';
import { NextResponse } from 'next/server';
import { getSession } from '@/lib/tenant/session';
import {
  findCompanyCredentialsById,
  companyToDbConfig,
} from '@/lib/tenant/tenant-service';
import { apiFail } from '@/lib/api/json';
import type { TenantRole } from '@/lib/roles';
import { hasAnyRole } from '@/lib/roles';
import { assertTenantAccess } from '@/lib/subscription/access-gate';

export type TenantContext = {
  session: SessionPayload;
  db: DbConfig;
  propertyId: number;
};

export type RequireTenantOptions = {
  /** Allow Settings / subscription renewal when trial or plan is expired. */
  allowExpired?: boolean;
};

/**
 * Resolve tenant DB credentials from the central companies table.
 * Session cookies never carry db passwords.
 */
export async function sessionToDbConfig(session: SessionPayload): Promise<DbConfig> {
  if (!session.companyId) {
    throw new Error('Session is missing company context.');
  }
  const company = await findCompanyCredentialsById(session.companyId);
  if (!company) {
    throw new Error('Hotel account was not found.');
  }
  return companyToDbConfig(company);
}

async function resolvePropertyId(session: SessionPayload, db: DbConfig): Promise<number> {
  let propertyId = session.propertyId ?? 0;
  if (!propertyId) {
    const { queryTenant } = await import('@/lib/db/tenant');
    const rows = await queryTenant<Array<{ id: number }>>(
      db,
      `SELECT id FROM properties WHERE is_active = 1 ORDER BY id LIMIT 1`
    );
    propertyId = rows[0]?.id ?? 0;
  }
  return propertyId;
}

export async function getTenantContext(
  options: RequireTenantOptions = {}
): Promise<TenantContext | null> {
  const session = await getSession();
  if (!session || session.type !== 'tenant' || !session.companyId) return null;

  if (!options.allowExpired) {
    const access = await assertTenantAccess(session.companyId);
    if (!access.ok) return null;
  }

  try {
    const db = await sessionToDbConfig(session);
    const propertyId = await resolvePropertyId(session, db);
    if (!propertyId) return null;
    return { session, db, propertyId };
  } catch {
    return null;
  }
}

export async function requireTenant(
  options: RequireTenantOptions = {}
): Promise<TenantContext | NextResponse> {
  const session = await getSession();
  if (!session || session.type !== 'tenant' || !session.companyId) {
    return apiFail('Unauthorized', 401);
  }

  if (!options.allowExpired) {
    const access = await assertTenantAccess(session.companyId);
    if (!access.ok) {
      return apiFail(access.message, 402);
    }
  }

  try {
    const db = await sessionToDbConfig(session);
    const propertyId = await resolvePropertyId(session, db);
    if (!propertyId) return apiFail('Unauthorized', 401);
    return { session, db, propertyId };
  } catch {
    return apiFail('Hotel account is unavailable.', 403);
  }
}

export function isTenantContext(value: TenantContext | NextResponse): value is TenantContext {
  return !(value instanceof NextResponse);
}

export function requireTenantRoles(
  ctx: TenantContext,
  roles: TenantRole[]
): NextResponse | null {
  if (!hasAnyRole(ctx.session.userRole, roles)) {
    return apiFail('You do not have permission to perform this action.', 403);
  }
  return null;
}
