import { NextRequest } from 'next/server';
import { apiOk, apiFail } from '@/lib/api/json';
import { requirePublicTenant } from '@/lib/public/require-public-tenant';
import { getPaystackRuntimeCredentials } from '@/lib/services/company-settings-service';
import { createWebsitePaystackReference, paystackInitialize, paystackVerify } from '@/lib/payments/paystack-service';
import {
  confirmGuestPayment,
  getBookingByConfirmation,
  saveGuestPaymentIntent,
} from '@/lib/services/public-guest-service';
import { getPropertyBookingSettings } from '@/lib/guest/booking-settings';
import { sendBookingConfirmationNotifications } from '@/lib/services/notification-service';
import { findCompanyById } from '@/lib/tenant/tenant-service';

type Params = { params: Promise<{ slug: string }> };

async function sendPaidBookingConfirmation(
  companyId: number,
  slug: string,
  logoUrl: string | null | undefined,
  confirmationCode: string,
  db: Parameters<typeof getBookingByConfirmation>[0],
  propertyId: number,
  currency: string
) {
  const booking = await getBookingByConfirmation(db, propertyId, confirmationCode);
  if (!booking?.guest_email) return;

  const company = await findCompanyById(companyId);
  await sendBookingConfirmationNotifications({
    companyId,
    guestName: `${booking.guest_first_name} ${booking.guest_last_name}`.trim(),
    guestEmail: booking.guest_email,
    guestPhone: booking.guest_phone || undefined,
    hotelName: company?.name || slug,
    confirmationCode: booking.confirmation_code,
    roomNumber: booking.room_number
      ? `Room ${booking.room_number}`
      : booking.room_type_name,
    balance: Number(booking.total_amount),
    currency,
    logoUrl,
    checkInDate: String(booking.check_in_date).slice(0, 10),
    checkOutDate: String(booking.check_out_date).slice(0, 10),
  });
}

export async function POST(request: NextRequest, { params }: Params) {
  const { slug } = await params;
  const resolved = await requirePublicTenant(slug);
  if ('error' in resolved) return resolved.error;

  try {
    const body = await request.json();
    const action = String(body.action || 'initialize').trim();
    const company = resolved.ctx.company;

    const creds = getPaystackRuntimeCredentials(company);
    if (!creds.enabled || !creds.secretKey || !creds.publicKey) {
      return apiFail('Online payments are not configured for this hotel.', 400);
    }

    if (action === 'confirm') {
      const reference = String(body.reference || '').trim();
      if (!reference) return apiFail('reference is required.');
      const verified = await paystackVerify(creds.secretKey, reference);
      const result = await confirmGuestPayment(
        resolved.ctx.db,
        resolved.ctx.propertyId,
        verified.reference,
        verified.amount
      );

      const settings = await getPropertyBookingSettings(
        resolved.ctx.db,
        resolved.ctx.propertyId
      );

      // Resolve confirmation code from reservation id
      const rows = await import('@/lib/db/tenant').then((m) =>
        m.queryTenant<Array<{ confirmation_code: string }>>(
          resolved.ctx.db,
          `SELECT confirmation_code FROM reservations WHERE id = :id LIMIT 1`,
          { id: result.reservation_id }
        )
      );
      const code = rows[0]?.confirmation_code;
      if (code && !result.already) {
        try {
          await sendPaidBookingConfirmation(
            resolved.ctx.company.id,
            slug,
            resolved.ctx.branding.logo_url,
            code,
            resolved.ctx.db,
            resolved.ctx.propertyId,
            settings.currency
          );
        } catch (e) {
          console.warn('Post-payment confirmation email failed:', e);
        }
      }

      return apiOk({ ...result, confirmation_code: code }, 'Payment confirmed.');
    }

    if (action === 'abandon') {
      const confirmationCode = String(body.confirmation_code || '').trim();
      const reference = String(body.reference || '').trim();
      if (!confirmationCode) return apiFail('confirmation_code is required.');

      // If Paystack already collected funds, confirm instead of cancelling.
      if (reference) {
        try {
          const verified = await paystackVerify(creds.secretKey, reference);
          if (verified.status === 'success') {
            const result = await confirmGuestPayment(
              resolved.ctx.db,
              resolved.ctx.propertyId,
              verified.reference,
              verified.amount
            );
            const settings = await getPropertyBookingSettings(
              resolved.ctx.db,
              resolved.ctx.propertyId
            );
            if (!result.already) {
              await sendPaidBookingConfirmation(
                resolved.ctx.company.id,
                slug,
                resolved.ctx.branding.logo_url,
                confirmationCode,
                resolved.ctx.db,
                resolved.ctx.propertyId,
                settings.currency
              );
            }
            return apiOk(
              { cancelled: false, paid: true, confirmation_code: confirmationCode },
              'Payment was completed.'
            );
          }
        } catch {
          // Not paid — fall through to cancel unpaid hold.
        }
      }

      const { cancelUnpaidWebsiteBooking } = await import('@/lib/services/public-guest-service');
      const result = await cancelUnpaidWebsiteBooking(
        resolved.ctx.db,
        resolved.ctx.propertyId,
        confirmationCode
      );
      return apiOk(result, result.cancelled ? 'Unpaid booking cancelled.' : 'Nothing to cancel.');
    }

    const confirmationCode = String(body.confirmation_code || '').trim();
    if (!confirmationCode) return apiFail('confirmation_code is required.');

    const booking = await getBookingByConfirmation(
      resolved.ctx.db,
      resolved.ctx.propertyId,
      confirmationCode
    );
    if (!booking) return apiFail('Booking not found.', 404);

    const email = String(body.email || booking.guest_email || '').trim();
    if (!email) return apiFail('email is required for Paystack.');

    const settings = await getPropertyBookingSettings(resolved.ctx.db, resolved.ctx.propertyId);
    const amount = Number(booking.total_amount);
    const reference = createWebsitePaystackReference(resolved.ctx.propertyId, booking.id);

    await saveGuestPaymentIntent(
      resolved.ctx.db,
      booking.id,
      reference,
      amount,
      settings.currency
    );

    const init = await paystackInitialize(creds.secretKey, {
      email,
      amount,
      reference,
      currency: settings.currency,
      metadata: {
        purpose: 'website_booking',
        reservation_id: booking.id,
        confirmation_code: confirmationCode,
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
  } catch (e) {
    console.error(e);
    const message = e instanceof Error ? e.message : 'Paystack failed.';
    return apiFail(message, 400);
  }
}
