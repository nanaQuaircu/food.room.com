import { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { apiOk, apiFail } from '@/lib/api/json';
import { requirePublicTenant } from '@/lib/public/require-public-tenant';
import {
  getPublicRoomType,
  listPublicAvailableRooms,
} from '@/lib/services/public-guest-service';

type Params = { params: Promise<{ slug: string; roomTypeId: string }> };

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDaysIso(iso: string, days: number) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export async function GET(request: NextRequest, { params }: Params) {
  const { slug, roomTypeId: roomTypeIdRaw } = await params;
  const resolved = await requirePublicTenant(slug);
  if ('error' in resolved) return resolved.error;

  const roomTypeId = Number(roomTypeIdRaw);
  if (!roomTypeId) return apiFail('Invalid room type.');

  const { searchParams } = request.nextUrl;
  const checkIn = String(searchParams.get('check_in') || todayIso()).trim();
  const checkOut = String(searchParams.get('check_out') || addDaysIso(checkIn, 1)).trim();
  const cookieStore = await cookies();
  const sessionId = cookieStore.get('guest_hold_sid')?.value;

  try {
    const roomType = await getPublicRoomType(resolved.ctx.db, resolved.ctx.propertyId, roomTypeId);
    if (!roomType) return apiFail('Room type not found.', 404);

    const rooms = await listPublicAvailableRooms(
      resolved.ctx.db,
      resolved.ctx.propertyId,
      roomTypeId,
      checkIn,
      checkOut,
      sessionId
    );

    return apiOk({ room_type: roomType, rooms, check_in: checkIn, check_out: checkOut });
  } catch (e) {
    console.error(e);
    return apiFail('Failed to load available rooms.', 500);
  }
}
