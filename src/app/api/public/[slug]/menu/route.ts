import { NextRequest } from 'next/server';
import { apiOk, apiFail } from '@/lib/api/json';
import { requirePublicTenant } from '@/lib/public/require-public-tenant';
import { getSession } from '@/lib/tenant/session';
import { getHubtelRuntimeCredentials } from '@/lib/services/company-settings-service';
import {
  createFoodOrder,
  updateFoodOrderDeliveryDispatch,
} from '@/lib/services/food-order-service';
import { createHubtelDelivery, estimateHubtelDelivery } from '@/lib/services/hubtel-service';
import { queryTenant } from '@/lib/db/tenant';
import { getProperty } from '@/lib/services/hotel-service';

type Params = { params: Promise<{ slug: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { slug } = await params;
  const resolved = await requirePublicTenant(slug);
  if ('error' in resolved) return resolved.error;

  try {
    const { listPublicMenu } = await import('@/lib/services/food-order-service');
    const menu = await listPublicMenu(resolved.ctx.db, resolved.ctx.propertyId);
    return apiOk(menu);
  } catch (e) {
    console.error(e);
    return apiFail('Failed to load menu.', 500);
  }
}

export async function POST(request: NextRequest, { params }: Params) {
  const { slug } = await params;
  const resolved = await requirePublicTenant(slug);
  if ('error' in resolved) return resolved.error;

  try {
    const body = await request.json();
    const session = await getSession();
    if (!session || session.type !== 'guest' || session.companySlug !== slug || !session.guestId) {
      return apiFail('Sign in to order food.', 401);
    }
    const guestId = session.guestId;

    const deliveryType =
      body.delivery_type === 'hubtel'
        ? 'hubtel'
        : body.delivery_type === 'room_service'
          ? 'room_service'
          : 'pickup';

    const paymentMethodRaw = String(body.payment_method || '').trim();
    const paymentMethod =
      paymentMethodRaw === 'paystack'
        ? 'paystack'
        : paymentMethodRaw === 'cash_on_delivery'
          ? 'cash_on_delivery'
          : 'cash';

    const resolvedPaymentMethod =
      deliveryType === 'hubtel' && paymentMethod !== 'paystack'
        ? 'cash_on_delivery'
        : paymentMethod === 'cash_on_delivery' && deliveryType !== 'hubtel'
          ? 'cash'
          : paymentMethod;

    let deliveryFee = 0;
    let deliveryEta: number | null = null;
    let quoteId: string | null = null;
    const deliveryAddress = body.delivery_address ? String(body.delivery_address).trim() : '';

    const hubtelCreds = getHubtelRuntimeCredentials(resolved.ctx.company);
    if (deliveryType === 'hubtel') {
      if (!hubtelCreds.enabled) {
        return apiFail('Hubtel delivery is not enabled for this hotel.', 400);
      }
      if (!deliveryAddress) {
        return apiFail('Delivery address is required for Hubtel delivery.', 400);
      }

      const property = (await getProperty(resolved.ctx.db, resolved.ctx.propertyId)) as
        | { address?: string | null; phone?: string | null; name?: string | null }
        | undefined;

      const quote = await estimateHubtelDelivery({
        address: deliveryAddress,
        creds: {
          ...hubtelCreds,
          pickupAddress: hubtelCreds.pickupAddress || property?.address || '',
          pickupPhone: hubtelCreds.pickupPhone || property?.phone || '',
        },
      });
      deliveryFee = quote.fee;
      deliveryEta = quote.eta_minutes;
      quoteId = quote.quote_id || null;
    }

    const guestRows = await queryTenant<
      Array<{ first_name: string | null; last_name: string | null; phone: string | null; email: string | null }>
    >(
      resolved.ctx.db,
      `SELECT first_name, last_name, phone, email FROM guests WHERE id = :id LIMIT 1`,
      { id: guestId }
    );
    const guest = guestRows[0];

    const order = await createFoodOrder(resolved.ctx.db, resolved.ctx.propertyId, {
      guest_id: guestId,
      reservation_id: body.reservation_id ? Number(body.reservation_id) : undefined,
      order_type: body.order_type === 'room_service' ? 'room_service' : 'restaurant',
      delivery_type: deliveryType,
      delivery_address: deliveryType === 'hubtel' ? deliveryAddress : undefined,
      delivery_provider: deliveryType === 'hubtel' ? 'hubtel' : undefined,
      delivery_fee: deliveryFee,
      delivery_status: deliveryType === 'hubtel' ? 'quoting' : null,
      delivery_eta_minutes: deliveryEta,
      payment_method: resolvedPaymentMethod,
      room_number: body.room_number ? String(body.room_number) : undefined,
      notes: body.notes ? String(body.notes) : undefined,
      lines: Array.isArray(body.lines)
        ? body.lines.map((l: { menu_item_id: number; quantity: number }) => ({
            menu_item_id: Number(l.menu_item_id),
            quantity: Number(l.quantity) || 1,
          }))
        : [],
    });

    let deliveryDispatch = null;
    if (deliveryType === 'hubtel') {
      const property = (await getProperty(resolved.ctx.db, resolved.ctx.propertyId)) as
        | { address?: string | null; phone?: string | null }
        | undefined;

      const dispatch = await createHubtelDelivery({
        creds: {
          ...hubtelCreds,
          pickupAddress: hubtelCreds.pickupAddress || property?.address || '',
          pickupPhone: hubtelCreds.pickupPhone || property?.phone || '',
        },
        orderId: order.id,
        destinationAddress: deliveryAddress,
        customerName: [guest?.first_name, guest?.last_name].filter(Boolean).join(' ') || undefined,
        customerPhone: guest?.phone || undefined,
        customerEmail: guest?.email || undefined,
        notes: body.notes ? String(body.notes) : undefined,
        fee: deliveryFee,
        etaMinutes: deliveryEta || undefined,
        quoteId,
        paymentMode: resolvedPaymentMethod === 'cash_on_delivery' ? 'cash_on_delivery' : 'prepaid',
        itemDescription: `Food order #${order.id}`,
      });

      await updateFoodOrderDeliveryDispatch(resolved.ctx.db, resolved.ctx.propertyId, order.id, {
        delivery_status: dispatch.status,
        delivery_tracking_ref: dispatch.tracking_ref,
        delivery_eta_minutes: dispatch.eta_minutes,
        delivery_fee: dispatch.fee,
      });

      deliveryDispatch = {
        status: dispatch.status,
        tracking_ref: dispatch.tracking_ref,
        source: dispatch.source,
        eta_minutes: dispatch.eta_minutes,
        fee: dispatch.fee,
      };
    }

    return apiOk(
      {
        ...order,
        delivery_fee: deliveryFee,
        delivery: deliveryDispatch,
      },
      'Order placed.'
    );
  } catch (e) {
    console.error(e);
    const message = e instanceof Error ? e.message : 'Order failed.';
    return apiFail(message, 400);
  }
}
