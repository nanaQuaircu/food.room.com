import { NextRequest } from 'next/server';
import { requireTenant, isTenantContext } from '@/lib/api/tenant-context';
import { apiOk, apiFail } from '@/lib/api/json';
import {
  listHousekeepingTasks,
  getRoomStatusBoard,
  createHousekeepingTask,
  updateHousekeepingTask,
  listStaff,
} from '@/lib/services/hotel-service';
import {
  createMaintenanceTicket,
  listMaintenanceTickets,
  updateMaintenanceTicket,
} from '@/lib/services/maintenance-tickets';

export async function GET() {
  const ctx = await requireTenant();
  if (!isTenantContext(ctx)) return ctx;
  try {
    const [tasks, board, staffRows, tickets] = await Promise.all([
      listHousekeepingTasks(ctx.db, ctx.propertyId),
      getRoomStatusBoard(ctx.db, ctx.propertyId),
      listStaff(ctx.db, ctx.propertyId),
      listMaintenanceTickets(ctx.db, ctx.propertyId),
    ]);
    const staff = (staffRows as Array<{ id: number; name: string; role: string; is_active: number }>)
      .filter((s) => s.is_active === 1 && ['housekeeping', 'manager', 'admin', 'owner'].includes(s.role))
      .map((s) => ({ id: s.id, name: s.name, role: s.role }));
    return apiOk({ tasks, board, staff, tickets });
  } catch (e) {
    console.error(e);
    return apiFail('Failed to load housekeeping data', 500);
  }
}

export async function POST(request: NextRequest) {
  const ctx = await requireTenant();
  if (!isTenantContext(ctx)) return ctx;
  try {
    const body = await request.json();
    const type = String(body.type || 'task').trim();

    if (type === 'ticket') {
      const roomId = Number(body.room_id);
      const title = String(body.title || '').trim();
      if (!roomId || !title) return apiFail('room_id and title are required');
      const id = await createMaintenanceTicket(ctx.db, ctx.propertyId, ctx.session.userId, {
        room_id: roomId,
        title,
        description: body.description ? String(body.description) : undefined,
        priority: body.priority ? String(body.priority) : undefined,
        assigned_to: body.assigned_to ? Number(body.assigned_to) : undefined,
      });
      return apiOk({ id });
    }

    const roomId = Number(body.room_id);
    const taskType = String(body.task_type || '').trim();

    if (!roomId || !taskType) {
      return apiFail('room_id and task_type are required');
    }

    const id = await createHousekeepingTask(ctx.db, ctx.propertyId, {
      room_id: roomId,
      task_type: taskType,
      notes: body.notes ? String(body.notes) : undefined,
      assigned_to: body.assigned_to ? Number(body.assigned_to) : undefined,
    });
    return apiOk({ id });
  } catch (e) {
    console.error(e);
    const message = e instanceof Error ? e.message : 'Failed to create housekeeping task';
    return apiFail(message, 500);
  }
}

export async function PATCH(request: NextRequest) {
  const ctx = await requireTenant();
  if (!isTenantContext(ctx)) return ctx;
  try {
    const body = await request.json();
    const id = Number(body.id);
    if (!id) return apiFail('id is required');

    if (body.type === 'ticket' || body.entity === 'ticket') {
      await updateMaintenanceTicket(ctx.db, ctx.propertyId, id, {
        status: body.status ? String(body.status) : undefined,
        priority: body.priority ? String(body.priority) : undefined,
        title: body.title ? String(body.title) : undefined,
        description: body.description !== undefined ? String(body.description) : undefined,
        assigned_to:
          body.assigned_to === null
            ? null
            : body.assigned_to !== undefined
              ? Number(body.assigned_to)
              : undefined,
      });
      return apiOk({ id });
    }

    await updateHousekeepingTask(ctx.db, id, {
      status: body.status ? String(body.status) : undefined,
      assigned_to:
        body.assigned_to === null
          ? null
          : body.assigned_to !== undefined
            ? Number(body.assigned_to)
            : undefined,
      notes: body.notes !== undefined ? String(body.notes) : undefined,
    });
    return apiOk({ id });
  } catch (e) {
    console.error(e);
    const message = e instanceof Error ? e.message : 'Failed to update housekeeping task';
    return apiFail(message, 500);
  }
}
