import { NextRequest } from 'next/server';
import { apiFail, apiOk } from '@/lib/api/json';
import { requireTenant, isTenantContext } from '@/lib/api/tenant-context';
import { listStaff } from '@/lib/services/hotel-service';
import { getRoomStatusBoard } from '@/lib/services/hotel-service';
import { createMaintenanceLog, listMaintenanceLogs, updateMaintenanceLog } from '@/lib/services/maintenance-log-service';

export async function GET() {
  const ctx = await requireTenant();
  if (!isTenantContext(ctx)) return ctx;
  try {
    const [logs, rooms, staffRows] = await Promise.all([
      listMaintenanceLogs(ctx.db, ctx.propertyId),
      getRoomStatusBoard(ctx.db, ctx.propertyId),
      listStaff(ctx.db, ctx.propertyId),
    ]);
    const staff = (staffRows as Array<{ id: number; name: string; role: string; is_active: number }>)
      .filter((s) => s.is_active === 1)
      .map((s) => ({ id: s.id, name: s.name, role: s.role }));
    return apiOk({ logs, rooms, staff });
  } catch (error) {
    console.error(error);
    return apiFail('Failed to load maintenance data.', 500);
  }
}

export async function POST(request: NextRequest) {
  const ctx = await requireTenant();
  if (!isTenantContext(ctx)) return ctx;
  try {
    const body = await request.json();
    const location = String(body.location || '').trim();
    const itemCategory = String(body.item_category || '').trim();
    const actionRequired = String(body.action_required || '').trim();
    const reportedDate = String(body.reported_date || '').trim();
    if (!location || !itemCategory || !actionRequired || !reportedDate) {
      return apiFail('location, item_category, action_required, and reported_date are required.');
    }
    const id = await createMaintenanceLog(ctx.db, ctx.propertyId, ctx.session.userId, {
      room_id: body.room_id ? Number(body.room_id) : undefined,
      location,
      item_category: itemCategory,
      priority_level: body.priority_level ? String(body.priority_level) : 'medium',
      action_required: actionRequired,
      reported_date: reportedDate,
      cash_disbursed: Boolean(body.cash_disbursed),
      action_taken: body.action_taken ? String(body.action_taken) : undefined,
      cash_disbursed_on: body.cash_disbursed_on ? String(body.cash_disbursed_on) : undefined,
      estimated_cost: body.estimated_cost != null && body.estimated_cost !== '' ? Number(body.estimated_cost) : undefined,
      current_status: body.current_status ? String(body.current_status) : undefined,
      date_fixed: body.date_fixed ? String(body.date_fixed) : undefined,
      remarks: body.remarks ? String(body.remarks) : undefined,
      assigned_to: body.assigned_to ? Number(body.assigned_to) : undefined,
    });
    return apiOk({ id }, 'Maintenance log added.');
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : 'Failed to add maintenance log.';
    return apiFail(message, 400);
  }
}

export async function PATCH(request: NextRequest) {
  const ctx = await requireTenant();
  if (!isTenantContext(ctx)) return ctx;
  try {
    const body = await request.json();
    const id = Number(body.id);
    if (!id) return apiFail('id is required.');
    await updateMaintenanceLog(ctx.db, ctx.propertyId, id, {
      priority_level: body.priority_level ? String(body.priority_level) : undefined,
      action_required: body.action_required !== undefined ? String(body.action_required) : undefined,
      cash_disbursed: body.cash_disbursed !== undefined ? Boolean(body.cash_disbursed) : undefined,
      action_taken: body.action_taken !== undefined ? String(body.action_taken) : undefined,
      cash_disbursed_on: body.cash_disbursed_on !== undefined ? (body.cash_disbursed_on ? String(body.cash_disbursed_on) : null) : undefined,
      estimated_cost: body.estimated_cost !== undefined ? (body.estimated_cost === '' ? null : Number(body.estimated_cost)) : undefined,
      current_status: body.current_status ? String(body.current_status) : undefined,
      date_fixed: body.date_fixed !== undefined ? (body.date_fixed ? String(body.date_fixed) : null) : undefined,
      remarks: body.remarks !== undefined ? String(body.remarks) : undefined,
      assigned_to: body.assigned_to !== undefined ? (body.assigned_to ? Number(body.assigned_to) : null) : undefined,
    });
    return apiOk({ id }, 'Maintenance log updated.');
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : 'Failed to update maintenance log.';
    return apiFail(message, 400);
  }
}
