import type { DbConfig } from '@/lib/db/central';
import { executeTenant, queryTenant } from '@/lib/db/tenant';
import { isWithinRadius } from '@/lib/geo/haversine';

export type PropertyGeofence = {
  attendance_latitude: number | null;
  attendance_longitude: number | null;
  attendance_radius_m: number | null;
  geofence_enabled: boolean;
};

export type AttendanceRow = {
  id: number;
  user_id: number;
  user_name: string;
  work_date: string;
  clock_in_at: string | null;
  clock_out_at: string | null;
  notes: string | null;
};

export type TodayAttendanceRow = {
  user_id: number;
  user_name: string;
  clock_in_at: string | null;
  clock_out_at: string | null;
};

function localTodayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export async function getUserTodayAttendance(
  db: DbConfig,
  propertyId: number,
  userId: number
) {
  const today = localTodayIso();
  const rows = await queryTenant<
    Array<{
      id: number;
      clock_in_at: string | null;
      clock_out_at: string | null;
    }>
  >(
    db,
    `SELECT id, clock_in_at, clock_out_at
     FROM employee_attendance
     WHERE property_id = :propertyId AND user_id = :userId AND work_date = :today
     LIMIT 1`,
    { propertyId, userId, today }
  );
  return rows[0] ?? null;
}

export async function listTodayAttendance(db: DbConfig, propertyId: number) {
  const today = localTodayIso();
  return queryTenant<TodayAttendanceRow[]>(
    db,
    `SELECT ea.user_id,
            u.name AS user_name,
            ea.clock_in_at,
            ea.clock_out_at
     FROM employee_attendance ea
     INNER JOIN users u ON u.id = ea.user_id
     WHERE ea.property_id = :propertyId AND ea.work_date = :today
     ORDER BY ea.clock_in_at DESC, u.name`,
    { propertyId, today }
  );
}

export async function listAttendanceHistory(
  db: DbConfig,
  propertyId: number,
  filters: {
    from?: string;
    to?: string;
    userId?: number;
    search?: string;
  }
) {
  const where: string[] = ['ea.property_id = :propertyId'];
  const params: Record<string, string | number> = { propertyId };

  if (filters.from) {
    where.push('ea.work_date >= :fromDate');
    params.fromDate = filters.from;
  }
  if (filters.to) {
    where.push('ea.work_date <= :toDate');
    params.toDate = filters.to;
  }
  if (filters.userId) {
    where.push('ea.user_id = :userId');
    params.userId = filters.userId;
  }
  if (filters.search) {
    where.push('u.name LIKE :search');
    params.search = `%${filters.search}%`;
  }

  return queryTenant<AttendanceRow[]>(
    db,
    `SELECT ea.id,
            ea.user_id,
            u.name AS user_name,
            DATE_FORMAT(ea.work_date, '%Y-%m-%d') AS work_date,
            ea.clock_in_at,
            ea.clock_out_at,
            ea.notes
     FROM employee_attendance ea
     INNER JOIN users u ON u.id = ea.user_id
     WHERE ${where.join(' AND ')}
     ORDER BY ea.work_date DESC, ea.clock_in_at DESC, u.name`,
    params
  );
}

export async function listActiveStaffForAttendance(db: DbConfig, propertyId: number) {
  return queryTenant<Array<{ id: number; name: string }>>(
    db,
    `SELECT id, name FROM users
     WHERE property_id = :propertyId AND is_active = 1
     ORDER BY name`,
    { propertyId }
  );
}

export async function getPropertyGeofence(
  db: DbConfig,
  propertyId: number
): Promise<PropertyGeofence> {
  const rows = await queryTenant<
    Array<{
      attendance_latitude: number | null;
      attendance_longitude: number | null;
      attendance_radius_m: number | null;
    }>
  >(
    db,
    `SELECT attendance_latitude, attendance_longitude, attendance_radius_m
     FROM properties WHERE id = :propertyId LIMIT 1`,
    { propertyId }
  );
  const row = rows[0];
  const lat = row?.attendance_latitude != null ? Number(row.attendance_latitude) : null;
  const lon = row?.attendance_longitude != null ? Number(row.attendance_longitude) : null;
  const radius = row?.attendance_radius_m != null ? Number(row.attendance_radius_m) : null;
  const geofence_enabled =
    lat != null && lon != null && radius != null && radius > 0 && Number.isFinite(lat) && Number.isFinite(lon);

  return {
    attendance_latitude: lat,
    attendance_longitude: lon,
    attendance_radius_m: radius,
    geofence_enabled: geofence_enabled,
  };
}

function assertWithinGeofence(
  geofence: PropertyGeofence,
  latitude?: number,
  longitude?: number
) {
  if (!geofence.geofence_enabled) return;

  if (latitude == null || longitude == null || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new Error('Location is required to clock in/out. Enable location access in your browser.');
  }

  const within = isWithinRadius(
    latitude,
    longitude,
    geofence.attendance_latitude!,
    geofence.attendance_longitude!,
    geofence.attendance_radius_m!
  );

  if (!within) {
    throw new Error(
      `You are outside the allowed area (${geofence.attendance_radius_m} m from the hotel). Move closer to clock in/out.`
    );
  }
}

export async function clockIn(
  db: DbConfig,
  propertyId: number,
  userId: number,
  location?: { latitude?: number; longitude?: number }
) {
  const geofence = await getPropertyGeofence(db, propertyId);
  assertWithinGeofence(geofence, location?.latitude, location?.longitude);

  const today = localTodayIso();

  const users = await queryTenant<Array<{ id: number; is_active: number }>>(
    db,
    `SELECT id, is_active FROM users WHERE id = :userId AND property_id = :propertyId LIMIT 1`,
    { userId, propertyId }
  );
  const user = users[0];
  if (!user || !user.is_active) {
    throw new Error('Your staff account is inactive.');
  }

  const existing = await getUserTodayAttendance(db, propertyId, userId);
  if (existing?.clock_in_at) {
    throw new Error('You are already clocked in for today.');
  }

  if (existing) {
    await executeTenant(
      db,
      `UPDATE employee_attendance
       SET clock_in_at = CURRENT_TIMESTAMP, clock_out_at = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE id = :id`,
      { id: existing.id }
    );
    return getUserTodayAttendance(db, propertyId, userId);
  }

  await executeTenant(
    db,
    `INSERT INTO employee_attendance (property_id, user_id, work_date, clock_in_at)
     VALUES (:propertyId, :userId, :today, CURRENT_TIMESTAMP)`,
    { propertyId, userId, today }
  );

  return getUserTodayAttendance(db, propertyId, userId);
}

export async function clockOut(
  db: DbConfig,
  propertyId: number,
  userId: number,
  location?: { latitude?: number; longitude?: number }
) {
  const geofence = await getPropertyGeofence(db, propertyId);
  assertWithinGeofence(geofence, location?.latitude, location?.longitude);

  const existing = await getUserTodayAttendance(db, propertyId, userId);
  if (!existing?.clock_in_at) {
    throw new Error('You have not clocked in yet today.');
  }
  if (existing.clock_out_at) {
    throw new Error('You are already clocked out for today.');
  }

  await executeTenant(
    db,
    `UPDATE employee_attendance
     SET clock_out_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
     WHERE id = :id`,
    { id: existing.id }
  );

  return getUserTodayAttendance(db, propertyId, userId);
}
