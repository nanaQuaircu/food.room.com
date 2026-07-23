import { NextRequest } from 'next/server';
import { requireTenant, isTenantContext } from '@/lib/api/tenant-context';
import { apiOk, apiFail } from '@/lib/api/json';
import { listRoomTypes, createRoomType, updateRoomType, deleteRoomType } from '@/lib/services/hotel-service';

export async function GET() {
  const ctx = await requireTenant();
  if (!isTenantContext(ctx)) return ctx;
  try {
    const data = await listRoomTypes(ctx.db, ctx.propertyId);
    return apiOk(data);
  } catch (e) {
    console.error(e);
    return apiFail('Failed to list room types', 500);
  }
}

export async function POST(request: NextRequest) {
  const ctx = await requireTenant();
  if (!isTenantContext(ctx)) return ctx;
  try {
    const body = await request.json();
    const name = String(body.name || '').trim();
    const code = String(body.code || '').trim();
    const baseRate = Number(body.base_rate);
    const maxOccupancy = Number(body.max_occupancy);

    if (!name || !code || Number.isNaN(baseRate) || Number.isNaN(maxOccupancy)) {
      return apiFail('name, code, base_rate, and max_occupancy are required');
    }

    const id = await createRoomType(ctx.db, ctx.propertyId, {
      name,
      code,
      base_rate: baseRate,
      max_occupancy: maxOccupancy,
      description: body.description ? String(body.description) : undefined,
    });
    return apiOk({ id });
  } catch (e) {
    console.error(e);
    return apiFail('Failed to create room type', 500);
  }
}

export async function PATCH(request: NextRequest) {
  const ctx = await requireTenant();
  if (!isTenantContext(ctx)) return ctx;
  try {
    const body = await request.json();
    const id = Number(body.id);
    if (!id) return apiFail('id is required');

    await updateRoomType(ctx.db, ctx.propertyId, id, {
      name: body.name ? String(body.name).trim() : undefined,
      code: body.code ? String(body.code).trim() : undefined,
      base_rate: body.base_rate !== undefined ? Number(body.base_rate) : undefined,
      max_occupancy: body.max_occupancy !== undefined ? Number(body.max_occupancy) : undefined,
      description: body.description !== undefined ? String(body.description) : undefined,
    });
    return apiOk({ id });
  } catch (e) {
    console.error(e);
    return apiFail('Failed to update room type', 500);
  }
}

export async function DELETE(request: NextRequest) {
  const ctx = await requireTenant();
  if (!isTenantContext(ctx)) return ctx;
  try {
    const id = Number(new URL(request.url).searchParams.get('id'));
    if (!id) return apiFail('id is required');
    await deleteRoomType(ctx.db, ctx.propertyId, id);
    return apiOk({ id });
  } catch (e) {
    console.error(e);
    const message = e instanceof Error ? e.message : 'Failed to delete room type';
    return apiFail(message, 400);
  }
}
