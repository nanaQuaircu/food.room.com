import { NextRequest } from 'next/server';
import { apiFail, apiOk } from '@/lib/api/json';
import { requirePublicTenant } from '@/lib/public/require-public-tenant';
import { getSession } from '@/lib/tenant/session';
import { listGuestFoodOrders } from '@/lib/services/food-order-service';

type Params = { params: Promise<{ slug: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  const { slug } = await params;
  const resolved = await requirePublicTenant(slug);
  if ('error' in resolved) return resolved.error;

  const session = await getSession();
  if (!session || session.type !== 'guest' || session.companySlug !== slug || !session.guestId) {
    return apiFail('Sign in to track orders.', 401);
  }

  try {
    const limit = Number(request.nextUrl.searchParams.get('limit') || 20);
    const orders = await listGuestFoodOrders(
      resolved.ctx.db,
      resolved.ctx.propertyId,
      session.guestId,
      limit
    );
    return apiOk(orders);
  } catch (e) {
    console.error(e);
    return apiFail('Failed to load orders.', 500);
  }
}
