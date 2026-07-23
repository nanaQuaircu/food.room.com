import { NextRequest } from 'next/server';

import { apiOk, apiFail } from '@/lib/api/json';

import {

  activateSubscriptionFromPayment,

  verifyPaystackWebhookSignature,

} from '@/lib/subscription/saas-paystack';

import { confirmGuestPayment } from '@/lib/services/public-guest-service';
import { confirmFoodOrderPayment } from '@/lib/services/food-order-service';

import { paystackVerify } from '@/lib/payments/paystack-service';

import { getPaystackRuntimeCredentials } from '@/lib/services/company-settings-service';

import { findCompanyById } from '@/lib/tenant/tenant-service';

import { resolvePublicTenant } from '@/lib/public/resolve-tenant';



export async function POST(request: NextRequest) {

  try {

    const rawBody = await request.text();

    const signature = request.headers.get('x-paystack-signature');



    if (!(await verifyPaystackWebhookSignature(rawBody, signature))) {

      return apiFail('Invalid Paystack signature', 401);

    }



    const event = JSON.parse(rawBody) as {

      event?: string;

      data?: {

        reference?: string;

        amount?: number;

        metadata?: { purpose?: string; company_slug?: string; slug?: string };

      };

    };



    if (event.event !== 'charge.success') {

      return apiOk({ ignored: true });

    }



    const reference = String(event.data?.reference || '').trim();

    if (!reference) return apiFail('Missing reference');



    if (reference.startsWith('SUB')) {

      const result = await activateSubscriptionFromPayment(reference);

      return apiOk(result);

    }



    if (reference.startsWith('WEB') || reference.startsWith('FOOD')) {

      const slug =

        event.data?.metadata?.company_slug ||

        event.data?.metadata?.slug ||

        request.nextUrl.searchParams.get('slug');

      if (!slug) return apiOk({ ignored: true, reason: 'no_slug' });



      const ctx = await resolvePublicTenant(slug);

      if (!ctx) return apiOk({ ignored: true, reason: 'tenant_not_found' });



      const company = await findCompanyById(ctx.company.id);

      if (!company) return apiOk({ ignored: true, reason: 'company_not_found' });



      const creds = getPaystackRuntimeCredentials(company);

      if (!creds.secretKey) return apiOk({ ignored: true, reason: 'no_paystack' });



      const verified = await paystackVerify(creds.secretKey, reference);

      if (reference.startsWith('WEB')) {
        const result = await confirmGuestPayment(
          ctx.db,
          ctx.propertyId,
          verified.reference,
          verified.amount
        );

        if (!result.already) {
          try {
            const { queryTenant } = await import('@/lib/db/tenant');
            const { getBookingByConfirmation } = await import('@/lib/services/public-guest-service');
            const { getPropertyBookingSettings } = await import('@/lib/guest/booking-settings');
            const { sendBookingConfirmationNotifications } = await import(
              '@/lib/services/notification-service'
            );
            const codeRows = await queryTenant<Array<{ confirmation_code: string }>>(
              ctx.db,
              `SELECT confirmation_code FROM reservations WHERE id = :id LIMIT 1`,
              { id: result.reservation_id }
            );
            const code = codeRows[0]?.confirmation_code;
            if (code) {
              const booking = await getBookingByConfirmation(ctx.db, ctx.propertyId, code);
              const settings = await getPropertyBookingSettings(ctx.db, ctx.propertyId);
              if (booking?.guest_email) {
                await sendBookingConfirmationNotifications({
                  companyId: ctx.company.id,
                  guestName: `${booking.guest_first_name} ${booking.guest_last_name}`.trim(),
                  guestEmail: booking.guest_email,
                  guestPhone: booking.guest_phone || undefined,
                  hotelName: ctx.company.name || slug,
                  confirmationCode: booking.confirmation_code,
                  roomNumber: booking.room_number
                    ? `Room ${booking.room_number}`
                    : booking.room_type_name,
                  balance: Number(booking.total_amount),
                  currency: settings.currency,
                  logoUrl: ctx.branding.logo_url,
                  checkInDate: String(booking.check_in_date).slice(0, 10),
                  checkOutDate: String(booking.check_out_date).slice(0, 10),
                });
              }
            }
          } catch (notifyErr) {
            console.warn('Webhook booking confirmation email failed:', notifyErr);
          }
        }

        return apiOk({ ...result, type: 'website_booking' });
      }

      const result = await confirmFoodOrderPayment(
        ctx.db,
        ctx.propertyId,
        verified.reference,
        verified.amount
      );
      return apiOk({ ...result, type: 'food_order' });

    }



    return apiOk({ ignored: true, reason: 'unhandled_reference' });

  } catch (e) {

    console.error(e);

    const message = e instanceof Error ? e.message : 'Webhook failed';

    return apiFail(message, 500);

  }

}

