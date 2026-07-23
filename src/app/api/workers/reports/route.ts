import { requireTenant, isTenantContext, requireTenantRoles } from '@/lib/api/tenant-context';
import { apiFail, apiOk } from '@/lib/api/json';
import { ATTENDANCE_ADMIN_ROLES } from '@/lib/roles';
import { queryTenant } from '@/lib/db/tenant';

export async function GET() {
  const ctx = await requireTenant();
  if (!isTenantContext(ctx)) return ctx;
  const denied = requireTenantRoles(ctx, ATTENDANCE_ADMIN_ROLES);
  if (denied) return denied;

  try {
    const [attendanceSummary, roleSummary] = await Promise.all([
      queryTenant<
        Array<{
          user_id: number;
          user_name: string;
          role: string;
          days_present: number;
          late_clock_ins: number;
        }>
      >(
        ctx.db,
        `SELECT u.id AS user_id, u.name AS user_name, u.role,
                COUNT(ea.id) AS days_present,
                SUM(CASE WHEN TIME(ea.clock_in_at) > '09:15:00' THEN 1 ELSE 0 END) AS late_clock_ins
         FROM users u
         LEFT JOIN employee_attendance ea
           ON ea.user_id = u.id
          AND ea.work_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
         WHERE u.property_id = :propertyId
         GROUP BY u.id, u.name, u.role
         ORDER BY u.name`,
        { propertyId: ctx.propertyId }
      ),
      queryTenant<Array<{ role: string; staff_count: number }>>(
        ctx.db,
        `SELECT role, COUNT(*) AS staff_count
         FROM users
         WHERE property_id = :propertyId AND is_active = 1
         GROUP BY role
         ORDER BY role`,
        { propertyId: ctx.propertyId }
      ),
    ]);

    return apiOk({
      attendance_summary: attendanceSummary.map((r) => ({
        ...r,
        days_present: Number(r.days_present),
        late_clock_ins: Number(r.late_clock_ins),
      })),
      role_summary: roleSummary.map((r) => ({ ...r, staff_count: Number(r.staff_count) })),
      period_days: 30,
    });
  } catch (error) {
    console.error(error);
    return apiFail('Failed to generate worker reports.', 500);
  }
}
