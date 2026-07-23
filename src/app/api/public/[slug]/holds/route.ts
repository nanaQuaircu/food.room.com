import { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { apiOk, apiFail } from '@/lib/api/json';
import { requirePublicTenant } from '@/lib/public/require-public-tenant';
import {
  createRoomHold,
  releaseRoomHold,
} from '@/lib/services/public-guest-service';

type Params = { params: Promise<{ slug: string }> };

async function getOrCreateHoldSessionId() {
  const cookieStore = await cookies();
  let sid = cookieStore.get('guest_hold_sid')?.value;
  if (!sid) {
    sid = 'sid_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    cookieStore.set('guest_hold_sid', sid, {
      httpOnly: true,
      maxAge: 60 * 60, // 1 hour
      path: '/',
    });
  }
  return sid;
}

export async function POST(request: NextRequest, { params }: Params) {
  const { slug } = await params;
  const resolved = await requirePublicTenant(slug);
  if ('error' in resolved) return resolved.error;

  try {
    const body = await request.json();
    const roomTypeId = Number(body.room_type_id);
    const roomId = body.room_id ? Number(body.room_id) : null;

    if (!roomTypeId) return apiFail('room_type_id is required.');

    const sessionId = await getOrCreateHoldSessionId();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes hold

    await createRoomHold(
      resolved.ctx.db,
      resolved.ctx.propertyId,
      roomTypeId,
      roomId,
      sessionId,
      expiresAt
    );

    return apiOk({ session_id: sessionId, expires_at: expiresAt }, 'Soft hold placed.');
  } catch (e) {
    console.error(e);
    return apiFail('Failed to place soft hold.', 500);
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const { slug } = await params;
  const resolved = await requirePublicTenant(slug);
  if ('error' in resolved) return resolved.error;

  try {
    const cookieStore = await cookies();
    const sessionId = cookieStore.get('guest_hold_sid')?.value;
    if (sessionId) {
      await releaseRoomHold(resolved.ctx.db, sessionId);
    }
    return apiOk({}, 'Hold released.');
  } catch (e) {
    console.error(e);
    return apiFail('Failed to release hold.', 500);
  }
}
