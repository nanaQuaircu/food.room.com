import { executeTenant, queryTenant } from '@/lib/db/tenant';
import type { DbConfig } from '@/lib/db/central';
import { createNotification, createRoleNotification } from '@/lib/services/in-app-notifications';

export async function listMaintenanceTickets(db: DbConfig, propertyId: number) {
  return queryTenant(
    db,
    `SELECT t.*, r.room_number,
            reporter.name AS reporter_name,
            assignee.name AS assignee_name
     FROM maintenance_tickets t
     JOIN rooms r ON r.id = t.room_id
     LEFT JOIN users reporter ON reporter.id = t.reported_by
     LEFT JOIN users assignee ON assignee.id = t.assigned_to
     WHERE t.property_id = :propertyId
     ORDER BY FIELD(t.status, 'open', 'in_progress', 'resolved', 'cancelled'),
              FIELD(t.priority, 'urgent', 'high', 'medium', 'low'),
              t.created_at DESC`,
    { propertyId }
  );
}

export async function createMaintenanceTicket(
  db: DbConfig,
  propertyId: number,
  userId: number,
  input: {
    room_id: number;
    title: string;
    description?: string;
    priority?: string;
    assigned_to?: number;
  }
) {
  const rooms = await queryTenant<Array<{ status: string; room_number: string }>>(
    db,
    `SELECT status, room_number FROM rooms WHERE id = :id AND property_id = :propertyId LIMIT 1`,
    { id: input.room_id, propertyId }
  );
  const room = rooms[0];
  if (!room) throw new Error('Room not found.');

  const result = await executeTenant(
    db,
    `INSERT INTO maintenance_tickets
      (property_id, room_id, title, description, priority, status, reported_by, assigned_to, previous_room_status)
     VALUES
      (:propertyId, :roomId, :title, :description, :priority, 'open', :userId, :assignedTo, :prevStatus)`,
    {
      propertyId,
      roomId: input.room_id,
      title: input.title,
      description: input.description || null,
      priority: input.priority || 'medium',
      userId,
      assignedTo: input.assigned_to || null,
      prevStatus: room.status,
    }
  );

  await executeTenant(
    db,
    `UPDATE rooms SET status = 'out_of_order' WHERE id = :id`,
    { id: input.room_id }
  );

  const ticketId = Number((result as { insertId?: number }).insertId);

  await createRoleNotification(db, ['owner', 'admin', 'manager', 'housekeeping'], {
    type: 'maintenance',
    title: 'Maintenance ticket opened',
    body: `Room ${room.room_number}: ${input.title}`,
    link: '/housekeeping',
  });
  if (input.assigned_to) {
    await createNotification(db, {
      userId: input.assigned_to,
      type: 'maintenance',
      title: 'Ticket assigned to you',
      body: `Room ${room.room_number}: ${input.title}`,
      link: '/housekeeping',
    });
  }

  return ticketId;
}

export async function updateMaintenanceTicket(
  db: DbConfig,
  propertyId: number,
  id: number,
  input: {
    status?: string;
    priority?: string;
    assigned_to?: number | null;
    description?: string;
    title?: string;
  }
) {
  const rows = await queryTenant<
    Array<{
      room_id: number;
      status: string;
      previous_room_status: string | null;
      title: string;
      assigned_to: number | null;
    }>
  >(
    db,
    `SELECT room_id, status, previous_room_status, title, assigned_to
     FROM maintenance_tickets WHERE id = :id AND property_id = :propertyId LIMIT 1`,
    { id, propertyId }
  );
  const ticket = rows[0];
  if (!ticket) throw new Error('Ticket not found.');

  const nextStatus = input.status ?? ticket.status;
  const resolving = nextStatus === 'resolved' && ticket.status !== 'resolved';

  await executeTenant(
    db,
    `UPDATE maintenance_tickets SET
       status = COALESCE(:status, status),
       priority = COALESCE(:priority, priority),
       title = COALESCE(:title, title),
       description = COALESCE(:description, description),
       assigned_to = IF(:hasAssignee = 1, :assignedTo, assigned_to),
       resolved_at = IF(:resolving = 1, CURRENT_TIMESTAMP, resolved_at)
     WHERE id = :id AND property_id = :propertyId`,
    {
      id,
      propertyId,
      status: input.status ?? null,
      priority: input.priority ?? null,
      title: input.title ?? null,
      description: input.description ?? null,
      hasAssignee: input.assigned_to !== undefined ? 1 : 0,
      assignedTo: input.assigned_to ?? null,
      resolving: resolving ? 1 : 0,
    }
  );

  if (resolving) {
    const restore = ticket.previous_room_status && ticket.previous_room_status !== 'out_of_order'
      ? ticket.previous_room_status
      : 'dirty';
    await executeTenant(db, `UPDATE rooms SET status = :status WHERE id = :roomId`, {
      status: restore,
      roomId: ticket.room_id,
    });
    await createRoleNotification(db, ['owner', 'admin', 'manager', 'housekeeping'], {
      type: 'maintenance',
      title: 'Maintenance ticket resolved',
      body: ticket.title,
      link: '/housekeeping',
    });
  }

  if (input.assigned_to && input.assigned_to !== ticket.assigned_to) {
    await createNotification(db, {
      userId: input.assigned_to,
      type: 'maintenance',
      title: 'Ticket assigned to you',
      body: ticket.title,
      link: '/housekeeping',
    });
  }
}
