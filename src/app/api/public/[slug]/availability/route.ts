import { NextRequest } from 'next/server';
import { apiOk, apiFail } from '@/lib/api/json';
import { requirePublicTenant } from '@/lib/public/require-public-tenant';
import { getPublicAvailability } from '@/lib/services/public-guest-service';

type Params = { params: Promise<{ slug: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  const { slug } = await params;
  const resolved = await requirePublicTenant(slug);
  if ('error' in resolved) return resolved.error;

  const { searchParams } = request.nextUrl;
  const roomTypeId = Number(searchParams.get('room_type_id'));
  const checkIn = String(searchParams.get('check_in') || '').trim();
  const checkOut = String(searchParams.get('check_out') || '').trim();

  if (!roomTypeId || !checkIn || !checkOut) {
    return apiFail('room_type_id, check_in, and check_out are required.');
  }

  try {
    const data = await getPublicAvailability(
      resolved.ctx.db,
      resolved.ctx.propertyId,
      roomTypeId,
      checkIn,
      checkOut
    );
    return apiOk(data);
  } catch (e) {
    console.error(e);
    return apiFail('Failed to check availability.', 500);
  }
}
