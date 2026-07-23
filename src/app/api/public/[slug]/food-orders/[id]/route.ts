import { apiFail, apiOk } from '@/lib/api/json';
import { requirePublicTenant } from '@/lib/public/require-public-tenant';
import { getSession } from '@/lib/tenant/session';
import { getGuestFoodOrder } from '@/lib/services/food-order-service';

type Params = { params: Promise<{ slug: string; id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { slug, id } = await params;
  const resolved = await requirePublicTenant(slug);
  if ('error' in resolved) return resolved.error;

  const session = await getSession();
  if (!session || session.type !== 'guest' || session.companySlug !== slug || !session.guestId) {
    return apiFail('Sign in to track orders.', 401);
  }

  const orderId = Number(id);
  if (!orderId) return apiFail('Invalid order id.', 400);

  try {
    const order = await getGuestFoodOrder(
      resolved.ctx.db,
      resolved.ctx.propertyId,
      session.guestId,
      orderId
    );
    if (!order) return apiFail('Order not found.', 404);
    return apiOk(order);
  } catch (e) {
    console.error(e);
    return apiFail('Failed to load order.', 500);
  }
}
