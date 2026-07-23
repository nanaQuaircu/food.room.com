import { NextRequest } from 'next/server';
import { requireTenant, isTenantContext, requireTenantRoles } from '@/lib/api/tenant-context';
import { apiOk, apiFail } from '@/lib/api/json';
import { listReservations } from '@/lib/services/hotel-service';
import {
  addWaitlistEntry,
  cancelReservationWithWaitlistNotify,
  cancelWaitlistEntry,
  checkAvailability,
  createReservationAdvanced,
  listRatePlans,
  listWaitlist,
  promoteWaitlistEntry,
  saveInventoryLimit,
  saveRatePlan,
  updateReservation,
} from '@/lib/services/reservations-loop2';

export async function GET(request: NextRequest) {
  const ctx = await requireTenant();
  if (!isTenantContext(ctx)) return ctx;
  try {
    const view = request.nextUrl.searchParams.get('view');
    if (view === 'rate_plans') {
      const roomTypeId = request.nextUrl.searchParams.get('room_type_id');
      return apiOk(
        await listRatePlans(
          ctx.db,
          ctx.propertyId,
          roomTypeId ? Number(roomTypeId) : undefined
        )
      );
    }
    if (view === 'waitlist') {
      return apiOk(await listWaitlist(ctx.db, ctx.propertyId));
    }
    if (view === 'availability') {
      const roomTypeId = Number(request.nextUrl.searchParams.get('room_type_id'));
      const checkIn = String(request.nextUrl.searchParams.get('check_in') || '');
      const checkOut = String(request.nextUrl.searchParams.get('check_out') || '');
      if (!roomTypeId || !checkIn || !checkOut) {
        return apiFail('room_type_id, check_in, and check_out are required');
      }
      return apiOk(await checkAvailability(ctx.db, ctx.propertyId, roomTypeId, checkIn, checkOut));
    }
    if (view === 'tape_chart') {
      const startDate =
        request.nextUrl.searchParams.get('start_date') ||
        new Date().toISOString().slice(0, 10);
      const days = Number(request.nextUrl.searchParams.get('days') || 14);
      const { getTapeChartData } = await import('@/lib/services/guest-booking-extras');
      return apiOk(await getTapeChartData(ctx.db, ctx.propertyId, startDate, days));
    }

    const status = request.nextUrl.searchParams.get('status') || undefined;
    const data = await listReservations(ctx.db, ctx.propertyId, status);
    return apiOk(data);
  } catch (e) {
    console.error(e);
    return apiFail('Failed to list reservations', 500);
  }
}

export async function POST(request: NextRequest) {
  const ctx = await requireTenant();
  if (!isTenantContext(ctx)) return ctx;
  try {
    const body = await request.json();
    const type = String(body.type || 'reservation').trim();

    if (type === 'rate_plan') {
      const denied = requireTenantRoles(ctx, ['owner', 'admin', 'manager']);
      if (denied) return denied;
      const id = await saveRatePlan(ctx.db, ctx.propertyId, {
        id: body.id ? Number(body.id) : undefined,
        name: String(body.name || '').trim(),
        code: body.code ? String(body.code) : undefined,
        description: body.description ? String(body.description) : undefined,
        room_type_id: body.room_type_id ? Number(body.room_type_id) : null,
        nightly_rate: Number(body.nightly_rate),
        is_active: body.is_active !== false,
      });
      return apiOk({ id });
    }

    if (type === 'inventory_limit') {
      const denied = requireTenantRoles(ctx, ['owner', 'admin', 'manager']);
      if (denied) return denied;
      await saveInventoryLimit(ctx.db, ctx.propertyId, {
        room_type_id: Number(body.room_type_id),
        overbook_percent: body.overbook_percent != null ? Number(body.overbook_percent) : 0,
        sell_limit_override:
          body.sell_limit_override != null && body.sell_limit_override !== ''
            ? Number(body.sell_limit_override)
            : null,
        allow_overbook: Boolean(body.allow_overbook),
      });
      return apiOk({ saved: true });
    }

    if (type === 'waitlist') {
      const guestId = Number(body.guest_id);
      const checkInDate = String(body.check_in_date || '').trim();
      const checkOutDate = String(body.check_out_date || '').trim();
      if (!guestId || !checkInDate || !checkOutDate) {
        return apiFail('guest_id, check_in_date, and check_out_date are required');
      }
      const id = await addWaitlistEntry(ctx.db, ctx.propertyId, ctx.session.userId, {
        guest_id: guestId,
        check_in_date: checkInDate,
        check_out_date: checkOutDate,
        room_type_id: body.room_type_id ? Number(body.room_type_id) : undefined,
        adults: body.adults ? Number(body.adults) : undefined,
        children: body.children ? Number(body.children) : undefined,
        notes: body.notes ? String(body.notes) : undefined,
        priority: body.priority ? Number(body.priority) : undefined,
      });
      return apiOk({ id });
    }

    if (type === 'waitlist_promote') {
      const denied = requireTenantRoles(ctx, ['owner', 'admin', 'manager', 'front_desk']);
      if (denied) return denied;
      const data = await promoteWaitlistEntry(
        ctx.db,
        ctx.propertyId,
        ctx.session.userId,
        Number(body.id),
        {
          force_overbook: Boolean(body.force_overbook),
          rate_plan_id: body.rate_plan_id ? Number(body.rate_plan_id) : undefined,
        }
      );
      return apiOk(data);
    }

    const guestId = Number(body.guest_id);
    const checkInDate = String(body.check_in_date || '').trim();
    const checkOutDate = String(body.check_out_date || '').trim();

    if (!guestId || !checkInDate || !checkOutDate) {
      return apiFail('guest_id, check_in_date, and check_out_date are required');
    }

    const data = await createReservationAdvanced(ctx.db, ctx.propertyId, ctx.session.userId, {
      guest_id: guestId,
      check_in_date: checkInDate,
      check_out_date: checkOutDate,
      room_type_id: body.room_type_id ? Number(body.room_type_id) : undefined,
      room_id: body.room_id ? Number(body.room_id) : undefined,
      rate_plan_id: body.rate_plan_id ? Number(body.rate_plan_id) : undefined,
      adults: body.adults ? Number(body.adults) : undefined,
      children: body.children ? Number(body.children) : undefined,
      rate_per_night: body.rate_per_night ? Number(body.rate_per_night) : undefined,
      deposit_amount: body.deposit_amount ? Number(body.deposit_amount) : undefined,
      deposit_method: body.deposit_method ? String(body.deposit_method) : undefined,
      notes: body.notes ? String(body.notes) : undefined,
      force_overbook: Boolean(body.force_overbook),
      billing_type: body.billing_type === 'corporate' ? 'corporate' : 'guest',
      corporate_account_id: body.corporate_account_id ? Number(body.corporate_account_id) : null,
    });
    return apiOk(data);
  } catch (e) {
    console.error(e);
    const message = e instanceof Error ? e.message : 'Failed to create reservation';
    return apiFail(message, 400);
  }
}

export async function PATCH(request: NextRequest) {
  const ctx = await requireTenant();
  if (!isTenantContext(ctx)) return ctx;
  try {
    const body = await request.json();
    const action = String(body.action || 'cancel').trim();
    const id = Number(body.id);
    if (!id) return apiFail('id is required');

    if (action === 'modify') {
      const data = await updateReservation(ctx.db, ctx.propertyId, id, {
        check_in_date: body.check_in_date ? String(body.check_in_date) : undefined,
        check_out_date: body.check_out_date ? String(body.check_out_date) : undefined,
        room_type_id: body.room_type_id != null ? Number(body.room_type_id) : undefined,
        rate_plan_id: body.rate_plan_id != null ? Number(body.rate_plan_id) : undefined,
        adults: body.adults != null ? Number(body.adults) : undefined,
        children: body.children != null ? Number(body.children) : undefined,
        rate_per_night: body.rate_per_night != null ? Number(body.rate_per_night) : undefined,
        notes: body.notes != null ? String(body.notes) : undefined,
        force_overbook: Boolean(body.force_overbook),
      });
      return apiOk(data);
    }

    if (action === 'waitlist_cancel') {
      await cancelWaitlistEntry(ctx.db, ctx.propertyId, id);
      return apiOk({ id, status: 'cancelled' });
    }

    if (action === 'no_show') {
      const { markReservationNoShow } = await import('@/lib/services/guest-booking-extras');
      await markReservationNoShow(ctx.db, ctx.propertyId, id);
      return apiOk({ id, status: 'no_show' });
    }

    await cancelReservationWithWaitlistNotify(ctx.db, ctx.propertyId, id);
    return apiOk({ id, status: 'cancelled' });
  } catch (e) {
    console.error(e);
    const message = e instanceof Error ? e.message : 'Failed to update reservation';
    return apiFail(message, 400);
  }
}
