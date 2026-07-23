import { NextRequest } from 'next/server';
import { apiOk, apiFail } from '@/lib/api/json';
import { requirePublicTenant } from '@/lib/public/require-public-tenant';
import { getSession } from '@/lib/tenant/session';
import {
  getRoomTypeReviews,
  saveRoomTypeReview,
} from '@/lib/services/public-guest-service';

type Params = { params: Promise<{ slug: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  const { slug } = await params;
  const resolved = await requirePublicTenant(slug);
  if ('error' in resolved) return resolved.error;

  const roomTypeId = Number(request.nextUrl.searchParams.get('room_type_id'));
  if (!roomTypeId) return apiFail('room_type_id is required.');

  try {
    const reviews = await getRoomTypeReviews(resolved.ctx.db, resolved.ctx.propertyId, roomTypeId);
    return apiOk(reviews);
  } catch (e) {
    console.error(e);
    return apiFail('Failed to load reviews.', 500);
  }
}

export async function POST(request: NextRequest, { params }: Params) {
  const { slug } = await params;
  const resolved = await requirePublicTenant(slug);
  if ('error' in resolved) return resolved.error;

  const session = await getSession();
  if (!session || session.type !== 'guest' || session.companySlug !== slug || !session.guestId) {
    return apiFail('Sign in to leave a review.', 401);
  }

  try {
    const body = await request.json();
    const reservationId = Number(body.reservation_id);
    const roomTypeId = Number(body.room_type_id);
    const rating = Math.max(1, Math.min(5, Number(body.rating) || 5));
    const comment = String(body.comment || '').trim();

    if (!reservationId || !roomTypeId || !comment) {
      return apiFail('reservation_id, room_type_id, and comment are required.');
    }

    await saveRoomTypeReview(
      resolved.ctx.db,
      resolved.ctx.propertyId,
      session.guestId,
      reservationId,
      roomTypeId,
      rating,
      comment
    );

    return apiOk({}, 'Review posted successfully.');
  } catch (e) {
    console.error(e);
    const message = e instanceof Error ? e.message : 'Failed to save review.';
    return apiFail(message, 400);
  }
}
