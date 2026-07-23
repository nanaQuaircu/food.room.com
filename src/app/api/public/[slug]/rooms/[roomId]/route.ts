import { apiOk, apiFail } from '@/lib/api/json';
import { requirePublicTenant } from '@/lib/public/require-public-tenant';
import { getPublicRoomDetails } from '@/lib/services/public-guest-service';

type Params = { params: Promise<{ slug: string; roomId: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { slug, roomId: roomIdRaw } = await params;
  const roomId = Number(roomIdRaw);
  if (!roomId) return apiFail('Invalid room id.');

  const resolved = await requirePublicTenant(slug);
  if ('error' in resolved) return resolved.error;

  try {
    const room = await getPublicRoomDetails(resolved.ctx.db, resolved.ctx.propertyId, roomId);
    if (!room) return apiFail('Room not found.', 404);
    return apiOk(room);
  } catch (e) {
    console.error(e);
    return apiFail('Failed to load room.', 500);
  }
}
