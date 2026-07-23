import { apiOk, apiFail } from '@/lib/api/json';
import { requirePublicTenant } from '@/lib/public/require-public-tenant';
import { getPublicPropertyProfile, getPublicHotelStats } from '@/lib/services/public-guest-service';
import { getHubtelRuntimeCredentials } from '@/lib/services/company-settings-service';

type Params = { params: Promise<{ slug: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { slug } = await params;
  const resolved = await requirePublicTenant(slug);
  if ('error' in resolved) return resolved.error;
  const { ctx } = resolved;

  try {
    const [profile, stats] = await Promise.all([
      getPublicPropertyProfile(ctx.db, ctx.propertyId, slug, ctx.branding.logo_url),
      getPublicHotelStats(ctx.db, ctx.propertyId),
    ]);
    if (!profile) return apiFail('Property not found.', 404);
    const hubtel = getHubtelRuntimeCredentials(ctx.company);
    return apiOk({
      ...profile,
      stats,
      hubtel_enabled: Boolean(hubtel.enabled && hubtel.clientId && hubtel.clientSecret),
    });
  } catch (e) {
    console.error(e);
    return apiFail('Failed to load hotel profile.', 500);
  }
}
