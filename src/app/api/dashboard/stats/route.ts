import { requireTenant, isTenantContext } from '@/lib/api/tenant-context';
import { apiOk, apiFail } from '@/lib/api/json';
import { getDashboardStats } from '@/lib/services/hotel-service';

export async function GET() {
  const ctx = await requireTenant();
  if (!isTenantContext(ctx)) return ctx;
  try {
    const data = await getDashboardStats(ctx.db, ctx.propertyId);
    return apiOk(data);
  } catch (e) {
    console.error(e);
    return apiFail('Failed to load dashboard stats', 500);
  }
}
