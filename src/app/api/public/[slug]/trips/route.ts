import { apiOk, apiFail } from '@/lib/api/json';
import { getSession } from '@/lib/tenant/session';
import { requirePublicTenant } from '@/lib/public/require-public-tenant';
import { listGuestTrips } from '@/lib/services/public-guest-service';

type Params = { params: Promise<{ slug: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { slug } = await params;
  const resolved = await requirePublicTenant(slug);
  if ('error' in resolved) return resolved.error;

  const session = await getSession();
  if (!session || session.type !== 'guest' || session.companySlug !== slug || !session.guestId) {
    return apiFail('Sign in to view your trips.', 401);
  }

  try {
    const trips = await listGuestTrips(resolved.ctx.db, resolved.ctx.propertyId, session.guestId);
    return apiOk(trips);
  } catch (e) {
    console.error(e);
    return apiFail('Failed to load trips.', 500);
  }
}
