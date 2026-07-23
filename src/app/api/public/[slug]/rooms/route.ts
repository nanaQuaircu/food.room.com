import { apiOk, apiFail } from '@/lib/api/json';
import { requirePublicTenant } from '@/lib/public/require-public-tenant';
import { listPublicCatalogRooms } from '@/lib/services/public-guest-service';

type Params = { params: Promise<{ slug: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { slug } = await params;
  const resolved = await requirePublicTenant(slug);
  if ('error' in resolved) return resolved.error;

  try {
    const rooms = await listPublicCatalogRooms(resolved.ctx.db, resolved.ctx.propertyId);
    return apiOk(rooms);
  } catch (e) {
    console.error(e);
    return apiFail('Failed to load rooms.', 500);
  }
}
