import { NextRequest } from 'next/server';
import { requireTenant, isTenantContext } from '@/lib/api/tenant-context';
import { apiOk, apiFail } from '@/lib/api/json';
import { listRooms, createRoom, updateRoomStatus, updateRoom, deleteRoom } from '@/lib/services/hotel-service';

export async function GET() {
  const ctx = await requireTenant();
  if (!isTenantContext(ctx)) return ctx;
  try {
    const data = await listRooms(ctx.db, ctx.propertyId);
    return apiOk(data);
  } catch (e) {
    console.error(e);
    return apiFail('Failed to list rooms', 500);
  }
}

export async function POST(request: NextRequest) {
  const ctx = await requireTenant();
  if (!isTenantContext(ctx)) return ctx;
  try {
    const body = await request.json();
    const roomNumber = String(body.room_number || '').trim();
    const roomTypeId = body.room_type_id ? Number(body.room_type_id) : undefined;
    const baseRate =
      body.base_rate !== undefined && body.base_rate !== ''
        ? Number(body.base_rate)
        : undefined;

    if (!roomNumber) {
      return apiFail('Room number is required');
    }
    if (!roomTypeId && (baseRate === undefined || !Number.isFinite(baseRate))) {
      return apiFail('Nightly rate is required');
    }

    const id = await createRoom(ctx.db, ctx.propertyId, {
      room_number: roomNumber,
      room_type_id: roomTypeId,
      base_rate: baseRate,
      max_occupancy: body.max_occupancy ? Number(body.max_occupancy) : undefined,
      floor: body.floor ? String(body.floor) : undefined,
      status: body.status ? String(body.status) : undefined,
      description: body.description != null ? String(body.description) : undefined,
      amenities: Array.isArray(body.amenities) ? body.amenities.map(String) : undefined,
      bed_type: body.bed_type != null ? String(body.bed_type) : undefined,
      size_sqm:
        body.size_sqm !== undefined && body.size_sqm !== ''
          ? Number(body.size_sqm)
          : undefined,
    });
    return apiOk({ id });
  } catch (e) {
    console.error(e);
    const message = e instanceof Error ? e.message : 'Failed to create room';
    const status = /already exists|required|valid room type|Invalid room|Nightly rate/i.test(
      message
    )
      ? 400
      : 500;
    return apiFail(message, status);
  }
}

export async function PATCH(request: NextRequest) {
  const ctx = await requireTenant();
  if (!isTenantContext(ctx)) return ctx;
  try {
    const body = await request.json();
    const id = Number(body.id);

    if (!id) {
      return apiFail('id is required');
    }

    if (
      body.status &&
      !body.room_type_id &&
      !body.room_number &&
      body.floor === undefined &&
      body.base_rate === undefined &&
      body.max_occupancy === undefined
    ) {
      await updateRoomStatus(ctx.db, id, String(body.status).trim());
      return apiOk({ id, status: body.status });
    }

    await updateRoom(ctx.db, ctx.propertyId, id, {
      room_type_id: body.room_type_id ? Number(body.room_type_id) : undefined,
      room_number: body.room_number ? String(body.room_number).trim() : undefined,
      floor: body.floor !== undefined ? String(body.floor) : undefined,
      status: body.status ? String(body.status) : undefined,
      base_rate:
        body.base_rate !== undefined && body.base_rate !== ''
          ? Number(body.base_rate)
          : undefined,
      max_occupancy:
        body.max_occupancy !== undefined && body.max_occupancy !== ''
          ? Number(body.max_occupancy)
          : undefined,
      description: body.description !== undefined ? String(body.description) : undefined,
      amenities: Array.isArray(body.amenities) ? body.amenities.map(String) : undefined,
      bed_type: body.bed_type !== undefined ? String(body.bed_type) : undefined,
      size_sqm:
        body.size_sqm !== undefined
          ? body.size_sqm === '' || body.size_sqm === null
            ? null
            : Number(body.size_sqm)
          : undefined,
    });
    return apiOk({ id });
  } catch (e) {
    console.error(e);
    const message = e instanceof Error ? e.message : 'Failed to update room';
    return apiFail(message, 500);
  }
}

export async function DELETE(request: NextRequest) {
  const ctx = await requireTenant();
  if (!isTenantContext(ctx)) return ctx;
  try {
    const id = Number(new URL(request.url).searchParams.get('id'));
    if (!id) return apiFail('id is required');
    await deleteRoom(ctx.db, ctx.propertyId, id);
    return apiOk({ id });
  } catch (e) {
    console.error(e);
    const message = e instanceof Error ? e.message : 'Failed to delete room';
    return apiFail(message, 400);
  }
}
