import { NextRequest } from 'next/server';
import { requireTenant, isTenantContext } from '@/lib/api/tenant-context';
import { apiOk, apiFail } from '@/lib/api/json';
import { getReports, getProperty, type ReportPeriod } from '@/lib/services/hotel-service';

const ALLOWED: ReportPeriod[] = ['daily', 'weekly', 'monthly', 'yearly'];

function isIsoDate(value: string | null): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

export async function GET(request: NextRequest) {
  const ctx = await requireTenant();
  if (!isTenantContext(ctx)) return ctx;
  try {
    const raw = request.nextUrl.searchParams.get('period') || 'monthly';
    const period = (ALLOWED.includes(raw as ReportPeriod) ? raw : 'monthly') as ReportPeriod;
    const start = request.nextUrl.searchParams.get('start');
    const end = request.nextUrl.searchParams.get('end');
    const [data, propertyRow] = await Promise.all([
      getReports(
        ctx.db,
        ctx.propertyId,
        period,
        isIsoDate(start) ? start : null,
        isIsoDate(end) ? end : null
      ),
      getProperty(ctx.db, ctx.propertyId),
    ]);
    const property = propertyRow as {
      name?: string;
      address?: string | null;
      phone?: string | null;
      email?: string | null;
    } | undefined;
    return apiOk({
      ...data,
      property: {
        name: String(property?.name || ''),
        address: property?.address ?? null,
        phone: property?.phone ?? null,
        email: property?.email ?? null,
      },
    });
  } catch (e) {
    console.error(e);
    return apiFail('Failed to load reports', 500);
  }
}
