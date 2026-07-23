import { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { apiOk, apiFail } from '@/lib/api/json';
import { requirePublicTenant } from '@/lib/public/require-public-tenant';
import { getSession } from '@/lib/tenant/session';
import {
  createWebsiteBooking,
  getBookingByConfirmation,
  getPublicAvailability,
  modifyReservationByGuest,
  updateDigitalCheckin,
  cancelUnpaidWebsiteBooking,
  finalizeWebsiteBookingAsPayAtHotel,
} from '@/lib/services/public-guest-service';
import { buildGuestBookingQuote, getPropertyBookingSettings } from '@/lib/guest/booking-settings';
import {
  cancelReservationByGuest,
  finalizeWebsiteBookingCharges,
  previewGuestCancellation,
} from '@/lib/services/guest-booking-extras';
import { sendBookingConfirmationNotifications } from '@/lib/services/notification-service';
import type { UpsellsInput } from '@/lib/guest/booking-pricing';

type Params = { params: Promise<{ slug: string }> };

async function getHoldSessionId() {
  const cookieStore = await cookies();
  return cookieStore.get('guest_hold_sid')?.value || undefined;
}

async function sendBookingConfirmation(
  companyId: number,
  slug: string,
  logoUrl: string | null | undefined,
  booking: {
    confirmation_code: string;
    total_amount: number;
    check_in_date: string;
    check_out_date: string;
    guest_first_name: string;
    guest_last_name: string;
    room_type_name: string | null;
  },
  guestEmail: string,
  guestPhone?: string,
  currency = 'GHS'
) {
  try {
    const company = await import('@/lib/tenant/tenant-service').then((m) => m.findCompanyById(companyId));
    await sendBookingConfirmationNotifications({
      companyId,
      guestName: `${booking.guest_first_name} ${booking.guest_last_name}`.trim(),
      guestEmail,
      guestPhone,
      hotelName: company?.name || slug,
      confirmationCode: booking.confirmation_code,
      roomNumber: booking.room_type_name,
      balance: Number(booking.total_amount),
      currency,
      logoUrl,
      checkInDate: String(booking.check_in_date).slice(0, 10),
      checkOutDate: String(booking.check_out_date).slice(0, 10),
    });
  } catch (e) {
    console.warn('Booking confirmation notification failed:', e);
  }
}

export async function GET(request: NextRequest, { params }: Params) {
  const { slug } = await params;
  const resolved = await requirePublicTenant(slug);
  if ('error' in resolved) return resolved.error;

  const code = request.nextUrl.searchParams.get('code')?.trim();
  if (!code) return apiFail('code is required.');

  try {
    const booking = await getBookingByConfirmation(resolved.ctx.db, resolved.ctx.propertyId, code);
    if (!booking) return apiFail('Booking not found.', 404);
    return apiOk(booking);
  } catch (e) {
    console.error(e);
    return apiFail('Failed to load booking.', 500);
  }
}

export async function POST(request: NextRequest, { params }: Params) {
  const { slug } = await params;
  const resolved = await requirePublicTenant(slug);
  if ('error' in resolved) return resolved.error;

  const session = await getSession();
  if (!session || session.type !== 'guest' || session.companySlug !== slug || !session.guestId) {
    return apiFail('Sign in to make a reservation.', 401);
  }

  try {
    const body = await request.json();
    const action = String(body.action || 'create').trim();

    if (action === 'cancel_unpaid') {
      const code = String(body.confirmation_code || '').trim();
      if (!code) return apiFail('confirmation_code is required.');
      const result = await cancelUnpaidWebsiteBooking(
        resolved.ctx.db,
        resolved.ctx.propertyId,
        code
      );
      return apiOk(result, result.cancelled ? 'Unpaid booking cancelled.' : 'Nothing to cancel.');
    }

    if (action === 'finalize_pay_at_hotel') {
      const code = String(body.confirmation_code || '').trim();
      if (!code) return apiFail('confirmation_code is required.');
      const fullBooking = await finalizeWebsiteBookingAsPayAtHotel(
        resolved.ctx.db,
        resolved.ctx.propertyId,
        code
      );
      if (fullBooking) {
        const settings = await getPropertyBookingSettings(
          resolved.ctx.db,
          resolved.ctx.propertyId
        );
        await sendBookingConfirmation(
          resolved.ctx.company.id,
          slug,
          resolved.ctx.branding.logo_url,
          {
            ...fullBooking,
            room_type_name: fullBooking.room_number
              ? `Room ${fullBooking.room_number}`
              : fullBooking.room_type_name,
          },
          fullBooking.guest_email || String(body.email || ''),
          fullBooking.guest_phone || undefined,
          settings.currency
        );
      }
      return apiOk(fullBooking, 'Booking confirmed — pay at hotel.');
    }

    const roomTypeId = Number(body.room_type_id);
    const checkIn = String(body.check_in_date || '').trim();
    const checkOut = String(body.check_out_date || '').trim();
    const firstName = String(body.first_name || '').trim();
    const lastName = String(body.last_name || '').trim();
    const email = String(body.email || '').trim();
    const phone = String(body.phone || '').trim();
    const upsells = (body.upsells || {}) as UpsellsInput;
    const promoCode = body.promo_code ? String(body.promo_code) : undefined;
    const useCredits = Boolean(body.use_credits);
    const paymentChoice = body.payment_choice === 'online' ? 'online' : 'hotel';

    if (!roomTypeId || !checkIn || !checkOut || !firstName || !lastName || !email) {
      return apiFail('room_type_id, dates, name, and email are required.');
    }

    const holdSessionId = await getHoldSessionId();
    let avail = await getPublicAvailability(
      resolved.ctx.db,
      resolved.ctx.propertyId,
      roomTypeId,
      checkIn,
      checkOut,
      { excludeSessionId: holdSessionId }
    );

    const requestedRoomId = body.room_id ? Number(body.room_id) : undefined;
    if (requestedRoomId) {
      const { listPublicAvailableRooms } = await import('@/lib/services/public-guest-service');
      const freeRooms = await listPublicAvailableRooms(
        resolved.ctx.db,
        resolved.ctx.propertyId,
        roomTypeId,
        checkIn,
        checkOut,
        holdSessionId
      );
      if (!freeRooms.some((r) => r.id === requestedRoomId)) {
        return apiFail('Selected room is not available for these dates.', 400);
      }
      if (!avail.ok) {
        avail = { ...avail, ok: true, available: Math.max(1, avail.available) };
      }
    } else if (!avail.ok) {
      return apiFail(avail.message || 'Not available for these dates.', 400);
    }

    let creditsApplied = 0;
    if (useCredits && session.guestId) {
      const { queryTenant } = await import('@/lib/db/tenant');
      const creditRows = await queryTenant<Array<{ account_credits: number }>>(
        resolved.ctx.db,
        `SELECT COALESCE(account_credits, 0) AS account_credits FROM guest_accounts WHERE guest_id = :guestId LIMIT 1`,
        { guestId: session.guestId }
      );
      creditsApplied = Number(creditRows[0]?.account_credits ?? 0);
    }

    const { quote, settings, promoMeta } = await buildGuestBookingQuote(
      resolved.ctx.db,
      resolved.ctx.propertyId,
      {
        ratePerNight: Number(avail.rate_per_night),
        checkIn,
        checkOut,
        upsells,
        promoCode,
        creditsApplied,
      }
    );

    const booking = await createWebsiteBooking(resolved.ctx.db, resolved.ctx.propertyId, {
      room_type_id: roomTypeId,
      room_id: body.room_id ? Number(body.room_id) : undefined,
      check_in_date: checkIn,
      check_out_date: checkOut,
      adults: Math.max(1, Number(body.adults) || 1),
      children: Math.max(0, Number(body.children) || 0),
      first_name: firstName,
      last_name: lastName,
      email,
      phone: phone || undefined,
      notes: body.notes ? String(body.notes) : undefined,
      hold_session_id: await getHoldSessionId(),
      payment_choice: paymentChoice,
    });

    await finalizeWebsiteBookingCharges(
      resolved.ctx.db,
      resolved.ctx.propertyId,
      booking.id,
      {
        checkIn,
        checkOut,
        upsells,
        quote,
        promo: promoMeta,
        guestId: session.guestId,
      }
    );

    // Paystack charges due_now only; deposit stays on folio as due at hotel.
    booking.total_amount = quote.due_now;

    const fullBooking = await getBookingByConfirmation(
      resolved.ctx.db,
      resolved.ctx.propertyId,
      booking.confirmation_code
    );

    // Pay-at-hotel: confirm immediately. Online: wait until Paystack succeeds.
    if (paymentChoice !== 'online' && fullBooking) {
      await sendBookingConfirmation(
        resolved.ctx.company.id,
        slug,
        resolved.ctx.branding.logo_url,
        {
          ...fullBooking,
          room_type_name: fullBooking.room_number
            ? `Room ${fullBooking.room_number}`
            : fullBooking.room_type_name,
        },
        email,
        phone,
        settings.currency
      );
    }

    return apiOk(
      { ...booking, status: fullBooking?.status || booking.status || (paymentChoice === 'online' ? 'pending' : 'confirmed') },
      paymentChoice === 'online' ? 'Booking reserved — complete payment to confirm.' : 'Booking confirmed.'
    );
  } catch (e) {
    console.error(e);
    const message = e instanceof Error ? e.message : 'Booking failed.';
    return apiFail(message, 400);
  }
}

export async function PUT(request: NextRequest, { params }: Params) {
  const { slug } = await params;
  const resolved = await requirePublicTenant(slug);
  if ('error' in resolved) return resolved.error;

  const session = await getSession();
  if (!session || session.type !== 'guest' || session.companySlug !== slug || !session.guestId) {
    return apiFail('Sign in to update booking check-in details.', 401);
  }

  try {
    const body = await request.json();
    const reservationId = Number(body.reservation_id);
    const arrivalTime = String(body.arrival_time || '').trim();
    const idDocumentUrl = String(body.id_document_url || '').trim();

    if (!reservationId || !arrivalTime) {
      return apiFail('reservation_id and arrival_time are required.');
    }
    if (!idDocumentUrl) {
      return apiFail('Please upload a valid ID document for digital check-in.');
    }

    await updateDigitalCheckin(
      resolved.ctx.db,
      resolved.ctx.propertyId,
      session.guestId,
      reservationId,
      arrivalTime,
      idDocumentUrl
    );

    return apiOk({}, 'Digital check-in pre-arrival complete.');
  } catch (e) {
    console.error(e);
    return apiFail('Digital check-in failed.', 400);
  }
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const { slug } = await params;
  const resolved = await requirePublicTenant(slug);
  if ('error' in resolved) return resolved.error;

  const session = await getSession();
  if (!session || session.type !== 'guest' || session.companySlug !== slug || !session.guestId) {
    return apiFail('Sign in to modify reservations.', 401);
  }

  try {
    const body = await request.json();
    const action = String(body.action || 'modify').trim();

    if (action === 'cancel_preview') {
      const reservationId = Number(body.reservation_id);
      if (!reservationId) return apiFail('reservation_id is required.');

      const { queryTenant } = await import('@/lib/db/tenant');
      const { getPropertyBookingSettings } = await import('@/lib/guest/booking-settings');
      const rows = await queryTenant<
        Array<{ check_in_date: string; total_amount: number }>
      >(
        resolved.ctx.db,
        `SELECT check_in_date, total_amount FROM reservations
         WHERE id = :id AND guest_id = :guestId AND property_id = :propertyId LIMIT 1`,
        { id: reservationId, guestId: session.guestId, propertyId: resolved.ctx.propertyId }
      );
      const booking = rows[0];
      if (!booking) return apiFail('Reservation not found.', 404);

      const folioRows = await queryTenant<Array<{ id: number }>>(
        resolved.ctx.db,
        `SELECT id FROM folios WHERE reservation_id = :reservationId LIMIT 1`,
        { reservationId }
      );
      let amountPaid = 0;
      if (folioRows[0]) {
        const paidRows = await queryTenant<Array<{ total: number }>>(
          resolved.ctx.db,
          `SELECT COALESCE(SUM(amount), 0) AS total FROM payments WHERE folio_id = :folioId`,
          { folioId: folioRows[0].id }
        );
        amountPaid = Number(paidRows[0]?.total ?? 0);
      }

      const settings = await getPropertyBookingSettings(resolved.ctx.db, resolved.ctx.propertyId);
      const preview = previewGuestCancellation(
        settings,
        String(booking.check_in_date).slice(0, 10),
        amountPaid,
        Number(booking.total_amount)
      );
      return apiOk(preview);
    }

    const reservationId = Number(body.reservation_id);
    const checkIn = String(body.check_in_date || '').trim();
    const checkOut = String(body.check_out_date || '').trim();
    const roomTypeId = Number(body.room_type_id);

    if (!reservationId || !checkIn || !checkOut || !roomTypeId) {
      return apiFail('reservation_id, check_in_date, check_out_date, and room_type_id are required.');
    }

    const result = await modifyReservationByGuest(
      resolved.ctx.db,
      resolved.ctx.propertyId,
      session.guestId,
      reservationId,
      checkIn,
      checkOut,
      roomTypeId
    );

    return apiOk(result, 'Reservation modified successfully.');
  } catch (e) {
    console.error(e);
    const message = e instanceof Error ? e.message : 'Modification failed.';
    return apiFail(message, 400);
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const { slug } = await params;
  const resolved = await requirePublicTenant(slug);
  if ('error' in resolved) return resolved.error;

  const session = await getSession();
  if (!session || session.type !== 'guest' || session.companySlug !== slug || !session.guestId) {
    return apiFail('Sign in to cancel reservations.', 401);
  }

  try {
    const reservationId = Number(request.nextUrl.searchParams.get('reservation_id'));
    if (!reservationId) return apiFail('reservation_id is required.');

    const result = await cancelReservationByGuest(
      resolved.ctx.db,
      resolved.ctx.propertyId,
      session.guestId,
      reservationId
    );
    return apiOk(result, 'Booking cancelled.');
  } catch (e) {
    console.error(e);
    const message = e instanceof Error ? e.message : 'Cancellation failed.';
    return apiFail(message, 400);
  }
}
