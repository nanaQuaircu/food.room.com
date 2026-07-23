import type { DbConfig } from '@/lib/db/central';
import { executeTenant, queryTenant } from '@/lib/db/tenant';
import { createNotification, createRoleNotification } from '@/lib/services/in-app-notifications';

export async function listMaintenanceLogs(db: DbConfig, propertyId: number) {
  return queryTenant(
    db,
    `SELECT ml.*, r.room_number,
            reporter.name AS reporter_name,
            assignee.name AS assignee_name
     FROM maintenance_logs ml
     LEFT JOIN rooms r ON r.id = ml.room_id
     LEFT JOIN users reporter ON reporter.id = ml.reported_by
     LEFT JOIN users assignee ON assignee.id = ml.assigned_to
     WHERE ml.property_id = :propertyId
     ORDER BY FIELD(ml.current_status, 'reported', 'scheduled', 'in_progress', 'pending_vendor', 'fixed', 'cancelled'),
              FIELD(ml.priority_level, 'critical', 'high', 'medium', 'low'),
              ml.reported_date DESC,
              ml.created_at DESC`,
    { propertyId }
  );
}

export async function createMaintenanceLog(
  db: DbConfig,
  propertyId: number,
  userId: number,
  input: {
    room_id?: number;
    location: string;
    item_category: string;
    priority_level: string;
    action_required: string;
    reported_date: string;
    cash_disbursed?: boolean;
    action_taken?: string;
    cash_disbursed_on?: string;
    estimated_cost?: number;
    current_status?: string;
    date_fixed?: string;
    remarks?: string;
    assigned_to?: number;
  }
) {
  const result = await executeTenant(
    db,
    `INSERT INTO maintenance_logs
      (property_id, room_id, location, item_category, priority_level, action_required, reported_date,
       cash_disbursed, action_taken, cash_disbursed_on, estimated_cost, current_status, date_fixed,
       remarks, reported_by, assigned_to)
     VALUES
      (:propertyId, :roomId, :location, :itemCategory, :priorityLevel, :actionRequired, :reportedDate,
       :cashDisbursed, :actionTaken, :cashDisbursedOn, :estimatedCost, :currentStatus, :dateFixed,
       :remarks, :userId, :assignedTo)`,
    {
      propertyId,
      roomId: input.room_id || null,
      location: input.location,
      itemCategory: input.item_category,
      priorityLevel: input.priority_level || 'medium',
      actionRequired: input.action_required,
      reportedDate: input.reported_date,
      cashDisbursed: input.cash_disbursed ? 1 : 0,
      actionTaken: input.action_taken || null,
      cashDisbursedOn: input.cash_disbursed_on || null,
      estimatedCost: input.estimated_cost ?? null,
      currentStatus: input.current_status || 'reported',
      dateFixed: input.date_fixed || null,
      remarks: input.remarks || null,
      userId,
      assignedTo: input.assigned_to || null,
    }
  );

  const id = Number((result as { insertId?: number }).insertId ?? 0);
  await createRoleNotification(db, ['owner', 'admin', 'manager', 'housekeeping', 'kitchen_supervisor'], {
    type: 'maintenance',
    title: 'Maintenance log reported',
    body: `${input.location}: ${input.item_category} - ${input.action_required}`,
    link: '/maintenance',
  });
  if (input.assigned_to) {
    await createNotification(db, {
      userId: input.assigned_to,
      type: 'maintenance',
      title: 'Maintenance item assigned',
      body: `${input.location}: ${input.item_category}`,
      link: '/maintenance',
    });
  }
  return id;
}

export async function updateMaintenanceLog(
  db: DbConfig,
  propertyId: number,
  id: number,
  input: {
    priority_level?: string;
    action_required?: string;
    cash_disbursed?: boolean;
    action_taken?: string;
    cash_disbursed_on?: string | null;
    estimated_cost?: number | null;
    current_status?: string;
    date_fixed?: string | null;
    remarks?: string;
    assigned_to?: number | null;
  }
) {
  const rows = await queryTenant<Array<{ assigned_to: number | null; location: string; item_category: string }>>(
    db,
    `SELECT assigned_to, location, item_category
     FROM maintenance_logs
     WHERE id = :id AND property_id = :propertyId
     LIMIT 1`,
    { id, propertyId }
  );
  const existing = rows[0];
  if (!existing) throw new Error('Maintenance log not found.');

  await executeTenant(
    db,
    `UPDATE maintenance_logs SET
       priority_level = COALESCE(:priorityLevel, priority_level),
       action_required = COALESCE(:actionRequired, action_required),
       cash_disbursed = IF(:hasCash = 1, :cashDisbursed, cash_disbursed),
       action_taken = COALESCE(:actionTaken, action_taken),
       cash_disbursed_on = IF(:hasCashDate = 1, :cashDate, cash_disbursed_on),
       estimated_cost = IF(:hasEstimate = 1, :estimatedCost, estimated_cost),
       current_status = COALESCE(:currentStatus, current_status),
       date_fixed = IF(:hasDateFixed = 1, :dateFixed, date_fixed),
       remarks = COALESCE(:remarks, remarks),
       assigned_to = IF(:hasAssignee = 1, :assignedTo, assigned_to)
     WHERE id = :id AND property_id = :propertyId`,
    {
      id,
      propertyId,
      priorityLevel: input.priority_level ?? null,
      actionRequired: input.action_required ?? null,
      hasCash: input.cash_disbursed !== undefined ? 1 : 0,
      cashDisbursed: input.cash_disbursed ? 1 : 0,
      actionTaken: input.action_taken ?? null,
      hasCashDate: input.cash_disbursed_on !== undefined ? 1 : 0,
      cashDate: input.cash_disbursed_on ?? null,
      hasEstimate: input.estimated_cost !== undefined ? 1 : 0,
      estimatedCost: input.estimated_cost ?? null,
      currentStatus: input.current_status ?? null,
      hasDateFixed: input.date_fixed !== undefined ? 1 : 0,
      dateFixed: input.date_fixed ?? null,
      remarks: input.remarks ?? null,
      hasAssignee: input.assigned_to !== undefined ? 1 : 0,
      assignedTo: input.assigned_to ?? null,
    }
  );

  if (input.assigned_to && input.assigned_to !== existing.assigned_to) {
    await createNotification(db, {
      userId: input.assigned_to,
      type: 'maintenance',
      title: 'Maintenance item assigned',
      body: `${existing.location}: ${existing.item_category}`,
      link: '/maintenance',
    });
  }
}
