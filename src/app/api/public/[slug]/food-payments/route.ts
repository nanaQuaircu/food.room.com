import { NextRequest } from 'next/server';
import { apiFail, apiOk } from '@/lib/api/json';
import { requirePublicTenant } from '@/lib/public/require-public-tenant';
import { getPropertyBookingSettings } from '@/lib/guest/booking-settings';
import { getPaystackRuntimeCredentials } from '@/lib/services/company-settings-service';
import { createFoodOrderPaystackReference, paystackInitialize, paystackVerify } from '@/lib/payments/paystack-service';
import {
  abandonUnpaidFoodOrder,
  confirmFoodOrderPayment,
  saveFoodOrderPaymentIntent,
} from '@/lib/services/food-order-service';
import { queryTenant } from '@/lib/db/tenant';

type Params = { params: Promise<{ slug: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  const { slug } = await params;
  const resolved = await requirePublicTenant(slug);
  if ('error' in resolved) return resolved.error;

  try {
    const body = await request.json();
    const action = String(body.action || 'initialize').trim();
    const creds = getPaystackRuntimeCredentials(resolved.ctx.company);

    if (action === 'abandon') {
      const orderId = Number(body.order_id);
      if (!orderId) return apiFail('order_id is required.');
      const result = await abandonUnpaidFoodOrder(resolved.ctx.db, resolved.ctx.propertyId, orderId);
      return apiOk(result, result.cancelled ? 'Unpaid order cancelled.' : 'Order left unchanged.');
    }

    if (!creds.enabled || !creds.publicKey || !creds.secretKey) {
      return apiFail('Online payments are not configured for this hotel.', 400);
    }

    if (action === 'confirm') {
      const reference = String(body.reference || '').trim();
      if (!reference) return apiFail('reference is required.');
      const verified = await paystackVerify(creds.secretKey, reference);
      const result = await confirmFoodOrderPayment(
        resolved.ctx.db,
        resolved.ctx.propertyId,
        verified.reference,
        verified.amount
      );
      return apiOk(result, 'Food payment confirmed.');
    }

    const orderId = Number(body.order_id);
    const email = String(body.email || '').trim();
    if (!orderId) return apiFail('order_id is required.');
    if (!email) return apiFail('email is required.');

    const rows = await queryTenant<Array<{ id: number; total_amount: number }>>(
      resolved.ctx.db,
      `SELECT id, total_amount FROM food_orders
       WHERE id = :orderId AND property_id = :propertyId LIMIT 1`,
      { orderId, propertyId: resolved.ctx.propertyId }
    );
    const order = rows[0];
    if (!order) return apiFail('Food order not found.', 404);

    const settings = await getPropertyBookingSettings(resolved.ctx.db, resolved.ctx.propertyId);
    const amount = Number(order.total_amount);
    const reference = createFoodOrderPaystackReference(resolved.ctx.propertyId, order.id);
    await saveFoodOrderPaymentIntent(resolved.ctx.db, order.id, reference, amount, settings.currency);

    const init = await paystackInitialize(creds.secretKey, {
      email,
      amount,
      currency: settings.currency,
      reference,
      metadata: {
        purpose: 'food_order',
        order_id: order.id,
        company_slug: slug,
      },
    });

    return apiOk({
      reference: init.reference,
      access_code: init.access_code,
      authorization_url: init.authorization_url,
      public_key: creds.publicKey,
      amount,
      currency: settings.currency,
    });
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : 'Food payment failed.';
    return apiFail(message, 400);
  }
}
