import { NextRequest } from 'next/server';
import { requireTenant, isTenantContext } from '@/lib/api/tenant-context';
import { apiOk, apiFail } from '@/lib/api/json';
import { listAuditLogs } from '@/lib/services/guest-booking-extras';

export async function GET(request: NextRequest) {
  const ctx = await requireTenant();
  if (!isTenantContext(ctx)) return ctx;
  try {
    const limit = Number(request.nextUrl.searchParams.get('limit') || 100);
    const logs = await listAuditLogs(ctx.db, ctx.propertyId, limit);
    return apiOk(logs);
  } catch (e) {
    console.error(e);
    return apiFail('Failed to load audit logs.', 500);
  }
}
