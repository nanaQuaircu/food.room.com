import { apiOk, apiFail } from '@/lib/api/json';
import { requirePublicTenant } from '@/lib/public/require-public-tenant';
import { listPublicRoomTypes } from '@/lib/services/public-guest-service';

type Params = { params: Promise<{ slug: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { slug } = await params;
  const resolved = await requirePublicTenant(slug);
  if ('error' in resolved) return resolved.error;

  try {
    const roomTypes = await listPublicRoomTypes(resolved.ctx.db, resolved.ctx.propertyId);
    return apiOk(roomTypes);
  } catch (e) {
    console.error(e);
    return apiFail('Failed to load room types.', 500);
  }
}
