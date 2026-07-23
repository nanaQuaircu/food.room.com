import { NextRequest } from 'next/server';
import { requireTenant, isTenantContext } from '@/lib/api/tenant-context';
import { apiOk, apiFail } from '@/lib/api/json';
import {
  listFoodOrdersWithLines,
  markFoodOrderCashCollected,
  updateFoodOrderStatus,
} from '@/lib/services/food-order-service';

export async function GET() {
  const ctx = await requireTenant();
  if (!isTenantContext(ctx)) return ctx;
  try {
    const orders = await listFoodOrdersWithLines(ctx.db, ctx.propertyId);
    return apiOk(orders);
  } catch (e) {
    console.error(e);
    return apiFail('Failed to load orders.', 500);
  }
}

export async function PATCH(request: NextRequest) {
  const ctx = await requireTenant();
  if (!isTenantContext(ctx)) return ctx;
  try {
    const body = await request.json();
    const orderId = Number(body.id);
    if (!orderId) return apiFail('id is required.');

    if (body.action === 'mark_paid' || body.payment_status === 'paid') {
      const result = await markFoodOrderCashCollected(
        ctx.db,
        ctx.propertyId,
        orderId,
        ctx.session.userId
      );
      return apiOk(result, result.already ? 'Already marked paid.' : 'Cash payment recorded.');
    }

    const status = String(body.status || '').trim();
    if (!status) return apiFail('id and status are required.');
    await updateFoodOrderStatus(ctx.db, ctx.propertyId, orderId, status, ctx.session.userId);
    return apiOk({ id: orderId, status }, 'Order updated.');
  } catch (e) {
    console.error(e);
    const message = e instanceof Error ? e.message : 'Update failed.';
    return apiFail(message, 400);
  }
}
