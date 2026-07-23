import { NextRequest } from 'next/server';
import { requireTenant, isTenantContext } from '@/lib/api/tenant-context';
import { apiOk, apiFail } from '@/lib/api/json';
import { ATTENDANCE_ADMIN_ROLES, hasAnyRole } from '@/lib/roles';
import {
  clockIn,
  clockOut,
  getPropertyGeofence,
  getUserTodayAttendance,
  listActiveStaffForAttendance,
  listAttendanceHistory,
  listTodayAttendance,
} from '@/lib/services/attendance-service';

export async function GET(request: NextRequest) {
  const ctx = await requireTenant();
  if (!isTenantContext(ctx)) return ctx;

  try {
    const { searchParams } = request.nextUrl;
    const scope = searchParams.get('scope');
    const isAdmin = hasAnyRole(ctx.session.userRole, ATTENDANCE_ADMIN_ROLES);

    if (scope === 'today') {
      const [record, todayRows, geofence] = await Promise.all([
        getUserTodayAttendance(ctx.db, ctx.propertyId, ctx.session.userId),
        isAdmin
          ? listTodayAttendance(ctx.db, ctx.propertyId)
          : listTodayAttendance(ctx.db, ctx.propertyId).then((rows) =>
              rows.filter((r) => r.user_id === ctx.session.userId)
            ),
        getPropertyGeofence(ctx.db, ctx.propertyId),
      ]);

      return apiOk({
        record,
        userName: ctx.session.userName,
        today: todayRows,
        canViewTeam: isAdmin,
        geofence,
      });
    }

    const from = searchParams.get('from') || undefined;
    const to = searchParams.get('to') || undefined;
    const search = searchParams.get('search')?.trim() || undefined;
    const userIdParam = searchParams.get('user_id');
    let userId = userIdParam ? Number(userIdParam) : undefined;

    if (!isAdmin) {
      userId = ctx.session.userId;
    }

    const [history, staff] = await Promise.all([
      listAttendanceHistory(ctx.db, ctx.propertyId, { from, to, userId, search }),
      isAdmin ? listActiveStaffForAttendance(ctx.db, ctx.propertyId) : Promise.resolve([]),
    ]);

    return apiOk({ history, staff, canViewTeam: isAdmin });
  } catch (e) {
    console.error(e);
    return apiFail('Failed to load attendance', 500);
  }
}

export async function POST(request: NextRequest) {
  const ctx = await requireTenant();
  if (!isTenantContext(ctx)) return ctx;

  try {
    const body = await request.json();
    const action = String(body.action || '').trim();
    const latitude = body.latitude != null ? Number(body.latitude) : undefined;
    const longitude = body.longitude != null ? Number(body.longitude) : undefined;
    const location = { latitude, longitude };

    if (action === 'clock_in') {
      const record = await clockIn(ctx.db, ctx.propertyId, ctx.session.userId, location);
      return apiOk({ record }, 'Clocked in successfully.');
    }

    if (action === 'clock_out') {
      const record = await clockOut(ctx.db, ctx.propertyId, ctx.session.userId, location);
      return apiOk({ record }, 'Clocked out successfully.');
    }

    return apiFail('Unknown action');
  } catch (e) {
    console.error(e);
    const message = e instanceof Error ? e.message : 'Attendance action failed';
    return apiFail(message, 400);
  }
}
