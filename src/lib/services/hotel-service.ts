import type { DbConfig } from '@/lib/db/central';
import { executeTenant, queryTenant } from '@/lib/db/tenant';
import {
  calculateBillableNights,
  calculateBookingNights,
  calculateRoomTotal,
  parseDateOnly,
  resolveRefundAmount,
  type RefundPolicy,
} from '@/lib/billing/stay-billing';
import { getDashboardChartData } from '@/lib/services/dashboard-analytics';
import { formatReportDate } from '@/lib/reports/document-layout';
import { formatDisplayDate } from '@/lib/dates/format-display-date';
import { generateConfirmationCode } from '@/lib/auth/credentials';
import { normalizeAmenities, parseAmenities } from '@/lib/rooms/amenities';
export type { DashboardChartData } from '@/lib/services/dashboard-analytics';

export async function allocateConfirmationCode(db: DbConfig): Promise<string> {
  for (let attempt = 0; attempt < 30; attempt++) {
    const confirmation = generateConfirmationCode();
    const rows = await queryTenant<Array<{ id: number }>>(
      db,
      `SELECT id FROM reservations WHERE confirmation_code = :code LIMIT 1`,
      { code: confirmation }
    );
    if (!rows[0]) return confirmation;
  }
  throw new Error('Could not generate a unique confirmation code. Try again.');
}

// ─── Dashboard ───────────────────────────────────────────────────────────────

export async function getDashboardStats(db: DbConfig, propertyId: number) {
  const [summaryRows, recentReservations, roomsNeedingAttention, charts, foodRows] = await Promise.all([
    queryTenant<
      Array<{
        totalRooms: number;
        occupiedRooms: number;
        arrivalsToday: number;
        departuresToday: number;
        revenueToday: number;
        totalRevenue: number;
        guestCount: number;
        reservationCount: number;
      }>
    >(
      db,
      `SELECT
         (SELECT COUNT(*) FROM rooms WHERE property_id = :propertyId AND is_active = 1) AS totalRooms,
         (SELECT COUNT(*) FROM rooms WHERE property_id = :propertyId AND status = 'occupied') AS occupiedRooms,
         (SELECT COUNT(*) FROM reservations
          WHERE property_id = :propertyId
            AND status NOT IN ('cancelled', 'no_show')) AS arrivalsToday,
         (SELECT COUNT(*) FROM reservations
          WHERE property_id = :propertyId AND status = 'checked_out') AS departuresToday,
         (SELECT COALESCE(SUM(p.amount), 0)
          FROM payments p
          JOIN folios f ON f.id = p.folio_id
          JOIN reservations r ON r.id = f.reservation_id
          WHERE r.property_id = :propertyId) AS revenueToday,
         (SELECT COALESCE(SUM(p.amount), 0)
          FROM payments p
          JOIN folios f ON f.id = p.folio_id
          JOIN reservations r ON r.id = f.reservation_id
          WHERE r.property_id = :propertyId) AS totalRevenue,
         (SELECT COUNT(DISTINCT guest_id) FROM reservations WHERE property_id = :propertyId) AS guestCount,
         (SELECT COUNT(*) FROM reservations WHERE property_id = :propertyId AND status NOT IN ('cancelled')) AS reservationCount`,
      { propertyId }
    ),
    queryTenant(
      db,
      `SELECT r.id, r.confirmation_code, r.status, r.check_in_date, r.check_out_date, r.total_amount,
              g.first_name, g.last_name, rm.room_number
       FROM reservations r
       JOIN guests g ON g.id = r.guest_id
       LEFT JOIN rooms rm ON rm.id = r.room_id
       WHERE r.property_id = :propertyId
       ORDER BY r.created_at DESC LIMIT 8`,
      { propertyId }
    ),
    queryTenant(
      db,
      `SELECT id, room_number, status, floor FROM rooms
       WHERE property_id = :propertyId AND status IN ('dirty','out_of_order','out_of_service')
       ORDER BY room_number LIMIT 8`,
      { propertyId }
    ),
    getDashboardChartData(db, propertyId).catch((err) => {
      console.error('Dashboard chart data failed:', err);
      return null;
    }),
    queryTenant<
      Array<{
        foodOrdersToday: number;
        foodRevenueToday: number;
        unpaidCashCod: number;
        foodRevenue30d: number;
        openKitchenOrders: number;
      }>
    >(
      db,
      `SELECT
         (SELECT COUNT(*) FROM food_orders
          WHERE property_id = :propertyId
            AND status <> 'cancelled') AS foodOrdersToday,
         (SELECT COALESCE(SUM(total_amount), 0) FROM food_orders
          WHERE property_id = :propertyId
            AND payment_status = 'paid' AND status <> 'cancelled') AS foodRevenueToday,
         (SELECT COALESCE(SUM(total_amount), 0) FROM food_orders
          WHERE property_id = :propertyId
            AND payment_status = 'pending'
            AND COALESCE(payment_method, 'cash') IN ('cash', 'cash_on_delivery')
            AND status <> 'cancelled') AS unpaidCashCod,
         (SELECT COALESCE(SUM(total_amount), 0) FROM food_orders
          WHERE property_id = :propertyId
            AND payment_status = 'paid'
            AND status <> 'cancelled') AS foodRevenue30d,
         (SELECT COUNT(*) FROM food_orders
          WHERE property_id = :propertyId
            AND status IN ('pending', 'preparing', 'ready')) AS openKitchenOrders`,
      { propertyId }
    ).catch((err) => {
      console.error('Dashboard food stats failed:', err);
      return [
        {
          foodOrdersToday: 0,
          foodRevenueToday: 0,
          unpaidCashCod: 0,
          foodRevenue30d: 0,
          openKitchenOrders: 0,
        },
      ];
    }),
  ]);

  const summary = summaryRows[0] ?? {
    totalRooms: 0,
    occupiedRooms: 0,
    arrivalsToday: 0,
    departuresToday: 0,
    revenueToday: 0,
    totalRevenue: 0,
    guestCount: 0,
    reservationCount: 0,
  };

  const food = foodRows[0] ?? {
    foodOrdersToday: 0,
    foodRevenueToday: 0,
    unpaidCashCod: 0,
    foodRevenue30d: 0,
    openKitchenOrders: 0,
  };

  const totalRooms = Number(summary.totalRooms);
  const occupiedRooms = Number(summary.occupiedRooms);
  const occupancy = totalRooms > 0 ? Math.round((occupiedRooms / totalRooms) * 100) : 0;

  return {
    occupancy,
    totalRooms,
    occupiedRooms,
    arrivalsToday: Number(summary.arrivalsToday),
    departuresToday: Number(summary.departuresToday),
    revenueToday: Number(summary.revenueToday),
    totalRevenue: Number(summary.totalRevenue),
    guestCount: Number(summary.guestCount),
    reservationCount: Number(summary.reservationCount),
    recentReservations,
    roomsNeedingAttention,
    adr: charts?.adr ?? 0,
    revpar: charts?.revpar ?? 0,
    revenue30Total: charts?.revenue30Total ?? 0,
    charts: charts ?? null,
    foodOrdersToday: Number(food.foodOrdersToday),
    foodRevenueToday: Number(food.foodRevenueToday),
    unpaidCashCod: Number(food.unpaidCashCod),
    foodRevenue30d: Number(food.foodRevenue30d),
    openKitchenOrders: Number(food.openKitchenOrders),
  };
}

// ─── Room types & rooms ──────────────────────────────────────────────────────

export async function listRoomTypes(db: DbConfig, propertyId: number) {
  return queryTenant(
    db,
    `SELECT * FROM room_types WHERE property_id = :propertyId ORDER BY name`,
    { propertyId }
  );
}

export async function createRoomType(
  db: DbConfig,
  propertyId: number,
  input: { name: string; code: string; base_rate: number; max_occupancy: number; description?: string }
) {
  const result = await executeTenant(
    db,
    `INSERT INTO room_types (property_id, name, code, description, base_rate, max_occupancy)
     VALUES (:propertyId, :name, :code, :description, :baseRate, :maxOccupancy)`,
    {
      propertyId,
      name: input.name,
      code: input.code.toUpperCase(),
      description: input.description || null,
      baseRate: input.base_rate,
      maxOccupancy: input.max_occupancy,
    }
  );
  return Number((result as { insertId?: number }).insertId);
}

/** Hidden type named after the room number so hotels can work room-number-first. */
async function ensureDedicatedRoomType(
  db: DbConfig,
  propertyId: number,
  roomNumber: string,
  baseRate: number,
  maxOccupancy: number,
  existingTypeId?: number | null
) {
  const name = `Room ${roomNumber}`;
  const codeBase = `RM${roomNumber.replace(/[^a-zA-Z0-9]/g, '').toUpperCase() || 'X'}`.slice(0, 18);

  if (existingTypeId) {
    await executeTenant(
      db,
      `UPDATE room_types
       SET name = :name,
           base_rate = :baseRate,
           max_occupancy = :maxOccupancy
       WHERE id = :id AND property_id = :propertyId`,
      {
        id: existingTypeId,
        propertyId,
        name,
        baseRate,
        maxOccupancy,
      }
    );
    return existingTypeId;
  }

  // Prefer existing type with same code for this property (e.g. reactivating a room).
  const byCode = await queryTenant<Array<{ id: number }>>(
    db,
    `SELECT id FROM room_types
     WHERE property_id = :propertyId AND code = :code
     LIMIT 1`,
    { propertyId, code: codeBase }
  );
  if (byCode[0]) {
    await executeTenant(
      db,
      `UPDATE room_types
       SET name = :name, base_rate = :baseRate, max_occupancy = :maxOccupancy
       WHERE id = :id`,
      { id: byCode[0].id, name, baseRate, maxOccupancy }
    );
    return byCode[0].id;
  }

  let code = codeBase;
  for (let i = 0; i < 20; i++) {
    try {
      return await createRoomType(db, propertyId, {
        name,
        code,
        base_rate: baseRate,
        max_occupancy: maxOccupancy,
        description: `Dedicated inventory for room ${roomNumber}`,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!/Duplicate|ER_DUP_ENTRY/i.test(msg)) throw e;
      code = `${codeBase}${i + 1}`.slice(0, 20);
    }
  }
  throw new Error('Could not create a room type for this room number.');
}

export type RoomGalleryImage = {
  id: number;
  image_url: string;
  sort_order: number;
};

function serializeAmenities(amenities?: string[] | null) {
  const list = normalizeAmenities(amenities ?? []);
  return list.length ? JSON.stringify(list) : null;
}

export async function listRoomImages(
  db: DbConfig,
  propertyId: number,
  roomId: number
): Promise<RoomGalleryImage[]> {
  return queryTenant<RoomGalleryImage[]>(
    db,
    `SELECT id, image_url, sort_order
     FROM room_images
     WHERE property_id = :propertyId AND room_id = :roomId
     ORDER BY sort_order ASC, id ASC`,
    { propertyId, roomId }
  );
}

async function attachRoomImages<T extends { id: number }>(
  db: DbConfig,
  propertyId: number,
  rooms: T[]
): Promise<Array<T & { images: RoomGalleryImage[]; amenities: string[] }>> {
  if (!rooms.length) return [];
  const ids = rooms.map((r) => r.id);
  const placeholders = ids.map((_, i) => `:id${i}`).join(',');
  const params: Record<string, number> = { propertyId };
  ids.forEach((id, i) => {
    params[`id${i}`] = id;
  });

  const imageRows = await queryTenant<
    Array<{ id: number; room_id: number; image_url: string; sort_order: number }>
  >(
    db,
    `SELECT id, room_id, image_url, sort_order
     FROM room_images
     WHERE property_id = :propertyId AND room_id IN (${placeholders})
     ORDER BY sort_order ASC, id ASC`,
    params
  );

  const byRoom = new Map<number, RoomGalleryImage[]>();
  for (const row of imageRows) {
    const list = byRoom.get(row.room_id) || [];
    list.push({ id: row.id, image_url: row.image_url, sort_order: row.sort_order });
    byRoom.set(row.room_id, list);
  }

  return rooms.map((room) => {
    const raw = (room as { amenities?: unknown }).amenities;
    return {
      ...room,
      amenities: parseAmenities(raw),
      images: byRoom.get(room.id) || [],
    };
  });
}

export async function listRooms(db: DbConfig, propertyId: number) {
  const rows = await queryTenant<
    Array<{
      id: number;
      room_number: string;
      floor: string | null;
      status: string;
      room_type_id: number;
      room_type_name: string;
      base_rate: number;
      max_occupancy: number;
      image_url: string | null;
      room_type_image_url: string | null;
      description: string | null;
      amenities: unknown;
      bed_type: string | null;
      size_sqm: number | null;
    }>
  >(
    db,
    `SELECT r.*, rt.name AS room_type_name, rt.base_rate, rt.max_occupancy, rt.image_url AS room_type_image_url
     FROM rooms r
     JOIN room_types rt ON rt.id = r.room_type_id
     WHERE r.property_id = :propertyId AND r.is_active = 1
     ORDER BY
       CASE WHEN r.room_number REGEXP '^[0-9]+$' THEN 0 ELSE 1 END,
       CAST(r.room_number AS UNSIGNED),
       r.room_number`,
    { propertyId }
  );

  return attachRoomImages(db, propertyId, rows);
}

export async function createRoom(
  db: DbConfig,
  propertyId: number,
  input: {
    room_number: string;
    floor?: string;
    status?: string;
    /** Nightly rate — creates/updates a dedicated room type when set (or when no room_type_id). */
    base_rate?: number;
    max_occupancy?: number;
    /** Optional legacy path: assign an existing type instead of auto-creating one. */
    room_type_id?: number;
    description?: string | null;
    amenities?: string[];
    bed_type?: string | null;
    size_sqm?: number | null;
  }
) {
  const roomNumber = String(input.room_number || '').trim();
  if (!roomNumber) {
    throw new Error('Room number is required.');
  }
  if (roomNumber.length > 20) {
    throw new Error('Room number must be 20 characters or fewer.');
  }

  const floorRaw = input.floor != null ? String(input.floor).trim() : '';
  const floor = floorRaw ? floorRaw.slice(0, 10) : null;
  const status = input.status || 'vacant';
  const allowed = [
    'vacant',
    'occupied',
    'dirty',
    'clean',
    'inspected',
    'out_of_order',
    'out_of_service',
  ];
  if (!allowed.includes(status)) {
    throw new Error('Invalid room status.');
  }

  const maxOccupancy = Math.max(1, Math.min(20, Number(input.max_occupancy) || 2));
  const hasExplicitType = Boolean(input.room_type_id);
  const baseRate = Number(input.base_rate);
  if (!hasExplicitType && (!Number.isFinite(baseRate) || baseRate < 0)) {
    throw new Error('Nightly rate is required.');
  }

  const description =
    input.description != null ? String(input.description).trim().slice(0, 4000) || null : null;
  const amenitiesJson = serializeAmenities(input.amenities);
  const bedType =
    input.bed_type != null ? String(input.bed_type).trim().slice(0, 80) || null : null;
  const sizeSqm =
    input.size_sqm != null && Number.isFinite(Number(input.size_sqm)) && Number(input.size_sqm) > 0
      ? Number(input.size_sqm)
      : null;

  let roomTypeId = input.room_type_id ? Number(input.room_type_id) : 0;

  if (hasExplicitType) {
    const typeRows = await queryTenant<Array<{ id: number }>>(
      db,
      `SELECT id FROM room_types WHERE id = :id AND property_id = :propertyId LIMIT 1`,
      { id: roomTypeId, propertyId }
    );
    if (!typeRows[0]) {
      throw new Error('Select a valid room type.');
    }
    if (Number.isFinite(baseRate) && baseRate >= 0) {
      await executeTenant(
        db,
        `UPDATE room_types SET base_rate = :baseRate WHERE id = :id AND property_id = :propertyId`,
        { id: roomTypeId, propertyId, baseRate }
      );
    }
  }

  const existing = await queryTenant<
    Array<{ id: number; is_active: number; room_number: string; room_type_id: number }>
  >(
    db,
    `SELECT id, is_active, room_number, room_type_id FROM rooms
     WHERE property_id = :propertyId AND room_number = :roomNumber
     LIMIT 1`,
    { propertyId, roomNumber }
  );

  if (existing[0]) {
    if (existing[0].is_active) {
      throw new Error(`Room ${roomNumber} already exists.`);
    }
    if (!hasExplicitType) {
      roomTypeId = await ensureDedicatedRoomType(
        db,
        propertyId,
        roomNumber,
        baseRate,
        maxOccupancy,
        existing[0].room_type_id
      );
    }
    await executeTenant(
      db,
      `UPDATE rooms
       SET room_type_id = :roomTypeId,
           floor = :floor,
           status = :status,
           description = :description,
           amenities = :amenities,
           bed_type = :bedType,
           size_sqm = :sizeSqm,
           is_active = 1
       WHERE id = :id AND property_id = :propertyId`,
      {
        id: existing[0].id,
        propertyId,
        roomTypeId,
        floor,
        status,
        description,
        amenities: amenitiesJson,
        bedType,
        sizeSqm,
      }
    );
    if (description) {
      await executeTenant(
        db,
        `UPDATE room_types SET description = :description WHERE id = :id AND property_id = :propertyId`,
        { id: roomTypeId, propertyId, description }
      );
    }
    return existing[0].id;
  }

  if (!hasExplicitType) {
    roomTypeId = await ensureDedicatedRoomType(
      db,
      propertyId,
      roomNumber,
      baseRate,
      maxOccupancy
    );
  }

  try {
    const result = await executeTenant(
      db,
      `INSERT INTO rooms
         (property_id, room_type_id, room_number, floor, status, description, amenities, bed_type, size_sqm)
       VALUES
         (:propertyId, :roomTypeId, :roomNumber, :floor, :status, :description, :amenities, :bedType, :sizeSqm)`,
      {
        propertyId,
        roomTypeId,
        roomNumber,
        floor,
        status,
        description,
        amenities: amenitiesJson,
        bedType,
        sizeSqm,
      }
    );
    if (description) {
      await executeTenant(
        db,
        `UPDATE room_types SET description = :description WHERE id = :id AND property_id = :propertyId`,
        { id: roomTypeId, propertyId, description }
      );
    }
    return Number((result as { insertId?: number }).insertId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/Duplicate|ER_DUP_ENTRY/i.test(msg)) {
      throw new Error(`Room ${roomNumber} already exists.`);
    }
    throw e;
  }
}

export async function updateRoomStatus(db: DbConfig, roomId: number, status: string) {
  await executeTenant(db, `UPDATE rooms SET status = :status WHERE id = :id`, { id: roomId, status });
}

const ASSIGNABLE_ROOM_STATUSES = ['vacant', 'clean', 'inspected'] as const;

type ActiveRoom = {
  id: number;
  room_number: string;
  status: string;
  room_type_id: number;
};

async function getActiveRoom(db: DbConfig, propertyId: number, roomId: number): Promise<ActiveRoom> {
  const rows = await queryTenant<ActiveRoom[]>(
    db,
    `SELECT id, room_number, status, room_type_id
     FROM rooms
     WHERE id = :roomId AND property_id = :propertyId AND is_active = 1
     LIMIT 1`,
    { roomId, propertyId }
  );
  const room = rows[0];
  if (!room) {
    throw new Error('Room not found.');
  }
  return room;
}

/** Room must be vacant, clean, or inspected before a guest can check in. */
export async function assertRoomReadyForCheckIn(
  db: DbConfig,
  propertyId: number,
  roomId: number
): Promise<ActiveRoom> {
  const room = await getActiveRoom(db, propertyId, roomId);
  if (!ASSIGNABLE_ROOM_STATUSES.includes(room.status as (typeof ASSIGNABLE_ROOM_STATUSES)[number])) {
    throw new Error(
      `Room ${room.room_number} is not available (${room.status.replace(/_/g, ' ')}).`
    );
  }
  return room;
}

/** Block overlapping bookings on the same room (pending, confirmed, or checked in). */
export async function assertNoConflictingReservation(
  db: DbConfig,
  propertyId: number,
  roomId: number,
  checkInDate: string,
  checkOutDate: string,
  excludeReservationId?: number
) {
  const conflicts = await queryTenant<
    Array<{
      confirmation_code: string;
      check_in_date: string;
      check_out_date: string;
      status: string;
    }>
  >(
    db,
    `SELECT confirmation_code,
            DATE_FORMAT(check_in_date, '%Y-%m-%d') AS check_in_date,
            DATE_FORMAT(check_out_date, '%Y-%m-%d') AS check_out_date,
            status
     FROM reservations
     WHERE property_id = :propertyId
       AND room_id = :roomId
       AND status IN ('pending', 'confirmed', 'checked_in')
       AND (:excludeId IS NULL OR id != :excludeId)
       AND check_in_date < :checkOut
       AND check_out_date > :checkIn
     ORDER BY check_in_date ASC
     LIMIT 1`,
    {
      propertyId,
      roomId,
      excludeId: excludeReservationId ?? null,
      checkIn: checkInDate,
      checkOut: checkOutDate,
    }
  );

  const conflict = conflicts[0];
  if (!conflict) return;

  const statusLabel = conflict.status.replace(/_/g, ' ');
  throw new Error(
    `Room is already booked ${formatDisplayDate(conflict.check_in_date)} to ${formatDisplayDate(conflict.check_out_date)} ` +
      `(${conflict.confirmation_code}, ${statusLabel}). Choose another room or different dates.`
  );
}

async function assertRoomNotOccupiedByOtherGuest(
  db: DbConfig,
  propertyId: number,
  roomId: number,
  excludeReservationId: number
) {
  const rows = await queryTenant<Array<{ confirmation_code: string }>>(
    db,
    `SELECT confirmation_code
     FROM reservations
     WHERE property_id = :propertyId
       AND room_id = :roomId
       AND status = 'checked_in'
       AND id != :excludeId
     LIMIT 1`,
    { propertyId, roomId, excludeId: excludeReservationId }
  );
  if (rows[0]) {
    throw new Error(
      `Room is currently occupied by another guest (${rows[0].confirmation_code}).`
    );
  }
}

export async function updateRoomType(
  db: DbConfig,
  propertyId: number,
  id: number,
  input: {
    name?: string;
    code?: string;
    base_rate?: number;
    max_occupancy?: number;
    description?: string | null;
  }
) {
  await executeTenant(
    db,
    `UPDATE room_types SET
       name = COALESCE(:name, name),
       code = COALESCE(:code, code),
       base_rate = COALESCE(:baseRate, base_rate),
       max_occupancy = COALESCE(:maxOccupancy, max_occupancy),
       description = COALESCE(:description, description)
     WHERE id = :id AND property_id = :propertyId`,
    {
      id,
      propertyId,
      name: input.name ?? null,
      code: input.code ? input.code.toUpperCase() : null,
      baseRate: input.base_rate ?? null,
      maxOccupancy: input.max_occupancy ?? null,
      description: input.description ?? null,
    }
  );
}

export async function deleteRoomType(db: DbConfig, propertyId: number, id: number) {
  const rooms = await queryTenant<Array<{ c: number }>>(
    db,
    `SELECT COUNT(*) AS c FROM rooms WHERE room_type_id = :id AND property_id = :propertyId AND is_active = 1`,
    { id, propertyId }
  );
  if (Number(rooms[0]?.c ?? 0) > 0) {
    throw new Error('Cannot delete a room type that still has active rooms assigned.');
  }
  await executeTenant(db, `DELETE FROM room_types WHERE id = :id AND property_id = :propertyId`, {
    id,
    propertyId,
  });
}

export async function updateRoom(
  db: DbConfig,
  propertyId: number,
  id: number,
  input: {
    room_type_id?: number;
    room_number?: string;
    floor?: string | null;
    status?: string;
    base_rate?: number;
    max_occupancy?: number;
    description?: string | null;
    amenities?: string[];
    bed_type?: string | null;
    size_sqm?: number | null;
  }
) {
  const rows = await queryTenant<
    Array<{
      id: number;
      room_type_id: number;
      room_number: string;
      floor: string | null;
      status: string;
      description: string | null;
      amenities: unknown;
      bed_type: string | null;
      size_sqm: number | null;
    }>
  >(
    db,
    `SELECT id, room_type_id, room_number, floor, status, description, amenities, bed_type, size_sqm
     FROM rooms
     WHERE id = :id AND property_id = :propertyId AND is_active = 1
     LIMIT 1`,
    { id, propertyId }
  );
  const room = rows[0];
  if (!room) {
    throw new Error('Room not found.');
  }

  const nextNumber = input.room_number != null ? String(input.room_number).trim() : room.room_number;
  if (!nextNumber) {
    throw new Error('Room number is required.');
  }

  const nextFloor =
    input.floor !== undefined ? (String(input.floor || '').trim().slice(0, 10) || null) : room.floor;
  const nextStatus = input.status ?? room.status;
  const nextDescription =
    input.description !== undefined
      ? String(input.description || '').trim().slice(0, 4000) || null
      : room.description;
  const nextAmenities =
    input.amenities !== undefined ? serializeAmenities(input.amenities) : serializeAmenities(parseAmenities(room.amenities));
  const nextBedType =
    input.bed_type !== undefined
      ? String(input.bed_type || '').trim().slice(0, 80) || null
      : room.bed_type;
  const nextSize =
    input.size_sqm !== undefined
      ? input.size_sqm != null && Number.isFinite(Number(input.size_sqm)) && Number(input.size_sqm) > 0
        ? Number(input.size_sqm)
        : null
      : room.size_sqm != null
        ? Number(room.size_sqm)
        : null;

  await executeTenant(
    db,
    `UPDATE rooms SET
       room_type_id = COALESCE(:roomTypeId, room_type_id),
       room_number = :roomNumber,
       floor = :floor,
       status = :status,
       description = :description,
       amenities = :amenities,
       bed_type = :bedType,
       size_sqm = :sizeSqm
     WHERE id = :id AND property_id = :propertyId AND is_active = 1`,
    {
      id,
      propertyId,
      roomTypeId: input.room_type_id ?? null,
      roomNumber: nextNumber,
      floor: nextFloor,
      status: nextStatus,
      description: nextDescription,
      amenities: nextAmenities,
      bedType: nextBedType,
      sizeSqm: nextSize,
    }
  );

  if (nextDescription) {
    await executeTenant(
      db,
      `UPDATE room_types SET description = :description
       WHERE id = :typeId AND property_id = :propertyId`,
      { typeId: input.room_type_id ?? room.room_type_id, propertyId, description: nextDescription }
    );
  }

  const typeId = input.room_type_id ?? room.room_type_id;
  const rate =
    input.base_rate != null && Number.isFinite(Number(input.base_rate))
      ? Number(input.base_rate)
      : null;
  const occ =
    input.max_occupancy != null && Number.isFinite(Number(input.max_occupancy))
      ? Math.max(1, Math.min(20, Number(input.max_occupancy)))
      : null;

  if (rate != null || occ != null || nextNumber !== room.room_number) {
    const current = await queryTenant<Array<{ base_rate: number; max_occupancy: number }>>(
      db,
      `SELECT base_rate, max_occupancy FROM room_types WHERE id = :id LIMIT 1`,
      { id: typeId }
    );
    await ensureDedicatedRoomType(
      db,
      propertyId,
      nextNumber,
      rate ?? Number(current[0]?.base_rate ?? 0),
      occ ?? Number(current[0]?.max_occupancy ?? 2),
      typeId
    );
  }
}

export async function addRoomGalleryImage(
  db: DbConfig,
  propertyId: number,
  roomId: number,
  imageUrl: string
) {
  const rooms = await queryTenant<Array<{ id: number; image_url: string | null }>>(
    db,
    `SELECT id, image_url FROM rooms
     WHERE id = :roomId AND property_id = :propertyId AND is_active = 1
     LIMIT 1`,
    { roomId, propertyId }
  );
  if (!rooms[0]) throw new Error('Room not found.');

  const countRows = await queryTenant<Array<{ c: number }>>(
    db,
    `SELECT COUNT(*) AS c FROM room_images WHERE room_id = :roomId AND property_id = :propertyId`,
    { roomId, propertyId }
  );
  if (Number(countRows[0]?.c ?? 0) >= 8) {
    throw new Error('Maximum of 8 photos per room.');
  }

  const maxRows = await queryTenant<Array<{ m: number | null }>>(
    db,
    `SELECT MAX(sort_order) AS m FROM room_images WHERE room_id = :roomId`,
    { roomId }
  );
  const sortOrder = Number(maxRows[0]?.m ?? -1) + 1;

  const result = await executeTenant(
    db,
    `INSERT INTO room_images (property_id, room_id, image_url, sort_order)
     VALUES (:propertyId, :roomId, :imageUrl, :sortOrder)`,
    { propertyId, roomId, imageUrl, sortOrder }
  );

  if (!rooms[0].image_url) {
    await updateRoomImage(db, propertyId, roomId, imageUrl);
  }

  return {
    id: Number((result as { insertId?: number }).insertId),
    image_url: imageUrl,
    sort_order: sortOrder,
  };
}

export async function removeRoomGalleryImage(
  db: DbConfig,
  propertyId: number,
  imageId: number
) {
  const rows = await queryTenant<Array<{ id: number; room_id: number; image_url: string }>>(
    db,
    `SELECT id, room_id, image_url FROM room_images
     WHERE id = :id AND property_id = :propertyId
     LIMIT 1`,
    { id: imageId, propertyId }
  );
  const image = rows[0];
  if (!image) throw new Error('Photo not found.');

  await executeTenant(
    db,
    `DELETE FROM room_images WHERE id = :id AND property_id = :propertyId`,
    { id: imageId, propertyId }
  );

  const room = await queryTenant<Array<{ image_url: string | null }>>(
    db,
    `SELECT image_url FROM rooms WHERE id = :roomId AND property_id = :propertyId LIMIT 1`,
    { roomId: image.room_id, propertyId }
  );

  const remaining = await listRoomImages(db, propertyId, image.room_id);
  const coverMatches =
    room[0]?.image_url &&
    (room[0].image_url === image.image_url ||
      room[0].image_url.split('?')[0] === image.image_url.split('?')[0]);

  if (coverMatches || !room[0]?.image_url) {
    await updateRoomImage(db, propertyId, image.room_id, remaining[0]?.image_url ?? null);
  }

  return { room_id: image.room_id, images: remaining };
}

export async function setRoomCoverFromGallery(
  db: DbConfig,
  propertyId: number,
  roomId: number,
  imageId: number
) {
  const rows = await queryTenant<Array<{ id: number; image_url: string }>>(
    db,
    `SELECT id, image_url FROM room_images
     WHERE id = :id AND room_id = :roomId AND property_id = :propertyId
     LIMIT 1`,
    { id: imageId, roomId, propertyId }
  );
  if (!rows[0]) throw new Error('Photo not found.');
  await updateRoomImage(db, propertyId, roomId, rows[0].image_url);
  return rows[0];
}

export async function updateRoomImage(
  db: DbConfig,
  propertyId: number,
  roomId: number,
  imageUrl: string | null
) {
  const result = await executeTenant(
    db,
    `UPDATE rooms SET image_url = :imageUrl WHERE id = :id AND property_id = :propertyId AND is_active = 1`,
    { id: roomId, propertyId, imageUrl }
  );
  if ((result as { affectedRows?: number }).affectedRows === 0) {
    throw new Error('Room not found.');
  }
}

export async function updateRoomTypeImage(
  db: DbConfig,
  propertyId: number,
  roomTypeId: number,
  imageUrl: string | null
) {
  const result = await executeTenant(
    db,
    `UPDATE room_types SET image_url = :imageUrl WHERE id = :id AND property_id = :propertyId`,
    { id: roomTypeId, propertyId, imageUrl }
  );
  if ((result as { affectedRows?: number }).affectedRows === 0) {
    throw new Error('Room type not found.');
  }
}

export async function deleteRoom(db: DbConfig, propertyId: number, id: number) {
  const rows = await queryTenant<Array<{ status: string }>>(
    db,
    `SELECT status FROM rooms WHERE id = :id AND property_id = :propertyId AND is_active = 1`,
    { id, propertyId }
  );
  const room = rows[0];
  if (!room) {
    throw new Error('Room not found.');
  }
  if (room.status === 'occupied') {
    throw new Error('Cannot remove a room that is currently occupied.');
  }
  await executeTenant(
    db,
    `UPDATE rooms SET is_active = 0, status = 'out_of_service' WHERE id = :id AND property_id = :propertyId`,
    { id, propertyId }
  );
}

// ─── Guests ──────────────────────────────────────────────────────────────────

export async function listGuests(db: DbConfig, search = '') {
  const like = `%${search}%`;
  return queryTenant(
    db,
    `SELECT g.*, COUNT(r.id) AS stay_count
     FROM guests g
     LEFT JOIN reservations r ON r.guest_id = g.id
     WHERE (:search = '' OR g.first_name LIKE :like OR g.last_name LIKE :like OR g.email LIKE :like OR g.phone LIKE :like)
     GROUP BY g.id
     ORDER BY g.last_name, g.first_name`,
    { search, like }
  );
}

export async function createGuest(
  db: DbConfig,
  input: {
    first_name: string;
    last_name: string;
    email?: string;
    phone?: string;
    nationality?: string;
    is_vip?: boolean;
    notes?: string;
  }
) {
  const result = await executeTenant(
    db,
    `INSERT INTO guests (first_name, last_name, email, phone, nationality, is_vip, notes)
     VALUES (:firstName, :lastName, :email, :phone, :nationality, :isVip, :notes)`,
    {
      firstName: input.first_name,
      lastName: input.last_name,
      email: input.email || null,
      phone: input.phone || null,
      nationality: input.nationality || null,
      isVip: input.is_vip ? 1 : 0,
      notes: input.notes || null,
    }
  );
  return Number((result as { insertId?: number }).insertId);
}

export async function updateGuest(
  db: DbConfig,
  id: number,
  input: {
    first_name?: string;
    last_name?: string;
    email?: string;
    phone?: string;
    nationality?: string;
    is_vip?: boolean;
    is_blacklisted?: boolean;
    notes?: string;
  }
) {
  await executeTenant(
    db,
    `UPDATE guests SET
       first_name = COALESCE(:firstName, first_name),
       last_name = COALESCE(:lastName, last_name),
       email = COALESCE(:email, email),
       phone = COALESCE(:phone, phone),
       nationality = COALESCE(:nationality, nationality),
       is_vip = COALESCE(:isVip, is_vip),
       is_blacklisted = COALESCE(:isBlacklisted, is_blacklisted),
       notes = COALESCE(:notes, notes)
     WHERE id = :id`,
    {
      id,
      firstName: input.first_name ?? null,
      lastName: input.last_name ?? null,
      email: input.email ?? null,
      phone: input.phone ?? null,
      nationality: input.nationality ?? null,
      isVip: input.is_vip !== undefined ? (input.is_vip ? 1 : 0) : null,
      isBlacklisted: input.is_blacklisted !== undefined ? (input.is_blacklisted ? 1 : 0) : null,
      notes: input.notes ?? null,
    }
  );
}

export async function getGuestById(db: DbConfig, id: number) {
  const rows = await queryTenant<
    Array<{
      id: number;
      first_name: string;
      last_name: string;
      email: string | null;
      phone: string | null;
      nationality: string | null;
      notes: string | null;
      is_vip: number;
      is_blacklisted: number;
      created_at: string;
      stay_count: number;
    }>
  >(
    db,
    `SELECT g.*, COUNT(r.id) AS stay_count
     FROM guests g
     LEFT JOIN reservations r ON r.guest_id = g.id
     WHERE g.id = :id
     GROUP BY g.id`,
    { id }
  );
  return rows[0] ?? null;
}

export async function deleteGuest(db: DbConfig, id: number) {
  const rows = await queryTenant<Array<{ c: number }>>(
    db,
    `SELECT COUNT(*) AS c FROM reservations WHERE guest_id = :id`,
    { id }
  );
  if (Number(rows[0]?.c ?? 0) > 0) {
    throw new Error('Cannot delete a guest who has reservation history.');
  }
  await executeTenant(db, `DELETE FROM guests WHERE id = :id`, { id });
}

// ─── Reservations ────────────────────────────────────────────────────────────

export async function listReservations(db: DbConfig, propertyId: number, status?: string) {
  return queryTenant(
    db,
    `SELECT r.*, g.first_name, g.last_name, g.email AS guest_email, g.phone AS guest_phone,
            rt.name AS room_type_name, rm.room_number
     FROM reservations r
     JOIN guests g ON g.id = r.guest_id
     LEFT JOIN room_types rt ON rt.id = r.room_type_id
     LEFT JOIN rooms rm ON rm.id = r.room_id
     WHERE r.property_id = :propertyId
       AND (:status IS NULL OR r.status = :status)
     ORDER BY r.check_in_date DESC, r.id DESC`,
    { propertyId, status: status || null }
  );
}

export async function createReservation(
  db: DbConfig,
  propertyId: number,
  userId: number,
  input: {
    guest_id: number;
    check_in_date: string;
    check_out_date: string;
    room_type_id?: number;
    room_id?: number;
    adults?: number;
    rate_per_night?: number;
    notes?: string;
    billing_type?: 'guest' | 'corporate';
    corporate_account_id?: number | null;
  }
) {
  const nights = calculateBookingNights(input.check_in_date, input.check_out_date);
  if (nights <= 0) {
    throw new Error('Check-out date must be after check-in date.');
  }

  let rate = input.rate_per_night ?? 0;
  if (!rate && input.room_type_id) {
    const rows = await queryTenant<Array<{ base_rate: number }>>(
      db,
      `SELECT base_rate FROM room_types WHERE id = :id`,
      { id: input.room_type_id }
    );
    rate = Number(rows[0]?.base_rate ?? 0);
  }

  const total = calculateRoomTotal(rate, nights);
  const confirmation = await allocateConfirmationCode(db);

  if (input.room_id) {
    await getActiveRoom(db, propertyId, input.room_id);
    await assertNoConflictingReservation(
      db,
      propertyId,
      input.room_id,
      input.check_in_date,
      input.check_out_date
    );
  }

  const billingType = input.billing_type === 'corporate' ? 'corporate' : 'guest';
  let corporateAccountId: number | null = null;
  if (billingType === 'corporate') {
    const accountId = Number(input.corporate_account_id);
    if (!accountId) throw new Error('Select a corporate account for company billing.');
    const accounts = await queryTenant<Array<{ id: number }>>(
      db,
      `SELECT id FROM corporate_accounts
       WHERE id = :id AND property_id = :propertyId AND is_active = 1 LIMIT 1`,
      { id: accountId, propertyId }
    );
    if (!accounts[0]) throw new Error('Corporate account not found.');
    corporateAccountId = accountId;
  }

  const result = await executeTenant(
    db,
    `INSERT INTO reservations
       (property_id, guest_id, corporate_account_id, billing_type, confirmation_code, status,
        check_in_date, check_out_date, adults, room_type_id, room_id, rate_per_night, total_amount,
        notes, created_by)
     VALUES
       (:propertyId, :guestId, :corporateAccountId, :billingType, :confirmation, 'confirmed',
        :checkIn, :checkOut, :adults, :roomTypeId, :roomId, :rate, :total, :notes, :userId)`,
    {
      propertyId,
      guestId: input.guest_id,
      corporateAccountId,
      billingType,
      confirmation,
      checkIn: input.check_in_date,
      checkOut: input.check_out_date,
      adults: input.adults ?? 1,
      roomTypeId: input.room_type_id || null,
      roomId: input.room_id || null,
      rate,
      total,
      notes: input.notes || null,
      userId,
    }
  );

  const reservationId = Number((result as { insertId?: number }).insertId);
  await executeTenant(
    db,
    `INSERT INTO folios (reservation_id, status, balance) VALUES (:reservationId, 'open', :balance)`,
    { reservationId, balance: total }
  );

  if (total > 0) {
    const folioRows = await queryTenant<Array<{ id: number }>>(
      db,
      `SELECT id FROM folios WHERE reservation_id = :reservationId LIMIT 1`,
      { reservationId }
    );
    const folioId = folioRows[0]?.id;
    if (folioId) {
      await executeTenant(
        db,
        `INSERT INTO folio_charges (folio_id, description, category, amount, quantity, posted_by)
         VALUES (:folioId, 'Room charges', 'room', :amount, :nights, :userId)`,
        { folioId, amount: rate, nights, userId }
      );
    }
  }

  return { id: reservationId, confirmation_code: confirmation, total_amount: total };
}

export async function cancelReservation(db: DbConfig, id: number) {
  await executeTenant(db, `UPDATE reservations SET status = 'cancelled' WHERE id = :id`, { id });
}

// ─── Front desk ──────────────────────────────────────────────────────────────

const FRONT_DESK_RESERVATION_SELECT = `
  SELECT r.id, r.confirmation_code, r.status, r.room_id,
         DATE_FORMAT(r.check_in_date, '%Y-%m-%d') AS check_in_date,
         DATE_FORMAT(r.check_out_date, '%Y-%m-%d') AS check_out_date,
         r.total_amount,
         COALESCE(pay_totals.amount_paid, 0) AS amount_paid,
         g.first_name, g.last_name, rt.name AS room_type_name, rm.room_number
  FROM reservations r
  JOIN guests g ON g.id = r.guest_id
  LEFT JOIN room_types rt ON rt.id = r.room_type_id
  LEFT JOIN rooms rm ON rm.id = r.room_id
  LEFT JOIN (
    SELECT f.reservation_id, SUM(p.amount) AS amount_paid
    FROM folios f
    JOIN payments p ON p.folio_id = f.id
    GROUP BY f.reservation_id
  ) pay_totals ON pay_totals.reservation_id = r.id
  WHERE r.property_id = :propertyId`;

export async function getFrontDeskOverview(db: DbConfig, propertyId: number) {
  const [arrivals, departures, inHouse, roomGrid, todayRows] = await Promise.all([
    queryTenant(
      db,
      `${FRONT_DESK_RESERVATION_SELECT}
         AND r.check_in_date = CURDATE()
         AND r.status IN ('confirmed', 'pending')
       ORDER BY r.id ASC`,
      { propertyId }
    ),
    queryTenant(
      db,
      `${FRONT_DESK_RESERVATION_SELECT}
         AND r.check_out_date <= CURDATE()
         AND r.status = 'checked_in'
       ORDER BY r.id ASC`,
      { propertyId }
    ),
    queryTenant(
      db,
      `${FRONT_DESK_RESERVATION_SELECT}
         AND r.status = 'checked_in'
       ORDER BY rm.room_number ASC, r.id ASC`,
      { propertyId }
    ),
    listRooms(db, propertyId),
    queryTenant<Array<{ today: string }>>(
      db,
      `SELECT DATE_FORMAT(CURDATE(), '%Y-%m-%d') AS today`,
      {}
    ),
  ]);

  return {
    arrivals,
    departures,
    inHouse,
    roomGrid,
    today: todayRows[0]?.today ?? new Date().toISOString().slice(0, 10),
  };
}

export async function checkInReservation(
  db: DbConfig,
  propertyId: number,
  reservationId: number,
  roomId: number
) {
  const rows = await queryTenant<
    Array<{
      id: number;
      status: string;
      check_in_date: string;
      check_out_date: string;
    }>
  >(
    db,
    `SELECT id, status,
            DATE_FORMAT(check_in_date, '%Y-%m-%d') AS check_in_date,
            DATE_FORMAT(check_out_date, '%Y-%m-%d') AS check_out_date
     FROM reservations
     WHERE id = :id AND property_id = :propertyId
     LIMIT 1`,
    { id: reservationId, propertyId }
  );
  const reservation = rows[0];
  if (!reservation) {
    throw new Error('Reservation not found.');
  }
  if (reservation.status === 'checked_in') {
    throw new Error('This guest is already checked in.');
  }
  if (!['confirmed', 'pending'].includes(reservation.status)) {
    throw new Error(`Cannot check in a reservation with status "${reservation.status.replace(/_/g, ' ')}".`);
  }

  await assertRoomReadyForCheckIn(db, propertyId, roomId);
  await assertRoomNotOccupiedByOtherGuest(db, propertyId, roomId, reservationId);
  await assertNoConflictingReservation(
    db,
    propertyId,
    roomId,
    reservation.check_in_date,
    reservation.check_out_date,
    reservationId
  );

  await executeTenant(
    db,
    `UPDATE reservations SET status = 'checked_in', room_id = :roomId WHERE id = :id AND property_id = :propertyId`,
    { id: reservationId, roomId, propertyId }
  );
  await updateRoomStatus(db, roomId, 'occupied');
}

export type CheckOutInput = {
  actual_check_out_date?: string;
  refund_policy?: RefundPolicy;
  refund_amount?: number;
  reason?: string;
};

export type CheckoutPreview = {
  reservation_id: number;
  guest_name: string;
  confirmation_code: string;
  room_number: string | null;
  check_in_date: string;
  scheduled_check_out_date: string;
  actual_check_out_date: string;
  rate_per_night: number;
  scheduled_nights: number;
  actual_nights: number;
  unused_nights: number;
  scheduled_room_total: number;
  actual_room_total: number;
  unused_nights_value: number;
  other_charges: number;
  amount_paid: number;
  balance: number;
  is_early: boolean;
  max_refund: number;
  suggested_refund: number;
};

export type CheckOutResult = {
  checkout_type: 'scheduled' | 'early';
  actual_check_out_date: string;
  actual_nights: number;
  unused_nights: number;
  actual_room_total: number;
  refund_amount: number;
  refund_policy: RefundPolicy;
  balance: number;
};

async function writeAuditLog(
  db: DbConfig,
  userId: number,
  action: string,
  entityType: string,
  entityId: number,
  details: Record<string, unknown>
) {
  await executeTenant(
    db,
    `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
     VALUES (:userId, :action, :entityType, :entityId, :details)`,
    {
      userId,
      action,
      entityType,
      entityId,
      details: JSON.stringify(details),
    }
  );
}

async function loadCheckoutContext(
  db: DbConfig,
  propertyId: number,
  reservationId: number
) {
  const rows = await queryTenant<
    Array<{
      id: number;
      status: string;
      room_id: number | null;
      rate_per_night: number;
      total_amount: number;
      confirmation_code: string;
      check_in_date: string;
      check_out_date: string;
      first_name: string;
      last_name: string;
      room_number: string | null;
      folio_id: number | null;
    }>
  >(
    db,
    `SELECT r.id, r.status, r.room_id, r.rate_per_night, r.total_amount, r.confirmation_code,
            DATE_FORMAT(r.check_in_date, '%Y-%m-%d') AS check_in_date,
            DATE_FORMAT(r.check_out_date, '%Y-%m-%d') AS check_out_date,
            g.first_name, g.last_name, rm.room_number, f.id AS folio_id
     FROM reservations r
     JOIN guests g ON g.id = r.guest_id
     LEFT JOIN rooms rm ON rm.id = r.room_id
     LEFT JOIN folios f ON f.reservation_id = r.id
     WHERE r.id = :reservationId AND r.property_id = :propertyId
     LIMIT 1`,
    { reservationId, propertyId }
  );
  return rows[0] ?? null;
}

async function getFolioTotals(db: DbConfig, folioId: number) {
  const [chargeRows, paymentRows, roomChargeRows] = await Promise.all([
    queryTenant<Array<{ total: number }>>(
      db,
      `SELECT COALESCE(SUM(amount * quantity), 0) AS total FROM folio_charges WHERE folio_id = :folioId`,
      { folioId }
    ),
    queryTenant<Array<{ total: number }>>(
      db,
      `SELECT COALESCE(SUM(amount), 0) AS total FROM payments WHERE folio_id = :folioId`,
      { folioId }
    ),
    queryTenant<Array<{ id: number; amount: number; quantity: number }>>(
      db,
      `SELECT id, amount, quantity FROM folio_charges
       WHERE folio_id = :folioId AND category = 'room'
       ORDER BY id ASC LIMIT 1`,
      { folioId }
    ),
  ]);

  const totalCharges = Number(chargeRows[0]?.total ?? 0);
  const amountPaid = Number(paymentRows[0]?.total ?? 0);
  const roomCharge = roomChargeRows[0];
  const roomChargeTotal = roomCharge
    ? Number(roomCharge.amount) * Number(roomCharge.quantity)
    : 0;

  return {
    totalCharges,
    amountPaid,
    roomCharge,
    roomChargeTotal,
    otherCharges: totalCharges - roomChargeTotal,
    balance: totalCharges - amountPaid,
  };
}

function buildCheckoutPreview(
  reservation: NonNullable<Awaited<ReturnType<typeof loadCheckoutContext>>>,
  actualCheckOutDate: string,
  folioTotals: Omit<Awaited<ReturnType<typeof getFolioTotals>>, 'roomCharge'> & { roomCharge?: { id: number; amount: number; quantity: number } },
  refundPolicy: RefundPolicy = 'full'
): CheckoutPreview {
  const rate = Number(reservation.rate_per_night ?? 0);
  const scheduledNights = calculateBillableNights(
    reservation.check_in_date,
    reservation.check_out_date
  );
  const actualNights = calculateBillableNights(reservation.check_in_date, actualCheckOutDate);
  const unusedNights = Math.max(0, scheduledNights - actualNights);
  const isEarly = parseDateOnly(actualCheckOutDate) < parseDateOnly(reservation.check_out_date);

  const scheduledRoomTotal = calculateRoomTotal(rate, scheduledNights);
  const actualRoomTotal = calculateRoomTotal(rate, actualNights);
  const unusedNightsValue = calculateRoomTotal(rate, unusedNights);
  const newTotal = actualRoomTotal + folioTotals.otherCharges;
  const overpayment = Math.max(0, folioTotals.amountPaid - newTotal);
  const maxRefund = isEarly ? Math.min(unusedNightsValue, overpayment || unusedNightsValue) : overpayment;
  const suggestedRefund = isEarly
    ? resolveRefundAmount(refundPolicy, maxRefund, undefined)
    : overpayment;

  return {
    reservation_id: reservation.id,
    guest_name: `${reservation.first_name} ${reservation.last_name}`,
    confirmation_code: reservation.confirmation_code,
    room_number: reservation.room_number,
    check_in_date: reservation.check_in_date,
    scheduled_check_out_date: reservation.check_out_date,
    actual_check_out_date: actualCheckOutDate,
    rate_per_night: rate,
    scheduled_nights: scheduledNights,
    actual_nights: actualNights,
    unused_nights: unusedNights,
    scheduled_room_total: scheduledRoomTotal,
    actual_room_total: actualRoomTotal,
    unused_nights_value: unusedNightsValue,
    other_charges: folioTotals.otherCharges,
    amount_paid: folioTotals.amountPaid,
    balance: folioTotals.balance,
    is_early: isEarly,
    max_refund: maxRefund,
    suggested_refund: suggestedRefund,
  };
}

export async function getCheckoutPreview(
  db: DbConfig,
  propertyId: number,
  reservationId: number,
  actualCheckOutDate?: string,
  refundPolicy: RefundPolicy = 'full'
): Promise<CheckoutPreview> {
  const reservation = await loadCheckoutContext(db, propertyId, reservationId);
  if (!reservation) {
    throw new Error('Reservation not found.');
  }
  if (reservation.status !== 'checked_in') {
    throw new Error('Only checked-in guests can be checked out.');
  }

  const todayRows = await queryTenant<Array<{ today: string }>>(
    db,
    `SELECT DATE_FORMAT(CURDATE(), '%Y-%m-%d') AS today`,
    {}
  );
  const today = todayRows[0]?.today ?? new Date().toISOString().slice(0, 10);
  const actualDate = actualCheckOutDate || today;

  if (parseDateOnly(actualDate) < parseDateOnly(reservation.check_in_date)) {
    throw new Error('Check-out date cannot be before check-in date.');
  }

  const folioTotals = reservation.folio_id
    ? await getFolioTotals(db, reservation.folio_id)
    : {
        totalCharges: 0,
        amountPaid: 0,
        roomCharge: undefined,
        roomChargeTotal: 0,
        otherCharges: 0,
        balance: 0,
      };

  return buildCheckoutPreview(reservation, actualDate, folioTotals, refundPolicy);
}

export async function checkOutReservation(
  db: DbConfig,
  propertyId: number,
  reservationId: number,
  userId: number,
  input: CheckOutInput = {}
): Promise<CheckOutResult> {
  const reservation = await loadCheckoutContext(db, propertyId, reservationId);
  if (!reservation) {
    throw new Error('Reservation not found.');
  }
  if (reservation.status !== 'checked_in') {
    throw new Error('Only checked-in guests can be checked out.');
  }

  const todayRows = await queryTenant<Array<{ today: string }>>(
    db,
    `SELECT DATE_FORMAT(CURDATE(), '%Y-%m-%d') AS today`,
    {}
  );
  const today = todayRows[0]?.today ?? new Date().toISOString().slice(0, 10);
  const actualCheckOutDate = input.actual_check_out_date || today;

  if (parseDateOnly(actualCheckOutDate) < parseDateOnly(reservation.check_in_date)) {
    throw new Error('Check-out date cannot be before check-in date.');
  }

  const refundPolicy: RefundPolicy = input.refund_policy ?? 'full';
  const isEarly = parseDateOnly(actualCheckOutDate) < parseDateOnly(reservation.check_out_date);

  if (isEarly && !String(input.reason || '').trim()) {
    throw new Error('A reason is required for early check-out.');
  }

  const rate = Number(reservation.rate_per_night ?? 0);
  const scheduledNights = calculateBillableNights(
    reservation.check_in_date,
    reservation.check_out_date
  );
  const actualNights = calculateBillableNights(reservation.check_in_date, actualCheckOutDate);
  const unusedNights = Math.max(0, scheduledNights - actualNights);
  const scheduledRoomTotal = calculateRoomTotal(rate, scheduledNights);
  const actualRoomTotal = calculateRoomTotal(rate, actualNights);
  const unusedNightsValue = calculateRoomTotal(rate, unusedNights);

  let appliedRefund = 0;
  let finalBalance = 0;

  if (reservation.folio_id) {
    const folioTotals = await getFolioTotals(db, reservation.folio_id);

    if (folioTotals.roomCharge) {
      await executeTenant(
        db,
        `UPDATE folio_charges SET amount = :rate, quantity = :nights
         WHERE id = :id`,
        { id: folioTotals.roomCharge.id, rate, nights: actualNights }
      );
    } else if (actualRoomTotal > 0) {
      await executeTenant(
        db,
        `INSERT INTO folio_charges (folio_id, description, category, amount, quantity, posted_by)
         VALUES (:folioId, 'Room charges', 'room', :rate, :nights, :userId)`,
        {
          folioId: reservation.folio_id,
          rate,
          nights: actualNights,
          userId,
        }
      );
    }

    const newTotal = actualRoomTotal + folioTotals.otherCharges;
    const overpayment = Math.max(0, folioTotals.amountPaid - newTotal);
    const maxRefund = isEarly
      ? Math.min(unusedNightsValue, overpayment || unusedNightsValue)
      : overpayment;
    appliedRefund = isEarly
      ? resolveRefundAmount(refundPolicy, maxRefund, input.refund_amount)
      : overpayment;

    if (appliedRefund > 0) {
      const refundNote = isEarly
        ? `Early check-out refund (${unusedNights} unused night${unusedNights === 1 ? '' : 's'})`
        : 'Check-out balance refund';
      await executeTenant(
        db,
        `INSERT INTO folio_charges (folio_id, description, category, amount, quantity, posted_by)
         VALUES (:folioId, :description, 'other', :amount, 1, :userId)`,
        {
          folioId: reservation.folio_id,
          description: refundNote,
          amount: -appliedRefund,
          userId,
        }
      );
    }

    finalBalance = await recalcFolioBalance(db, reservation.folio_id);
    await executeTenant(db, `UPDATE folios SET status = 'closed' WHERE id = :folioId`, {
      folioId: reservation.folio_id,
    });
  }

  await executeTenant(
    db,
    `UPDATE reservations
     SET status = 'checked_out', check_out_date = :actualCheckOut, total_amount = :actualTotal
     WHERE id = :id`,
    {
      id: reservationId,
      actualCheckOut: actualCheckOutDate,
      actualTotal: actualRoomTotal,
    }
  );

  const checkoutType = isEarly ? 'early' : 'scheduled';

  try {
    await executeTenant(
      db,
      `INSERT INTO checkout_events
         (reservation_id, property_id, checkout_type, scheduled_check_out_date, actual_check_out_date,
          scheduled_nights, actual_nights, unused_nights, rate_per_night, scheduled_room_total,
          actual_room_total, refund_policy, refund_amount, reason, processed_by)
       VALUES
         (:reservationId, :propertyId, :checkoutType, :scheduledCheckOut, :actualCheckOut,
          :scheduledNights, :actualNights, :unusedNights, :rate, :scheduledTotal,
          :actualTotal, :refundPolicy, :refundAmount, :reason, :userId)`,
      {
        reservationId,
        propertyId,
        checkoutType,
        scheduledCheckOut: reservation.check_out_date,
        actualCheckOut: actualCheckOutDate,
        scheduledNights,
        actualNights,
        unusedNights,
        rate,
        scheduledTotal: scheduledRoomTotal,
        actualTotal: actualRoomTotal,
        refundPolicy: isEarly ? refundPolicy : 'none',
        refundAmount: appliedRefund,
        reason: input.reason?.trim() || null,
        userId,
      }
    );
  } catch (e) {
    console.warn('checkout_events insert failed (run database/tenant/004_checkout_events.sql):', e);
  }

  await writeAuditLog(db, userId, 'check_out', 'reservation', reservationId, {
    checkout_type: checkoutType,
    scheduled_check_out_date: reservation.check_out_date,
    actual_check_out_date: actualCheckOutDate,
    scheduled_nights: scheduledNights,
    actual_nights: actualNights,
    unused_nights: unusedNights,
    rate_per_night: rate,
    scheduled_room_total: scheduledRoomTotal,
    actual_room_total: actualRoomTotal,
    refund_policy: isEarly ? refundPolicy : 'none',
    refund_amount: appliedRefund,
    reason: input.reason?.trim() || null,
    confirmation_code: reservation.confirmation_code,
  });

  const roomId = reservation.room_id;
  if (roomId) {
    await updateRoomStatus(db, roomId, 'dirty');
    await executeTenant(
      db,
      `INSERT INTO housekeeping_tasks (property_id, room_id, task_type, status, notes)
       VALUES (:propertyId, :roomId, 'clean', 'pending', 'Auto-created after check-out')`,
      { propertyId, roomId }
    );
  }

  return {
    checkout_type: checkoutType,
    actual_check_out_date: actualCheckOutDate,
    actual_nights: actualNights,
    unused_nights: unusedNights,
    actual_room_total: actualRoomTotal,
    refund_amount: appliedRefund,
    refund_policy: isEarly ? refundPolicy : 'none',
    balance: finalBalance,
  };
}

export type CheckoutNotificationDetails = {
  guest_name: string;
  guest_email: string | null;
  guest_phone: string | null;
  confirmation_code: string;
  room_number: string | null;
  balance: number;
  currency: string;
  property_name: string;
  check_in_date: string | null;
  check_out_date: string | null;
};

export async function getReservationNotificationDetails(
  db: DbConfig,
  propertyId: number,
  reservationId: number
): Promise<CheckoutNotificationDetails | null> {
  const rows = await queryTenant<CheckoutNotificationDetails[]>(
    db,
    `SELECT CONCAT(g.first_name, ' ', g.last_name) AS guest_name,
            g.email AS guest_email,
            g.phone AS guest_phone,
            r.confirmation_code,
            rm.room_number,
            COALESCE(f.balance, 0) AS balance,
            COALESCE(p.currency, 'GHS') AS currency,
            p.name AS property_name,
            r.check_in_date,
            r.check_out_date
     FROM reservations r
     JOIN guests g ON g.id = r.guest_id
     JOIN properties p ON p.id = r.property_id
     LEFT JOIN rooms rm ON rm.id = r.room_id
     LEFT JOIN folios f ON f.reservation_id = r.id
     WHERE r.id = :reservationId AND r.property_id = :propertyId
     LIMIT 1`,
    { reservationId, propertyId }
  );
  return rows[0] ?? null;
}

/** @deprecated Use getReservationNotificationDetails */
export const getCheckoutNotificationDetails = getReservationNotificationDetails;

export async function walkInCheckIn(
  db: DbConfig,
  propertyId: number,
  userId: number,
  input: {
    guest_id?: number;
    first_name?: string;
    last_name?: string;
    email?: string;
    phone?: string;
    check_in_date?: string;
    check_out_date: string;
    room_id: number;
    adults?: number;
    notes?: string;
    billing_type?: 'guest' | 'corporate';
    corporate_account_id?: number | null;
    payment?: { method: string; amount: number; reference?: string };
  }
) {
  const todayRows = await queryTenant<Array<{ today: string }>>(
    db,
    `SELECT DATE_FORMAT(CURDATE(), '%Y-%m-%d') AS today`,
    {}
  );
  const today = todayRows[0]?.today ?? new Date().toISOString().slice(0, 10);
  const checkInDate = input.check_in_date || today;

  if (!input.check_out_date || input.check_out_date <= checkInDate) {
    throw new Error('Check-out date must be after check-in date.');
  }

  if (!input.room_id) {
    throw new Error('A room is required for walk-in check-in.');
  }

  const room = await assertRoomReadyForCheckIn(db, propertyId, input.room_id);
  await assertNoConflictingReservation(
    db,
    propertyId,
    input.room_id,
    checkInDate,
    input.check_out_date
  );

  let guestId = input.guest_id;
  if (guestId) {
    const guests = await queryTenant<Array<{ id: number; is_blacklisted: number }>>(
      db,
      `SELECT id, is_blacklisted FROM guests WHERE id = :id LIMIT 1`,
      { id: guestId }
    );
    if (!guests[0]) {
      throw new Error('Guest not found.');
    }
    if (guests[0].is_blacklisted) {
      throw new Error('This guest is blacklisted and cannot be checked in.');
    }
  } else {
    const firstName = String(input.first_name || '').trim();
    const lastName = String(input.last_name || '').trim();
    if (!firstName || !lastName) {
      throw new Error('Guest first and last name are required.');
    }
    guestId = await createGuest(db, {
      first_name: firstName,
      last_name: lastName,
      email: input.email,
      phone: input.phone,
      notes: input.notes,
    });
  }

  const reservation = await createReservation(db, propertyId, userId, {
    guest_id: guestId,
    check_in_date: checkInDate,
    check_out_date: input.check_out_date,
    room_type_id: room.room_type_id,
    room_id: input.room_id,
    adults: input.adults ?? 1,
    notes: input.notes,
    billing_type: input.billing_type,
    corporate_account_id: input.corporate_account_id,
  });

  await checkInReservation(db, propertyId, reservation.id, input.room_id);

  if (input.payment && input.payment.amount > 0) {
    const folioRows = await queryTenant<Array<{ id: number }>>(
      db,
      `SELECT id FROM folios WHERE reservation_id = :reservationId LIMIT 1`,
      { reservationId: reservation.id }
    );
    const folioId = folioRows[0]?.id;
    if (folioId) {
      await addPayment(db, folioId, userId, {
        method: input.payment.method,
        amount: input.payment.amount,
        reference: input.payment.reference,
      });
    }
  }

  return {
    reservation_id: reservation.id,
    confirmation_code: reservation.confirmation_code,
    guest_id: guestId,
    room_id: input.room_id,
    total_amount: reservation.total_amount,
  };
}

// ─── Housekeeping ────────────────────────────────────────────────────────────

export async function listHousekeepingTasks(db: DbConfig, propertyId: number) {
  return queryTenant(
    db,
    `SELECT t.*, r.room_number, u.name AS assigned_name
     FROM housekeeping_tasks t
     JOIN rooms r ON r.id = t.room_id
     LEFT JOIN users u ON u.id = t.assigned_to
     WHERE t.property_id = :propertyId
     ORDER BY FIELD(t.status, 'pending','in_progress','completed','cancelled'), t.created_at DESC`,
    { propertyId }
  );
}

export async function createHousekeepingTask(
  db: DbConfig,
  propertyId: number,
  input: { room_id: number; task_type: string; notes?: string; assigned_to?: number }
) {
  const result = await executeTenant(
    db,
    `INSERT INTO housekeeping_tasks (property_id, room_id, task_type, status, notes, assigned_to)
     VALUES (:propertyId, :roomId, :taskType, 'pending', :notes, :assignedTo)`,
    {
      propertyId,
      roomId: input.room_id,
      taskType: input.task_type,
      notes: input.notes || null,
      assignedTo: input.assigned_to || null,
    }
  );
  return Number((result as { insertId?: number }).insertId);
}

export async function updateHousekeepingTask(
  db: DbConfig,
  id: number,
  input: { status?: string; assigned_to?: number | null; notes?: string }
) {
  const nextStatus = input.status ?? null;
  const markCompleted = nextStatus === 'completed';

  if (nextStatus === 'in_progress') {
    const rows = await queryTenant<Array<{ assigned_to: number | null }>>(
      db,
      `SELECT assigned_to FROM housekeeping_tasks WHERE id = :id LIMIT 1`,
      { id }
    );
    const effectiveAssignee =
      input.assigned_to !== undefined ? input.assigned_to : rows[0]?.assigned_to ?? null;
    if (!effectiveAssignee) {
      throw new Error('Assign a housekeeper before starting this task.');
    }
  }

  await executeTenant(
    db,
    `UPDATE housekeeping_tasks SET
       status = COALESCE(:status, status),
       assigned_to = IF(:hasAssignee = 1, :assignedTo, assigned_to),
       notes = COALESCE(:notes, notes),
       completed_at = IF(:markCompleted = 1, NOW(), completed_at)
     WHERE id = :id`,
    {
      id,
      status: nextStatus,
      hasAssignee: input.assigned_to !== undefined ? 1 : 0,
      assignedTo: input.assigned_to ?? null,
      notes: input.notes ?? null,
      markCompleted: markCompleted ? 1 : 0,
    }
  );

  if (markCompleted) {
    const rows = await queryTenant<Array<{ room_id: number; task_type: string }>>(
      db,
      `SELECT room_id, task_type FROM housekeeping_tasks WHERE id = :id`,
      { id }
    );
    const task = rows[0];
    if (task?.task_type === 'clean') {
      await updateRoomStatus(db, task.room_id, 'clean');
    } else if (task?.task_type === 'inspect') {
      await updateRoomStatus(db, task.room_id, 'vacant');
    } else if (task?.task_type === 'maintenance') {
      // Repair finished — return room to dirty for housekeeping turnover
      await updateRoomStatus(db, task.room_id, 'dirty');
    }
  }
}

export async function getRoomStatusBoard(db: DbConfig, propertyId: number) {
  return queryTenant(
    db,
    `SELECT r.id, r.room_number, r.floor, r.status, rt.name AS room_type_name
     FROM rooms r
     JOIN room_types rt ON rt.id = r.room_type_id
     WHERE r.property_id = :propertyId AND r.is_active = 1
     ORDER BY
       CASE WHEN r.room_number REGEXP '^[0-9]+$' THEN 0 ELSE 1 END,
       CAST(r.room_number AS UNSIGNED),
       r.room_number`,
    { propertyId }
  );
}

// ─── Billing ─────────────────────────────────────────────────────────────────

export async function listFolios(db: DbConfig, propertyId: number) {
  return queryTenant(
    db,
    `SELECT f.*, r.confirmation_code, r.status AS reservation_status,
            g.first_name, g.last_name, rm.room_number
     FROM folios f
     JOIN reservations r ON r.id = f.reservation_id
     JOIN guests g ON g.id = r.guest_id
     LEFT JOIN rooms rm ON rm.id = r.room_id
     WHERE r.property_id = :propertyId
     ORDER BY f.updated_at DESC`,
    { propertyId }
  );
}

export async function getFolioDetail(db: DbConfig, folioId: number) {
  const [folios, charges, payments] = await Promise.all([
    queryTenant(
      db,
      `SELECT f.*, r.confirmation_code, g.first_name, g.last_name, g.email
       FROM folios f
       JOIN reservations r ON r.id = f.reservation_id
       JOIN guests g ON g.id = r.guest_id
       WHERE f.id = :folioId`,
      { folioId }
    ),
    queryTenant(
      db,
      `SELECT * FROM folio_charges WHERE folio_id = :folioId ORDER BY posted_at`,
      { folioId }
    ),
    queryTenant(
      db,
      `SELECT * FROM payments WHERE folio_id = :folioId ORDER BY paid_at`,
      { folioId }
    ),
  ]);
  return { folio: (folios as unknown[])[0], charges, payments };
}

async function recalcFolioBalance(db: DbConfig, folioId: number) {
  const [chargeRows, paymentRows, refundRows] = await Promise.all([
    queryTenant<Array<{ total: number }>>(
      db,
      `SELECT COALESCE(SUM(amount * quantity), 0) AS total FROM folio_charges WHERE folio_id = :folioId`,
      { folioId }
    ),
    queryTenant<Array<{ total: number }>>(
      db,
      `SELECT COALESCE(SUM(amount), 0) AS total FROM payments WHERE folio_id = :folioId`,
      { folioId }
    ),
    queryTenant<Array<{ total: number }>>(
      db,
      `SELECT COALESCE(SUM(amount), 0) AS total FROM refunds WHERE folio_id = :folioId`,
      { folioId }
    ).catch(() => [{ total: 0 }]),
  ]);
  const charges = Number(chargeRows[0]?.total ?? 0);
  const paid = Number(paymentRows[0]?.total ?? 0);
  const refunded = Number(refundRows[0]?.total ?? 0);
  const balance = Math.round((charges - paid + refunded) * 100) / 100;
  await executeTenant(db, `UPDATE folios SET balance = :balance WHERE id = :folioId`, {
    folioId,
    balance,
  });
  return balance;
}

export async function addFolioCharge(
  db: DbConfig,
  folioId: number,
  userId: number,
  input: { description: string; category: string; amount: number; quantity?: number }
) {
  await executeTenant(
    db,
    `INSERT INTO folio_charges (folio_id, description, category, amount, quantity, posted_by)
     VALUES (:folioId, :description, :category, :amount, :quantity, :userId)`,
    {
      folioId,
      description: input.description,
      category: input.category,
      amount: input.amount,
      quantity: input.quantity ?? 1,
      userId,
    }
  );
  return recalcFolioBalance(db, folioId);
}

export async function addPayment(
  db: DbConfig,
  folioId: number,
  userId: number,
  input: { method: string; amount: number; reference?: string }
) {
  await executeTenant(
    db,
    `INSERT INTO payments (folio_id, method, amount, reference, received_by)
     VALUES (:folioId, :method, :amount, :reference, :userId)`,
    {
      folioId,
      method: input.method,
      amount: input.amount,
      reference: input.reference || null,
      userId,
    }
  );
  return recalcFolioBalance(db, folioId);
}

// ─── Reports ─────────────────────────────────────────────────────────────────

export type ReportPeriod = 'daily' | 'weekly' | 'monthly' | 'yearly';

export type OfficeReports = {
  period: ReportPeriod;
  periodLabel: string;
  startDate: string;
  endDate: string;
  generatedAt: string;
  currency: string;
  summary: {
    occupancyRate: number;
    roomsTotal: number;
    roomsOccupied: number;
    roomsVacant: number;
    adr: number;
    revpar: number;
    revenuePeriod: number;
    revenueToday: number;
    outstandingBalance: number;
    arrivals: number;
    departures: number;
    inHouse: number;
    reservationsCreated: number;
    cancellations: number;
    avgStayNights: number;
  };
  kpisVsPrior: {
    revenueChangePct: number | null;
    occupancyChangePct: number | null;
    adrChangePct: number | null;
  };
  rows: Array<{
    date: string;
    label: string;
    arrivals: number;
    departures: number;
    bookings: number;
    cancellations: number;
    revenue: number;
    payments: number;
    occ_rooms: number;
  }>;
  paymentMethods: Array<{ method: string; label: string; amount: number; count: number }>;
  roomTypePerformance: Array<{
    room_type: string;
    rooms: number;
    occupied: number;
    occupancy_pct: number;
    revenue: number;
    avg_rate: number;
  }>;
  reservationStatus: Array<{ status: string; label: string; count: number }>;
  folioAging: Array<{ bucket: string; count: number; balance: number }>;
  property?: {
    name: string;
    address: string | null;
    phone: string | null;
    email: string | null;
  };
};

const REPORT_RES_STATUS: Record<string, string> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  checked_in: 'Checked In',
  checked_out: 'Checked Out',
  cancelled: 'Cancelled',
  no_show: 'No Show',
};

const REPORT_PAY_METHOD: Record<string, string> = {
  cash: 'Cash',
  card: 'Card',
  mobile_money: 'Mobile Money',
  bank_transfer: 'Bank Transfer',
  other: 'Other',
  paystack: 'Paystack',
};

function reportLocalDate(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function daysBetween(start: string, end: string) {
  const a = new Date(`${start}T12:00:00`).getTime();
  const b = new Date(`${end}T12:00:00`).getTime();
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

function shiftIsoDate(iso: string, days: number) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function reportPeriodBounds(
  period: ReportPeriod,
  customStart?: string | null,
  customEnd?: string | null
): {
  start: string;
  end: string;
  priorStart: string;
  priorEnd: string;
  label: string;
  trendDays: number;
} {
  const today = reportLocalDate(0);
  let start = today;
  let end = today;
  let label = 'Daily report';

  if (customStart && customEnd && /^\d{4}-\d{2}-\d{2}$/.test(customStart) && /^\d{4}-\d{2}-\d{2}$/.test(customEnd)) {
    start = customStart <= customEnd ? customStart : customEnd;
    end = customStart <= customEnd ? customEnd : customStart;
    label =
      start === end
        ? `Custom · ${start}`
        : `Custom · ${start} to ${end}`;
  } else if (period === 'daily') {
    start = today;
    end = today;
    label = 'Daily report';
  } else if (period === 'weekly') {
    start = reportLocalDate(-6);
    end = today;
    label = 'Weekly report';
  } else if (period === 'monthly') {
    const now = new Date();
    start = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    end = today;
    label = 'Monthly report';
  } else {
    const now = new Date();
    start = `${now.getFullYear()}-01-01`;
    end = today;
    label = 'Yearly report';
  }

  const span = daysBetween(start, end);
  const priorEnd = shiftIsoDate(start, -1);
  const priorStart = shiftIsoDate(priorEnd, -span);

  return {
    start,
    end,
    priorStart,
    priorEnd,
    label,
    trendDays: span + 1,
  };
}

function pctChange(current: number, prior: number): number | null {
  if (prior === 0) return current === 0 ? 0 : null;
  return Math.round(((current - prior) / prior) * 1000) / 10;
}

export async function getReports(
  db: DbConfig,
  propertyId: number,
  period: ReportPeriod = 'monthly',
  customStart?: string | null,
  customEnd?: string | null
): Promise<OfficeReports> {
  const bounds = reportPeriodBounds(period, customStart, customEnd);
  const { start, end, priorStart, priorEnd, label, trendDays } = bounds;

  const [
    roomSnap,
    revenuePeriodRows,
    revenuePriorRows,
    revenueTodayRows,
    adrRows,
    priorAdrRows,
    outstandingRows,
    arrivalsRows,
    departuresRows,
    inHouseRows,
    createdRows,
    cancelRows,
    stayRows,
    paymentRows,
    roomTypeRows,
    resStatusRows,
    folioAgingRows,
    dailyRevenueRows,
    dailyArrivalRows,
    dailyDepartureRows,
    dailyBookingRows,
    dailyCancelRows,
  ] = await Promise.all([
    queryTenant<Array<{ total: number; occupied: number; vacant: number }>>(
      db,
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN status = 'occupied' THEN 1 ELSE 0 END) AS occupied,
         SUM(CASE WHEN status IN ('vacant','clean','inspected') THEN 1 ELSE 0 END) AS vacant
       FROM rooms WHERE property_id = :propertyId AND is_active = 1`,
      { propertyId }
    ),
    queryTenant<Array<{ amount: number }>>(
      db,
      `SELECT COALESCE(SUM(p.amount), 0) AS amount
       FROM payments p
       JOIN folios f ON f.id = p.folio_id
       JOIN reservations r ON r.id = f.reservation_id
       WHERE r.property_id = :propertyId
         AND DATE(p.paid_at) BETWEEN :start AND :end`,
      { propertyId, start, end }
    ),
    queryTenant<Array<{ amount: number }>>(
      db,
      `SELECT COALESCE(SUM(p.amount), 0) AS amount
       FROM payments p
       JOIN folios f ON f.id = p.folio_id
       JOIN reservations r ON r.id = f.reservation_id
       WHERE r.property_id = :propertyId
         AND DATE(p.paid_at) BETWEEN :start AND :end`,
      { propertyId, start: priorStart, end: priorEnd }
    ),
    queryTenant<Array<{ amount: number }>>(
      db,
      `SELECT COALESCE(SUM(p.amount), 0) AS amount
       FROM payments p
       JOIN folios f ON f.id = p.folio_id
       JOIN reservations r ON r.id = f.reservation_id
       WHERE r.property_id = :propertyId AND DATE(p.paid_at) = CURDATE()`,
      { propertyId }
    ),
    queryTenant<Array<{ adr: number }>>(
      db,
      `SELECT COALESCE(AVG(r.rate_per_night), 0) AS adr
       FROM reservations r
       WHERE r.property_id = :propertyId
         AND r.status IN ('checked_in','checked_out','confirmed')
         AND r.check_in_date <= :end AND r.check_out_date >= :start`,
      { propertyId, start, end }
    ),
    queryTenant<Array<{ adr: number }>>(
      db,
      `SELECT COALESCE(AVG(r.rate_per_night), 0) AS adr
       FROM reservations r
       WHERE r.property_id = :propertyId
         AND r.status IN ('checked_in','checked_out','confirmed')
         AND r.check_in_date <= :end AND r.check_out_date >= :start`,
      { propertyId, start: priorStart, end: priorEnd }
    ),
    queryTenant<Array<{ balance: number }>>(
      db,
      `SELECT COALESCE(SUM(f.balance), 0) AS balance
       FROM folios f
       JOIN reservations r ON r.id = f.reservation_id
       WHERE r.property_id = :propertyId AND f.status = 'open' AND f.balance > 0`,
      { propertyId }
    ),
    queryTenant<Array<{ c: number }>>(
      db,
      `SELECT COUNT(*) AS c FROM reservations
       WHERE property_id = :propertyId
         AND check_in_date BETWEEN :start AND :end
         AND status NOT IN ('cancelled','no_show')`,
      { propertyId, start, end }
    ),
    queryTenant<Array<{ c: number }>>(
      db,
      `SELECT COUNT(*) AS c FROM reservations
       WHERE property_id = :propertyId
         AND check_out_date BETWEEN :start AND :end
         AND status IN ('checked_out','checked_in','confirmed')`,
      { propertyId, start, end }
    ),
    queryTenant<Array<{ c: number }>>(
      db,
      `SELECT COUNT(*) AS c FROM reservations
       WHERE property_id = :propertyId AND status = 'checked_in'`,
      { propertyId }
    ),
    queryTenant<Array<{ c: number }>>(
      db,
      `SELECT COUNT(*) AS c FROM reservations
       WHERE property_id = :propertyId AND DATE(created_at) BETWEEN :start AND :end`,
      { propertyId, start, end }
    ),
    queryTenant<Array<{ c: number }>>(
      db,
      `SELECT COUNT(*) AS c FROM reservations
       WHERE property_id = :propertyId AND status = 'cancelled'
         AND DATE(updated_at) BETWEEN :start AND :end`,
      { propertyId, start, end }
    ),
    queryTenant<Array<{ avg_nights: number }>>(
      db,
      `SELECT COALESCE(AVG(GREATEST(DATEDIFF(check_out_date, check_in_date), 1)), 0) AS avg_nights
       FROM reservations
       WHERE property_id = :propertyId
         AND status IN ('checked_in','checked_out')
         AND check_in_date BETWEEN :start AND :end`,
      { propertyId, start, end }
    ),
    queryTenant<Array<{ method: string; amount: number; c: number }>>(
      db,
      `SELECT p.method, COALESCE(SUM(p.amount), 0) AS amount, COUNT(*) AS c
       FROM payments p
       JOIN folios f ON f.id = p.folio_id
       JOIN reservations r ON r.id = f.reservation_id
       WHERE r.property_id = :propertyId
         AND DATE(p.paid_at) BETWEEN :start AND :end
       GROUP BY p.method
       ORDER BY amount DESC`,
      { propertyId, start, end }
    ),
    queryTenant<
      Array<{
        room_type: string;
        rooms: number;
        occupied: number;
        revenue: number;
        avg_rate: number;
      }>
    >(
      db,
      `SELECT rt.name AS room_type,
              COUNT(DISTINCT rm.id) AS rooms,
              SUM(CASE WHEN rm.status = 'occupied' THEN 1 ELSE 0 END) AS occupied,
              COALESCE((
                SELECT SUM(p.amount)
                FROM payments p
                JOIN folios f ON f.id = p.folio_id
                JOIN reservations r2 ON r2.id = f.reservation_id
                WHERE r2.property_id = :propertyId
                  AND r2.room_type_id = rt.id
                  AND DATE(p.paid_at) BETWEEN :start AND :end
              ), 0) AS revenue,
              COALESCE(AVG(NULLIF(rt.base_rate, 0)), 0) AS avg_rate
       FROM room_types rt
       LEFT JOIN rooms rm ON rm.room_type_id = rt.id AND rm.property_id = :propertyId AND rm.is_active = 1
       WHERE rt.property_id = :propertyId
       GROUP BY rt.id, rt.name
       ORDER BY revenue DESC, rt.name`,
      { propertyId, start, end }
    ),
    queryTenant<Array<{ status: string; c: number }>>(
      db,
      `SELECT status, COUNT(*) AS c FROM reservations
       WHERE property_id = :propertyId GROUP BY status ORDER BY c DESC`,
      { propertyId }
    ),
    queryTenant<Array<{ bucket: string; c: number; balance: number }>>(
      db,
      `SELECT
         CASE
           WHEN DATEDIFF(CURDATE(), DATE(f.updated_at)) <= 0 THEN 'Current'
           WHEN DATEDIFF(CURDATE(), DATE(f.updated_at)) BETWEEN 1 AND 7 THEN '1–7 days'
           WHEN DATEDIFF(CURDATE(), DATE(f.updated_at)) BETWEEN 8 AND 30 THEN '8–30 days'
           ELSE '30+ days'
         END AS bucket,
         COUNT(*) AS c,
         COALESCE(SUM(f.balance), 0) AS balance
       FROM folios f
       JOIN reservations r ON r.id = f.reservation_id
       WHERE r.property_id = :propertyId AND f.status = 'open' AND f.balance > 0
       GROUP BY bucket
       ORDER BY FIELD(bucket, 'Current', '1–7 days', '8–30 days', '30+ days')`,
      { propertyId }
    ),
    queryTenant<Array<{ d: string; amount: number; c: number }>>(
      db,
      `SELECT DATE(p.paid_at) AS d, COALESCE(SUM(p.amount), 0) AS amount, COUNT(*) AS c
       FROM payments p
       JOIN folios f ON f.id = p.folio_id
       JOIN reservations r ON r.id = f.reservation_id
       WHERE r.property_id = :propertyId
         AND DATE(p.paid_at) BETWEEN :start AND :end
       GROUP BY DATE(p.paid_at)
       ORDER BY d`,
      { propertyId, start, end }
    ),
    queryTenant<Array<{ d: string; c: number }>>(
      db,
      `SELECT check_in_date AS d, COUNT(*) AS c FROM reservations
       WHERE property_id = :propertyId
         AND check_in_date BETWEEN :start AND :end
         AND status NOT IN ('cancelled','no_show')
       GROUP BY check_in_date ORDER BY d`,
      { propertyId, start, end }
    ),
    queryTenant<Array<{ d: string; c: number }>>(
      db,
      `SELECT check_out_date AS d, COUNT(*) AS c FROM reservations
       WHERE property_id = :propertyId
         AND check_out_date BETWEEN :start AND :end
         AND status IN ('checked_out','checked_in','confirmed')
       GROUP BY check_out_date ORDER BY d`,
      { propertyId, start, end }
    ),
    queryTenant<Array<{ d: string; c: number }>>(
      db,
      `SELECT DATE(created_at) AS d, COUNT(*) AS c FROM reservations
       WHERE property_id = :propertyId
         AND DATE(created_at) BETWEEN :start AND :end
       GROUP BY DATE(created_at) ORDER BY d`,
      { propertyId, start, end }
    ),
    queryTenant<Array<{ d: string; c: number }>>(
      db,
      `SELECT DATE(updated_at) AS d, COUNT(*) AS c FROM reservations
       WHERE property_id = :propertyId AND status = 'cancelled'
         AND DATE(updated_at) BETWEEN :start AND :end
       GROUP BY DATE(updated_at) ORDER BY d`,
      { propertyId, start, end }
    ),
  ]);

  const roomsTotal = Number(roomSnap[0]?.total ?? 0);
  const roomsOccupied = Number(roomSnap[0]?.occupied ?? 0);
  const roomsVacant = Number(roomSnap[0]?.vacant ?? 0);
  const occupancyRate = roomsTotal > 0 ? Math.round((roomsOccupied / roomsTotal) * 1000) / 10 : 0;
  const revenuePeriod = Number(revenuePeriodRows[0]?.amount ?? 0);
  const revenuePrior = Number(revenuePriorRows[0]?.amount ?? 0);
  const adr = Number(adrRows[0]?.adr ?? 0);
  const priorAdr = Number(priorAdrRows[0]?.adr ?? 0);
  const revpar = roomsTotal > 0 ? (adr * roomsOccupied) / roomsTotal : 0;

  const maxDays = Math.min(Math.max(trendDays, 1), 366);
  const trendDates: string[] = [];
  for (let i = maxDays - 1; i >= 0; i--) {
    trendDates.push(shiftIsoDate(end, -i));
  }

  const toDateKey = (value: string | Date | null | undefined): string => {
    if (!value) return '';
    if (value instanceof Date) {
      const y = value.getFullYear();
      const m = String(value.getMonth() + 1).padStart(2, '0');
      const day = String(value.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    }
    const s = String(value);
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    const parsed = new Date(s);
    if (!Number.isNaN(parsed.getTime())) return toDateKey(parsed);
    return s.slice(0, 10);
  };

  const revenueMap = new Map(
    dailyRevenueRows.map((r) => [toDateKey(r.d), Number(r.amount)])
  );
  const paymentCountMap = new Map(
    dailyRevenueRows.map((r) => [toDateKey(r.d), Number(r.c)])
  );
  const arrivalMap = new Map(
    dailyArrivalRows.map((r) => [toDateKey(r.d), Number(r.c)])
  );
  const departureMap = new Map(
    dailyDepartureRows.map((r) => [toDateKey(r.d), Number(r.c)])
  );
  const bookingMap = new Map(
    dailyBookingRows.map((r) => [toDateKey(r.d), Number(r.c)])
  );
  const cancelMap = new Map(
    dailyCancelRows.map((r) => [toDateKey(r.d), Number(r.c)])
  );

  return {
    period,
    periodLabel: label,
    startDate: start,
    endDate: end,
    generatedAt: new Date().toISOString(),
    currency: 'GHS',
    summary: {
      occupancyRate,
      roomsTotal,
      roomsOccupied,
      roomsVacant,
      adr,
      revpar,
      revenuePeriod,
      revenueToday: Number(revenueTodayRows[0]?.amount ?? 0),
      outstandingBalance: Number(outstandingRows[0]?.balance ?? 0),
      arrivals: Number(arrivalsRows[0]?.c ?? 0),
      departures: Number(departuresRows[0]?.c ?? 0),
      inHouse: Number(inHouseRows[0]?.c ?? 0),
      reservationsCreated: Number(createdRows[0]?.c ?? 0),
      cancellations: Number(cancelRows[0]?.c ?? 0),
      avgStayNights: Math.round(Number(stayRows[0]?.avg_nights ?? 0) * 10) / 10,
    },
    kpisVsPrior: {
      revenueChangePct: pctChange(revenuePeriod, revenuePrior),
      occupancyChangePct: null,
      adrChangePct: pctChange(adr, priorAdr),
    },
    rows: trendDates
      .map((d) => ({
        date: d,
        label: formatReportDate(d),
        arrivals: arrivalMap.get(d) ?? 0,
        departures: departureMap.get(d) ?? 0,
        bookings: bookingMap.get(d) ?? 0,
        cancellations: cancelMap.get(d) ?? 0,
        revenue: revenueMap.get(d) ?? 0,
        payments: paymentCountMap.get(d) ?? 0,
        occ_rooms: roomsOccupied,
      }))
      .filter(
        (row) =>
          row.arrivals > 0 ||
          row.departures > 0 ||
          row.bookings > 0 ||
          row.cancellations > 0 ||
          row.payments > 0 ||
          row.revenue > 0
      ),
    paymentMethods: paymentRows.map((r) => ({
      method: r.method,
      label: REPORT_PAY_METHOD[r.method] ?? r.method.replace(/_/g, ' '),
      amount: Number(r.amount),
      count: Number(r.c),
    })),
    roomTypePerformance: roomTypeRows.map((r) => {
      const rooms = Number(r.rooms);
      const occupied = Number(r.occupied);
      return {
        room_type: r.room_type,
        rooms,
        occupied,
        occupancy_pct: rooms > 0 ? Math.round((occupied / rooms) * 1000) / 10 : 0,
        revenue: Number(r.revenue),
        avg_rate: Number(r.avg_rate),
      };
    }),
    reservationStatus: resStatusRows.map((r) => ({
      status: r.status,
      label: REPORT_RES_STATUS[r.status] ?? r.status.replace(/_/g, ' '),
      count: Number(r.c),
    })),
    folioAging: folioAgingRows.map((r) => ({
      bucket: r.bucket,
      count: Number(r.c),
      balance: Number(r.balance),
    })),
  };
}

// ─── Inventory ───────────────────────────────────────────────────────────────

export async function listSuppliers(db: DbConfig, propertyId: number) {
  return queryTenant(
    db,
    `SELECT * FROM suppliers WHERE property_id = :propertyId ORDER BY name`,
    { propertyId }
  );
}

export async function createSupplier(
  db: DbConfig,
  propertyId: number,
  input: { name: string; contact_name?: string; email?: string; phone?: string }
) {
  const result = await executeTenant(
    db,
    `INSERT INTO suppliers (property_id, name, contact_name, email, phone)
     VALUES (:propertyId, :name, :contactName, :email, :phone)`,
    {
      propertyId,
      name: input.name,
      contactName: input.contact_name || null,
      email: input.email || null,
      phone: input.phone || null,
    }
  );
  return Number((result as { insertId?: number }).insertId);
}

export async function updateSupplier(
  db: DbConfig,
  propertyId: number,
  id: number,
  input: { name: string; contact_name?: string | null; email?: string | null; phone?: string | null }
) {
  const result = await executeTenant(
    db,
    `UPDATE suppliers
     SET name = :name, contact_name = :contactName, email = :email, phone = :phone
     WHERE id = :id AND property_id = :propertyId`,
    {
      id,
      propertyId,
      name: input.name.trim(),
      contactName: input.contact_name?.trim() || null,
      email: input.email?.trim() || null,
      phone: input.phone?.trim() || null,
    }
  );
  if (!Number((result as { affectedRows?: number }).affectedRows)) {
    throw new Error('Supplier not found.');
  }
}

export async function deleteSupplier(db: DbConfig, propertyId: number, id: number) {
  const result = await executeTenant(
    db,
    `DELETE FROM suppliers WHERE id = :id AND property_id = :propertyId`,
    { id, propertyId }
  );
  if (!Number((result as { affectedRows?: number }).affectedRows)) {
    throw new Error('Supplier not found.');
  }
}

export async function listStockItems(db: DbConfig, propertyId: number) {
  return queryTenant(
    db,
    `SELECT s.*, sup.name AS supplier_name,
            CASE WHEN s.quantity_on_hand <= s.reorder_level THEN 1 ELSE 0 END AS is_low_stock
     FROM stock_items s
     LEFT JOIN suppliers sup ON sup.id = s.supplier_id
     WHERE s.property_id = :propertyId
     ORDER BY is_low_stock DESC, s.name`,
    { propertyId }
  );
}

function isKitchenDepartment(department: string | null | undefined): boolean {
  const d = String(department || '').toLowerCase();
  return /restaurant|kitchen|food|f\s*&\s*b|f&b|\bfb\b|bar|catering/.test(d);
}

async function notifyLowStock(
  db: DbConfig,
  item: {
    name: string;
    quantity_on_hand: number;
    reorder_level: number;
    department?: string | null;
    unit?: string | null;
  },
  opts?: { companyId?: number; propertyId?: number; forceSms?: boolean; crossedThreshold?: boolean }
) {
  const qty = Number(item.quantity_on_hand);
  const reorder = Number(item.reorder_level);
  const depleted = qty <= 0;
  const low = qty <= reorder;
  if (!low && !depleted) return;

  const unit = item.unit ? ` ${item.unit}` : '';
  const title = depleted ? 'Stock finished' : 'Low stock alert';
  const body = depleted
    ? `${item.name} is out of stock (0${unit}). Reorder level: ${reorder}.`
    : `${item.name} is at ${qty}${unit} (reorder ${reorder})`;

  const { createRoleNotification } = await import('@/lib/services/in-app-notifications');
  const roles = ['owner', 'admin', 'manager'];
  if (isKitchenDepartment(item.department)) {
    roles.push('cook', 'chef', 'kitchen_supervisor');
  }
  await createRoleNotification(db, roles, {
    type: 'inventory',
    title,
    body,
    link: '/inventory',
  });

  const shouldSms =
    opts?.forceSms ||
    opts?.crossedThreshold ||
    depleted;
  if (!shouldSms || !opts?.companyId || !isKitchenDepartment(item.department)) return;

  try {
    const staff = await queryTenant<Array<{ phone: string }>>(
      db,
      `SELECT phone FROM users
       WHERE is_active = 1
         AND role IN ('cook', 'chef', 'kitchen_supervisor')
         AND phone IS NOT NULL AND TRIM(phone) <> ''
         AND (property_id = :propertyId OR property_id IS NULL)`,
      { propertyId: opts.propertyId ?? 0 }
    );
    if (!staff.length) return;

    const { sendStaffSms } = await import('@/lib/services/notification-service');
    const smsBody = depleted
      ? `Hotel stock: ${item.name} is FINISHED (0${unit}). Please restock.`
      : `Hotel stock: ${item.name} low — ${qty}${unit} left (reorder at ${reorder}).`;

    await Promise.allSettled(
      staff.map((s) => sendStaffSms(opts.companyId!, String(s.phone), smsBody))
    );
  } catch (err) {
    console.error('Low-stock kitchen SMS failed:', err);
  }
}

export async function createStockItem(
  db: DbConfig,
  propertyId: number,
  input: {
    name: string;
    sku?: string;
    department?: string;
    unit?: string;
    quantity_on_hand?: number;
    reorder_level?: number;
    unit_cost?: number;
    supplier_id?: number;
  },
  opts?: { companyId?: number }
) {
  const result = await executeTenant(
    db,
    `INSERT INTO stock_items
       (property_id, supplier_id, name, sku, department, unit, quantity_on_hand, reorder_level, unit_cost)
     VALUES
       (:propertyId, :supplierId, :name, :sku, :department, :unit, :qty, :reorder, :unitCost)`,
    {
      propertyId,
      supplierId: input.supplier_id || null,
      name: input.name,
      sku: input.sku || null,
      department: input.department || 'general',
      unit: input.unit || 'unit',
      qty: input.quantity_on_hand ?? 0,
      reorder: input.reorder_level ?? 0,
      unitCost: input.unit_cost ?? 0,
    }
  );
  const id = Number((result as { insertId?: number }).insertId);
  const qty = input.quantity_on_hand ?? 0;
  const reorder = input.reorder_level ?? 0;
  if (qty <= reorder) {
    await notifyLowStock(
      db,
      {
        name: input.name,
        quantity_on_hand: qty,
        reorder_level: reorder,
        department: input.department || 'general',
        unit: input.unit || 'unit',
      },
      {
        companyId: opts?.companyId,
        propertyId,
        forceSms: true,
        crossedThreshold: true,
      }
    );
  }
  return id;
}

export async function updateStockItem(
  db: DbConfig,
  propertyId: number,
  id: number,
  input: {
    name: string;
    sku?: string | null;
    department?: string | null;
    unit?: string | null;
    reorder_level?: number;
    unit_cost?: number;
    supplier_id?: number | null;
  },
  opts?: { companyId?: number }
) {
  const beforeRows = await queryTenant<
    Array<{ quantity_on_hand: number; reorder_level: number; department: string | null }>
  >(
    db,
    `SELECT quantity_on_hand, reorder_level, department FROM stock_items
     WHERE id = :id AND property_id = :propertyId LIMIT 1`,
    { id, propertyId }
  );
  const before = beforeRows[0];
  if (!before) throw new Error('Stock item not found.');

  const result = await executeTenant(
    db,
    `UPDATE stock_items
     SET name = :name, sku = :sku, department = :department, unit = :unit,
         reorder_level = :reorder, unit_cost = :unitCost, supplier_id = :supplierId
     WHERE id = :id AND property_id = :propertyId`,
    {
      id,
      propertyId,
      name: input.name.trim(),
      sku: input.sku?.trim() || null,
      department: input.department?.trim() || 'general',
      unit: input.unit?.trim() || 'unit',
      reorder: input.reorder_level ?? 0,
      unitCost: input.unit_cost ?? 0,
      supplierId: input.supplier_id || null,
    }
  );
  if (!Number((result as { affectedRows?: number }).affectedRows)) {
    throw new Error('Stock item not found.');
  }

  const qty = Number(before.quantity_on_hand);
  const oldReorder = Number(before.reorder_level);
  const newReorder = input.reorder_level ?? oldReorder;
  const dept = input.department?.trim() || before.department;
  const wasLow = qty <= oldReorder;
  const isLow = qty <= newReorder;
  if (isLow && !wasLow) {
    await notifyLowStock(
      db,
      {
        name: input.name.trim(),
        quantity_on_hand: qty,
        reorder_level: newReorder,
        department: dept,
        unit: input.unit?.trim() || 'unit',
      },
      {
        companyId: opts?.companyId,
        propertyId,
        crossedThreshold: true,
      }
    );
  }
}

export async function deleteStockItem(db: DbConfig, propertyId: number, id: number) {
  const result = await executeTenant(
    db,
    `DELETE FROM stock_items WHERE id = :id AND property_id = :propertyId`,
    { id, propertyId }
  );
  if (!Number((result as { affectedRows?: number }).affectedRows)) {
    throw new Error('Stock item not found.');
  }
}

export async function adjustStock(
  db: DbConfig,
  id: number,
  quantity: number,
  opts?: { companyId?: number; propertyId?: number }
) {
  const beforeRows = await queryTenant<
    Array<{
      name: string;
      quantity_on_hand: number;
      reorder_level: number;
      department: string | null;
      unit: string | null;
      property_id: number;
    }>
  >(
    db,
    `SELECT name, quantity_on_hand, reorder_level, department, unit, property_id
     FROM stock_items WHERE id = :id LIMIT 1`,
    { id }
  );
  const before = beforeRows[0];
  if (!before) throw new Error('Stock item not found.');
  if (opts?.propertyId && Number(before.property_id) !== opts.propertyId) {
    throw new Error('Stock item not found.');
  }

  const beforeQty = Number(before.quantity_on_hand);
  const reorder = Number(before.reorder_level);

  await executeTenant(
    db,
    `UPDATE stock_items SET quantity_on_hand = quantity_on_hand + :quantity WHERE id = :id`,
    { id, quantity }
  );

  const afterQty = beforeQty + quantity;
  const crossedThreshold = afterQty <= reorder && beforeQty > reorder;
  const depleted = afterQty <= 0 && beforeQty > 0;

  if (afterQty <= reorder || afterQty <= 0) {
    await notifyLowStock(
      db,
      {
        name: before.name,
        quantity_on_hand: afterQty,
        reorder_level: reorder,
        department: before.department,
        unit: before.unit,
      },
      {
        companyId: opts?.companyId,
        propertyId: Number(before.property_id),
        crossedThreshold: crossedThreshold || depleted,
      }
    );
  }
}

// ─── Settings ────────────────────────────────────────────────────────────────

export async function getProperty(db: DbConfig, propertyId: number) {
  const rows = await queryTenant(db, `SELECT * FROM properties WHERE id = :propertyId`, { propertyId });
  return (rows as unknown[])[0];
}

export async function updateProperty(
  db: DbConfig,
  propertyId: number,
  input: Record<string, string | number | null>
) {
  const sets: string[] = [];
  const params: Record<string, string | number | null> = { propertyId };

  const stringFields = ['name', 'address', 'phone', 'email', 'timezone', 'currency'] as const;
  for (const key of stringFields) {
    if (input[key] !== undefined) {
      sets.push(`${key} = :${key}`);
      params[key] = input[key] == null ? null : String(input[key]);
    }
  }

  if (input.attendance_latitude !== undefined) {
    sets.push('attendance_latitude = :attendanceLatitude');
    params.attendanceLatitude =
      input.attendance_latitude === null || input.attendance_latitude === ''
        ? null
        : Number(input.attendance_latitude);
  }
  if (input.attendance_longitude !== undefined) {
    sets.push('attendance_longitude = :attendanceLongitude');
    params.attendanceLongitude =
      input.attendance_longitude === null || input.attendance_longitude === ''
        ? null
        : Number(input.attendance_longitude);
  }
  if (input.attendance_radius_m !== undefined) {
    sets.push('attendance_radius_m = :attendanceRadiusM');
    params.attendanceRadiusM =
      input.attendance_radius_m === null || input.attendance_radius_m === ''
        ? null
        : Number(input.attendance_radius_m);
  }

  if (sets.length === 0) return;

  await executeTenant(
    db,
    `UPDATE properties SET ${sets.join(', ')} WHERE id = :propertyId`,
    params
  );
}

export async function listStaff(db: DbConfig, propertyId: number) {
  return queryTenant(
    db,
    `SELECT id, name, email, phone, role, is_active, must_change_password, last_login_at, created_at
     FROM users WHERE property_id = :propertyId ORDER BY name`,
    { propertyId }
  );
}
