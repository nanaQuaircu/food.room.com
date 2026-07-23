import { NextRequest } from 'next/server';
import { requireTenant, isTenantContext } from '@/lib/api/tenant-context';
import { apiOk, apiFail } from '@/lib/api/json';
import { listGuests, createGuest, updateGuest, getGuestById, deleteGuest } from '@/lib/services/hotel-service';

export async function GET(request: NextRequest) {
  const ctx = await requireTenant();
  if (!isTenantContext(ctx)) return ctx;
  try {
    const id = Number(request.nextUrl.searchParams.get('id') || 0);
    const history = request.nextUrl.searchParams.get('history');
    if (id > 0 && history === '1') {
      const { listGuestStayHistory } = await import('@/lib/services/guest-booking-extras');
      const stays = await listGuestStayHistory(ctx.db, ctx.propertyId, id);
      return apiOk(stays);
    }
    if (id > 0) {
      const guest = await getGuestById(ctx.db, id);
      if (!guest) return apiFail('Guest not found', 404);
      return apiOk(guest);
    }

    const search = request.nextUrl.searchParams.get('search') || '';
    const data = await listGuests(ctx.db, search);
    return apiOk(data);
  } catch (e) {
    console.error(e);
    return apiFail('Failed to load guests', 500);
  }
}

export async function POST(request: NextRequest) {
  const ctx = await requireTenant();
  if (!isTenantContext(ctx)) return ctx;
  try {
    const body = await request.json();
    const firstName = String(body.first_name || '').trim();
    const lastName = String(body.last_name || '').trim();

    if (!firstName || !lastName) {
      return apiFail('first_name and last_name are required');
    }

    const id = await createGuest(ctx.db, {
      first_name: firstName,
      last_name: lastName,
      email: body.email ? String(body.email) : undefined,
      phone: body.phone ? String(body.phone) : undefined,
      nationality: body.nationality ? String(body.nationality) : undefined,
      is_vip: Boolean(body.is_vip),
      notes: body.notes ? String(body.notes) : undefined,
    });
    return apiOk({ id });
  } catch (e) {
    console.error(e);
    return apiFail('Failed to create guest', 500);
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

    await updateGuest(ctx.db, id, {
      first_name: body.first_name !== undefined ? String(body.first_name).trim() : undefined,
      last_name: body.last_name !== undefined ? String(body.last_name).trim() : undefined,
      email: body.email !== undefined ? String(body.email) : undefined,
      phone: body.phone !== undefined ? String(body.phone) : undefined,
      nationality: body.nationality !== undefined ? String(body.nationality) : undefined,
      is_vip: body.is_vip !== undefined ? Boolean(body.is_vip) : undefined,
      is_blacklisted: body.is_blacklisted !== undefined ? Boolean(body.is_blacklisted) : undefined,
      notes: body.notes !== undefined ? String(body.notes) : undefined,
    });
    return apiOk({ id });
  } catch (e) {
    console.error(e);
    return apiFail('Failed to update guest', 500);
  }
}

export async function DELETE(request: NextRequest) {
  const ctx = await requireTenant();
  if (!isTenantContext(ctx)) return ctx;
  try {
    const id = Number(request.nextUrl.searchParams.get('id'));
    if (!id) return apiFail('id is required');
    await deleteGuest(ctx.db, id);
    return apiOk({ id });
  } catch (e) {
    console.error(e);
    const message = e instanceof Error ? e.message : 'Failed to delete guest';
    return apiFail(message, 400);
  }
}
