import { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { apiOk, apiFail } from '@/lib/api/json';
import { requirePublicTenant } from '@/lib/public/require-public-tenant';
import {
  getPublicAvailability,
  listPublicAvailableRooms,
} from '@/lib/services/public-guest-service';
import { buildGuestBookingQuote } from '@/lib/guest/booking-settings';
import type { UpsellsInput } from '@/lib/guest/booking-pricing';

type Params = { params: Promise<{ slug: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  const { slug } = await params;
  const resolved = await requirePublicTenant(slug);
  if ('error' in resolved) return resolved.error;

  const { searchParams } = request.nextUrl;
  const roomTypeId = Number(searchParams.get('room_type_id'));
  const roomId = searchParams.get('room_id') ? Number(searchParams.get('room_id')) : null;
  const checkIn = String(searchParams.get('check_in') || '').trim();
  const checkOut = String(searchParams.get('check_out') || '').trim();

  if (!roomTypeId || !checkIn || !checkOut) {
    return apiFail('room_type_id, check_in, and check_out are required.');
  }

  try {
    const cookieStore = await cookies();
    const holdSessionId = cookieStore.get('guest_hold_sid')?.value || undefined;

    let avail = await getPublicAvailability(
      resolved.ctx.db,
      resolved.ctx.propertyId,
      roomTypeId,
      checkIn,
      checkOut,
      { excludeSessionId: holdSessionId }
    );

    // Specific room: type inventory can disagree with the unit (and own soft-hold
    // must not block). Prefer the physical-room check when room_id is set.
    if (roomId) {
      const freeRooms = await listPublicAvailableRooms(
        resolved.ctx.db,
        resolved.ctx.propertyId,
        roomTypeId,
        checkIn,
        checkOut,
        holdSessionId
      );
      const roomFree = freeRooms.some((r) => r.id === roomId);
      if (!roomFree) {
        avail = {
          ...avail,
          ok: false,
          available: 0,
          message:
            'No availability for these dates. Add guest to waitlist or choose other dates.',
        };
      } else if (!avail.ok) {
        // Type-level sell limit may already be "full" because of this guest's hold
        // or a stale override — the chosen vacant room is free, so allow the quote.
        avail = { ...avail, ok: true, available: Math.max(1, avail.available) };
      }
    }

    const upsells: UpsellsInput = {
      breakfast: searchParams.get('breakfast') === '1',
      late_checkout: searchParams.get('late_checkout') === '1',
      spa: searchParams.get('spa') === '1',
    };
    const promoCode = searchParams.get('promo_code') || undefined;
    const creditsApplied = Number(searchParams.get('credits') || 0);

    const { quote, settings } = await buildGuestBookingQuote(
      resolved.ctx.db,
      resolved.ctx.propertyId,
      {
        ratePerNight: Number(avail.rate_per_night),
        checkIn,
        checkOut,
        upsells,
        promoCode,
        creditsApplied: creditsApplied > 0 ? creditsApplied : undefined,
      }
    );

    return apiOk({
      ...avail,
      quote,
      currency: settings.currency,
      cancellation_free_days: settings.cancellation_free_days,
      cancellation_penalty_pct: settings.cancellation_penalty_pct,
    });
  } catch (e) {
    console.error(e);
    const message = e instanceof Error ? e.message : 'Failed to build quote.';
    return apiFail(message, 400);
  }
}
