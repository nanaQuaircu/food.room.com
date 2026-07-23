import { NextRequest } from 'next/server';
import { requireTenant, isTenantContext } from '@/lib/api/tenant-context';
import { apiOk, apiFail } from '@/lib/api/json';
import {
  getFrontDeskOverview,
  checkInReservation,
  checkOutReservation,
  getCheckoutPreview,
  walkInCheckIn,
} from '@/lib/services/hotel-service';
import { notifyGuestCheckIn, notifyGuestCheckOut } from '@/lib/services/guest-notification';
import type { RefundPolicy } from '@/lib/billing/stay-billing';
import {
  getCompanyBySessionId,
  getPaystackRuntimeCredentials,
} from '@/lib/services/company-settings-service';
import { paystackVerify } from '@/lib/payments/paystack-service';

export async function GET(request: NextRequest) {
  const ctx = await requireTenant();
  if (!isTenantContext(ctx)) return ctx;
  try {
    const reservationId = Number(request.nextUrl.searchParams.get('reservation_id'));
    if (reservationId) {
      const actualCheckOutDate =
        request.nextUrl.searchParams.get('actual_check_out_date') || undefined;
      const refundPolicy = (request.nextUrl.searchParams.get('refund_policy') ||
        'full') as RefundPolicy;
      const preview = await getCheckoutPreview(
        ctx.db,
        ctx.propertyId,
        reservationId,
        actualCheckOutDate,
        refundPolicy
      );
      return apiOk(preview);
    }

    const data = await getFrontDeskOverview(ctx.db, ctx.propertyId);
    return apiOk(data);
  } catch (e) {
    console.error(e);
    const message = e instanceof Error ? e.message : 'Failed to load front desk overview';
    return apiFail(message, 500);
  }
}

export async function POST(request: NextRequest) {
  const ctx = await requireTenant();
  if (!isTenantContext(ctx)) return ctx;
  try {
    const body = await request.json();
    const action = String(body.action || '').trim();

    if (action === 'check_in') {
      const reservationId = Number(body.reservation_id);
      const roomId = Number(body.room_id);

      if (!reservationId || !roomId) {
        return apiFail('reservation_id and room_id are required for check_in');
      }

      await checkInReservation(ctx.db, ctx.propertyId, reservationId, roomId);
      const notifications = await notifyGuestCheckIn(
        ctx,
        ctx.db,
        ctx.propertyId,
        reservationId
      );

      return apiOk({
        reservation_id: reservationId,
        room_id: roomId,
        status: 'checked_in',
        notifications,
      });
    }

    if (action === 'check_out') {
      const reservationId = Number(body.reservation_id);

      if (!reservationId) {
        return apiFail('reservation_id is required for check_out');
      }

      const result = await checkOutReservation(
        ctx.db,
        ctx.propertyId,
        reservationId,
        ctx.session.userId,
        {
          actual_check_out_date: body.actual_check_out_date
            ? String(body.actual_check_out_date)
            : undefined,
          refund_policy: body.refund_policy as RefundPolicy | undefined,
          refund_amount:
            body.refund_amount !== undefined ? Number(body.refund_amount) : undefined,
          reason: body.reason ? String(body.reason) : undefined,
        }
      );

      const notifications = await notifyGuestCheckOut(
        ctx,
        ctx.db,
        ctx.propertyId,
        reservationId
      );

      return apiOk({
        reservation_id: reservationId,
        status: 'checked_out',
        ...result,
        notifications,
      });
    }

    if (action === 'walk_in') {
      const roomId = Number(body.room_id);
      const guestId = body.guest_id ? Number(body.guest_id) : undefined;
      const checkOutDate = String(body.check_out_date || '').trim();
      const paymentAmount = body.collect_payment ? Number(body.payment_amount) : 0;

      if (!roomId || !checkOutDate) {
        return apiFail('room_id and check_out_date are required for walk_in');
      }

      let paymentMethod = String(body.payment_method || 'cash');
      let paymentReference = body.payment_reference ? String(body.payment_reference) : undefined;

      if (paymentAmount > 0 && paymentMethod === 'paystack') {
        const reference = String(body.payment_reference || '').trim();
        if (!reference) {
          return apiFail('Paystack payment reference is required.');
        }

        const companyId = ctx.session.companyId;
        if (!companyId) return apiFail('Hotel context missing.', 400);

        const company = await getCompanyBySessionId(companyId);
        if (!company) return apiFail('Hotel not found.', 404);

        const creds = getPaystackRuntimeCredentials(company);
        if (!creds.enabled || !creds.secretKey) {
          return apiFail('Paystack is not configured.', 400);
        }

        const verified = await paystackVerify(creds.secretKey, reference);
        if (Math.abs(verified.amount - paymentAmount) > 0.01) {
          return apiFail('Paystack amount does not match the payment total.');
        }

        paymentMethod = 'paystack';
        paymentReference = verified.reference;
      }

      const result = await walkInCheckIn(ctx.db, ctx.propertyId, ctx.session.userId, {
        guest_id: guestId,
        first_name: body.first_name ? String(body.first_name) : undefined,
        last_name: body.last_name ? String(body.last_name) : undefined,
        email: body.email ? String(body.email) : undefined,
        phone: body.phone ? String(body.phone) : undefined,
        check_in_date: body.check_in_date ? String(body.check_in_date) : undefined,
        check_out_date: checkOutDate,
        room_id: roomId,
        adults: body.adults ? Number(body.adults) : 1,
        notes: body.notes ? String(body.notes) : undefined,
        billing_type: body.billing_type === 'corporate' ? 'corporate' : 'guest',
        corporate_account_id: body.corporate_account_id ? Number(body.corporate_account_id) : null,
        payment:
          paymentAmount > 0
            ? {
                method: paymentMethod,
                amount: paymentAmount,
                reference: paymentReference,
              }
            : undefined,
      });

      const notifications = await notifyGuestCheckIn(
        ctx,
        ctx.db,
        ctx.propertyId,
        result.reservation_id
      );

      return apiOk(
        { ...result, notifications },
        `Walk-in complete. Confirmation ${result.confirmation_code} — guest checked into room.`
      );
    }

    return apiFail('action must be check_in, check_out, or walk_in');
  } catch (e) {
    console.error(e);
    const message = e instanceof Error ? e.message : 'Front desk action failed';
    return apiFail(message, 500);
  }
}
