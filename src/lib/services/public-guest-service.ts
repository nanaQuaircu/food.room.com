import type { DbConfig } from '@/lib/db/central';
import { executeTenant, queryTenant } from '@/lib/db/tenant';
import { createGuest } from '@/lib/services/hotel-service';
import { checkAvailability, createReservationAdvanced } from '@/lib/services/reservations-loop2';
import { calculateBookingNights, calculateRoomTotal } from '@/lib/billing/stay-billing';
import { parseAmenities } from '@/lib/rooms/amenities';

export type PublicRoomType = {
  id: number;
  name: string;
  code: string;
  description: string | null;
  base_rate: number;
  max_occupancy: number;
  image_url: string | null;
};

export type PublicPropertyProfile = {
  id: number;
  name: string;
  slug: string;
  logo_url: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  currency: string;
  latitude: number | null;
  longitude: number | null;
};

export async function getPublicPropertyProfile(db: DbConfig, propertyId: number, slug: string, logoUrl: string | null) {
  const rows = await queryTenant<
    Array<{
      id: number;
      name: string;
      address: string | null;
      phone: string | null;
      email: string | null;
      currency: string;
      attendance_latitude: number | null;
      attendance_longitude: number | null;
    }>
  >(
    db,
    `SELECT id, name, address, phone, email, currency, attendance_latitude, attendance_longitude
     FROM properties WHERE id = :propertyId LIMIT 1`,
    { propertyId }
  );
  const row = rows[0];
  if (!row) return null;

  return {
    id: row.id,
    name: row.name,
    slug,
    logo_url: logoUrl,
    address: row.address,
    phone: row.phone,
    email: row.email,
    currency: row.currency || 'GHS',
    latitude: row.attendance_latitude != null ? Number(row.attendance_latitude) : null,
    longitude: row.attendance_longitude != null ? Number(row.attendance_longitude) : null,
  } satisfies PublicPropertyProfile;
}

export type PublicHotelStats = {
  rooms: number;
  room_types: number;
  menu_items: number;
  stays: number;
};

/** Live counts for guest About / milestones. */
export async function getPublicHotelStats(
  db: DbConfig,
  propertyId: number
): Promise<PublicHotelStats> {
  const [roomRows, typeRows, menuRows, stayRows] = await Promise.all([
    queryTenant<Array<{ c: number }>>(
      db,
      `SELECT COUNT(*) AS c FROM rooms
       WHERE property_id = :propertyId AND is_active = 1`,
      { propertyId }
    ),
    queryTenant<Array<{ c: number }>>(
      db,
      `SELECT COUNT(*) AS c FROM room_types WHERE property_id = :propertyId`,
      { propertyId }
    ),
    queryTenant<Array<{ c: number }>>(
      db,
      `SELECT COUNT(*) AS c FROM menu_items
       WHERE property_id = :propertyId AND is_available = 1`,
      { propertyId }
    ),
    queryTenant<Array<{ c: number }>>(
      db,
      `SELECT COUNT(*) AS c FROM reservations
       WHERE property_id = :propertyId
         AND status IN ('confirmed', 'checked_in', 'checked_out')`,
      { propertyId }
    ),
  ]);

  return {
    rooms: Number(roomRows[0]?.c ?? 0),
    room_types: Number(typeRows[0]?.c ?? 0),
    menu_items: Number(menuRows[0]?.c ?? 0),
    stays: Number(stayRows[0]?.c ?? 0),
  };
}

export async function listPublicRoomTypes(db: DbConfig, propertyId: number): Promise<PublicRoomType[]> {
  const rows = await queryTenant<
    Array<{
      id: number;
      name: string;
      code: string;
      description: string | null;
      base_rate: number;
      max_occupancy: number;
      image_url: string | null;
    }>
  >(
    db,
    `SELECT rt.id, rt.name, rt.code, rt.description, rt.base_rate, rt.max_occupancy,
            COALESCE(
              NULLIF(rt.image_url, ''),
              (
                SELECT r.image_url
                FROM rooms r
                WHERE r.room_type_id = rt.id
                  AND r.property_id = rt.property_id
                  AND r.is_active = 1
                  AND r.image_url IS NOT NULL
                  AND r.image_url != ''
                ORDER BY r.id
                LIMIT 1
              )
            ) AS image_url
     FROM room_types rt
     WHERE rt.property_id = :propertyId
       AND EXISTS (
         SELECT 1 FROM rooms r
         WHERE r.room_type_id = rt.id
           AND r.property_id = rt.property_id
           AND r.is_active = 1
       )
     ORDER BY rt.name`,
    { propertyId }
  );
  return rows.map((r) => ({
    ...r,
    base_rate: Number(r.base_rate),
    max_occupancy: Number(r.max_occupancy),
  }));
}

export type PublicRoomImage = { id: number; image_url: string; sort_order: number };

export type PublicAvailableRoom = {
  id: number;
  room_number: string;
  floor: string | null;
  status: string;
  image_url: string | null;
  room_type_id: number;
  room_type_name: string;
  description: string | null;
  amenities: string[];
  bed_type: string | null;
  size_sqm: number | null;
  images: PublicRoomImage[];
  base_rate: number;
  max_occupancy: number;
};

export type PublicCatalogRoom = {
  id: number;
  room_number: string;
  floor: string | null;
  status: string;
  room_type_id: number;
  room_type_name: string;
  description: string | null;
  amenities: string[];
  bed_type: string | null;
  size_sqm: number | null;
  base_rate: number;
  max_occupancy: number;
  image_url: string | null;
  images: PublicRoomImage[];
};

async function loadImagesForRooms(
  db: DbConfig,
  propertyId: number,
  roomIds: number[]
): Promise<Map<number, PublicRoomImage[]>> {
  const map = new Map<number, PublicRoomImage[]>();
  if (!roomIds.length) return map;
  const placeholders = roomIds.map((_, i) => `:id${i}`).join(',');
  const params: Record<string, number> = { propertyId };
  roomIds.forEach((id, i) => {
    params[`id${i}`] = id;
  });
  const rows = await queryTenant<
    Array<{ id: number; room_id: number; image_url: string; sort_order: number }>
  >(
    db,
    `SELECT id, room_id, image_url, sort_order
     FROM room_images
     WHERE property_id = :propertyId AND room_id IN (${placeholders})
     ORDER BY sort_order ASC, id ASC`,
    params
  );
  for (const row of rows) {
    const list = map.get(row.room_id) || [];
    list.push({ id: row.id, image_url: row.image_url, sort_order: row.sort_order });
    map.set(row.room_id, list);
  }
  return map;
}

/** Guest website catalog: one card per physical room (number first, type as label). */
export async function listPublicCatalogRooms(
  db: DbConfig,
  propertyId: number
): Promise<PublicCatalogRoom[]> {
  const rows = await queryTenant<
    Array<{
      id: number;
      room_number: string;
      floor: string | null;
      status: string;
      room_type_id: number;
      room_type_name: string;
      description: string | null;
      amenities: unknown;
      bed_type: string | null;
      size_sqm: number | null;
      base_rate: number;
      max_occupancy: number;
      image_url: string | null;
    }>
  >(
    db,
    `SELECT r.id, r.room_number, r.floor, r.status,
            r.room_type_id, rt.name AS room_type_name,
            COALESCE(NULLIF(r.description, ''), NULLIF(rt.description, '')) AS description,
            r.amenities, r.bed_type, r.size_sqm,
            rt.base_rate, rt.max_occupancy,
            COALESCE(NULLIF(r.image_url, ''), NULLIF(rt.image_url, '')) AS image_url
     FROM rooms r
     JOIN room_types rt ON rt.id = r.room_type_id
     WHERE r.property_id = :propertyId AND r.is_active = 1
     ORDER BY
       CASE WHEN r.room_number REGEXP '^[0-9]+$' THEN 0 ELSE 1 END,
       CAST(r.room_number AS UNSIGNED),
       r.room_number`,
    { propertyId }
  );

  const images = await loadImagesForRooms(
    db,
    propertyId,
    rows.map((r) => r.id)
  );

  return rows.map((r) => ({
    id: r.id,
    room_number: r.room_number,
    floor: r.floor,
    status: r.status,
    room_type_id: r.room_type_id,
    room_type_name: r.room_type_name,
    description: r.description,
    amenities: parseAmenities(r.amenities),
    bed_type: r.bed_type,
    size_sqm: r.size_sqm != null ? Number(r.size_sqm) : null,
    base_rate: Number(r.base_rate),
    max_occupancy: Number(r.max_occupancy),
    image_url: r.image_url || images.get(r.id)?.[0]?.image_url || null,
    images: images.get(r.id) || [],
  }));
}

export async function getPublicRoomDetails(
  db: DbConfig,
  propertyId: number,
  roomId: number
): Promise<PublicCatalogRoom | null> {
  const rooms = await listPublicCatalogRooms(db, propertyId);
  return rooms.find((r) => r.id === roomId) ?? null;
}

/** Physical rooms of a type that are free for the stay (not occupied/OOO/dirty/booked). */
export async function listPublicAvailableRooms(
  db: DbConfig,
  propertyId: number,
  roomTypeId: number,
  checkIn: string,
  checkOut: string,
  sessionId?: string
): Promise<PublicAvailableRoom[]> {
  const rows = await queryTenant<
    Array<{
      id: number;
      room_number: string;
      floor: string | null;
      status: string;
      image_url: string | null;
      room_type_id: number;
      room_type_name: string;
      description: string | null;
      amenities: unknown;
      bed_type: string | null;
      size_sqm: number | null;
      base_rate: number;
      max_occupancy: number;
    }>
  >(
    db,
    `SELECT r.id, r.room_number, r.floor, r.status,
            COALESCE(NULLIF(r.image_url, ''), NULLIF(rt.image_url, '')) AS image_url,
            r.room_type_id, rt.name AS room_type_name,
            COALESCE(NULLIF(r.description, ''), NULLIF(rt.description, '')) AS description,
            r.amenities, r.bed_type, r.size_sqm,
            rt.base_rate, rt.max_occupancy
     FROM rooms r
     JOIN room_types rt ON rt.id = r.room_type_id
     WHERE r.property_id = :propertyId
       AND r.room_type_id = :roomTypeId
       AND r.is_active = 1
       AND r.status IN ('vacant', 'clean', 'inspected')
       AND NOT EXISTS (
         SELECT 1 FROM reservations res
         WHERE res.property_id = :propertyId
           AND res.room_id = r.id
           AND res.status IN ('pending', 'confirmed', 'checked_in')
           AND res.check_in_date < :checkOut
           AND res.check_out_date > :checkIn
       )
       AND NOT EXISTS (
         SELECT 1 FROM room_holds rh
         WHERE rh.property_id = :propertyId
           AND rh.room_id = r.id
           AND rh.expires_at > CURRENT_TIMESTAMP
           AND (:sessionId IS NULL OR rh.session_id <> :sessionId)
       )
     ORDER BY r.floor IS NULL, r.floor, r.room_number`,
    { propertyId, roomTypeId, checkIn, checkOut, sessionId: sessionId || null }
  );

  const images = await loadImagesForRooms(
    db,
    propertyId,
    rows.map((r) => r.id)
  );

  return rows.map((r) => ({
    id: r.id,
    room_number: r.room_number,
    floor: r.floor,
    status: r.status,
    image_url: r.image_url || images.get(r.id)?.[0]?.image_url || null,
    room_type_id: r.room_type_id,
    room_type_name: r.room_type_name,
    description: r.description,
    amenities: parseAmenities(r.amenities),
    bed_type: r.bed_type,
    size_sqm: r.size_sqm != null ? Number(r.size_sqm) : null,
    images: images.get(r.id) || [],
    base_rate: Number(r.base_rate),
    max_occupancy: Number(r.max_occupancy),
  }));
}

export async function getPublicRoomType(db: DbConfig, propertyId: number, roomTypeId: number) {
  const rows = await listPublicRoomTypes(db, propertyId);
  return rows.find((r) => r.id === roomTypeId) ?? null;
}

export async function getPublicAvailability(
  db: DbConfig,
  propertyId: number,
  roomTypeId: number,
  checkIn: string,
  checkOut: string,
  options?: { excludeSessionId?: string }
) {
  const avail = await checkAvailability(db, propertyId, roomTypeId, checkIn, checkOut, {
    excludeSessionId: options?.excludeSessionId,
  });
  const nights = calculateBookingNights(checkIn, checkOut);
  const roomType = await getPublicRoomType(db, propertyId, roomTypeId);
  const rate = Number(roomType?.base_rate ?? 0);
  return {
    ...avail,
    nights,
    rate_per_night: rate,
    total_amount: calculateRoomTotal(rate, nights),
  };
}

async function getSystemUserId(db: DbConfig, propertyId: number): Promise<number> {
  const rows = await queryTenant<Array<{ id: number }>>(
    db,
    `SELECT id FROM users
     WHERE property_id = :propertyId AND is_active = 1
     ORDER BY FIELD(role, 'owner', 'admin', 'manager'), id
     LIMIT 1`,
    { propertyId }
  );
  const id = rows[0]?.id;
  if (!id) throw new Error('Hotel staff account not configured.');
  return id;
}

export async function upsertGuestByEmail(
  db: DbConfig,
  input: { first_name: string; last_name: string; email: string; phone?: string }
) {
  const email = input.email.trim().toLowerCase();
  const existing = await queryTenant<Array<{ id: number }>>(
    db,
    `SELECT id FROM guests WHERE LOWER(email) = :email LIMIT 1`,
    { email }
  );
  if (existing[0]) {
    await executeTenant(
      db,
      `UPDATE guests SET first_name = :firstName, last_name = :lastName, phone = COALESCE(:phone, phone)
       WHERE id = :id`,
      {
        id: existing[0].id,
        firstName: input.first_name,
        lastName: input.last_name,
        phone: input.phone || null,
      }
    );
    return existing[0].id;
  }
  return createGuest(db, {
    first_name: input.first_name,
    last_name: input.last_name,
    email,
    phone: input.phone,
  });
}

export async function createWebsiteBooking(
  db: DbConfig,
  propertyId: number,
  input: {
    room_type_id: number;
    room_id?: number;
    check_in_date: string;
    check_out_date: string;
    adults: number;
    children: number;
    first_name: string;
    last_name: string;
    email: string;
    phone?: string;
    notes?: string;
    hold_session_id?: string;
    /** Online Paystack: keep pending until payment succeeds. */
    payment_choice?: 'hotel' | 'online';
  }
) {
  const userId = await getSystemUserId(db, propertyId);
  const guestId = await upsertGuestByEmail(db, input);

  if (input.room_id) {
    const rooms = await listPublicAvailableRooms(
      db,
      propertyId,
      input.room_type_id,
      input.check_in_date,
      input.check_out_date,
      input.hold_session_id
    );
    if (!rooms.some((r) => r.id === input.room_id)) {
      throw new Error('Selected room is not available for these dates.');
    }
  }

  const booking = await createReservationAdvanced(db, propertyId, userId, {
    guest_id: guestId,
    room_type_id: input.room_type_id,
    room_id: input.room_id,
    check_in_date: input.check_in_date,
    check_out_date: input.check_out_date,
    adults: input.adults,
    children: input.children,
    notes: input.notes,
    source: 'website',
    exclude_hold_session_id: input.hold_session_id,
    status: input.payment_choice === 'online' ? 'pending' : 'confirmed',
  });

  if (input.hold_session_id) {
    await releaseRoomHold(db, input.hold_session_id);
  }

  return { ...booking, guest_id: guestId };
}

export async function getBookingByConfirmation(db: DbConfig, propertyId: number, code: string) {
  const rows = await queryTenant<
    Array<{
      id: number;
      confirmation_code: string;
      status: string;
      check_in_date: string;
      check_out_date: string;
      total_amount: number;
      adults: number;
      children: number;
      guest_first_name: string;
      guest_last_name: string;
      guest_email: string | null;
      guest_phone: string | null;
      room_type_id: number | null;
      room_type_name: string | null;
      room_number: string | null;
    }>
  >(
    db,
    `SELECT r.id, r.confirmation_code, r.status, r.check_in_date, r.check_out_date,
            r.total_amount, r.adults, r.children,
            g.first_name AS guest_first_name, g.last_name AS guest_last_name,
            g.email AS guest_email, g.phone AS guest_phone,
            r.room_type_id, rt.name AS room_type_name,
            rm.room_number
     FROM reservations r
     INNER JOIN guests g ON g.id = r.guest_id
     LEFT JOIN room_types rt ON rt.id = r.room_type_id
     LEFT JOIN rooms rm ON rm.id = r.room_id
     WHERE r.property_id = :propertyId AND r.confirmation_code = :code
     LIMIT 1`,
    { propertyId, code }
  );
  return rows[0] ?? null;
}

/** Confirm a pending website booking after successful online payment. */
export async function confirmPendingWebsiteBooking(
  db: DbConfig,
  propertyId: number,
  reservationId: number
) {
  await executeTenant(
    db,
    `UPDATE reservations
     SET status = 'confirmed'
     WHERE id = :id AND property_id = :propertyId AND status = 'pending'`,
    { id: reservationId, propertyId }
  );
}

/** Drop an unpaid online booking if the guest closes Paystack without paying. */
export async function cancelUnpaidWebsiteBooking(
  db: DbConfig,
  propertyId: number,
  confirmationCode: string
) {
  const booking = await getBookingByConfirmation(db, propertyId, confirmationCode);
  if (!booking) return { cancelled: false as const, reason: 'not_found' };
  if (booking.status !== 'pending') {
    return { cancelled: false as const, reason: 'not_pending', status: booking.status };
  }

  await executeTenant(
    db,
    `UPDATE reservations
     SET status = 'cancelled'
     WHERE id = :id AND property_id = :propertyId AND status = 'pending'`,
    { id: booking.id, propertyId }
  );

  await executeTenant(
    db,
    `UPDATE guest_payment_intents
     SET status = 'failed'
     WHERE reservation_id = :reservationId AND status = 'pending'`,
    { reservationId: booking.id }
  );

  return { cancelled: true as const, confirmation_code: confirmationCode };
}

/** Switch a pending online booking to pay-at-hotel (confirmed) when Paystack is unavailable. */
export async function finalizeWebsiteBookingAsPayAtHotel(
  db: DbConfig,
  propertyId: number,
  confirmationCode: string
) {
  const booking = await getBookingByConfirmation(db, propertyId, confirmationCode);
  if (!booking) throw new Error('Booking not found.');
  if (booking.status === 'confirmed') return booking;
  if (booking.status !== 'pending') throw new Error('Booking cannot be finalized.');

  await executeTenant(
    db,
    `UPDATE reservations
     SET status = 'confirmed'
     WHERE id = :id AND property_id = :propertyId AND status = 'pending'`,
    { id: booking.id, propertyId }
  );

  return getBookingByConfirmation(db, propertyId, confirmationCode);
}

export async function listGuestTrips(db: DbConfig, propertyId: number, guestId: number) {
  return queryTenant(
    db,
    `SELECT r.id, r.confirmation_code, r.status, r.check_in_date, r.check_out_date,
            r.total_amount, r.room_type_id, rt.name AS room_type_name, rm.room_number
     FROM reservations r
     LEFT JOIN room_types rt ON rt.id = r.room_type_id
     LEFT JOIN rooms rm ON rm.id = r.room_id
     WHERE r.property_id = :propertyId AND r.guest_id = :guestId
     ORDER BY r.check_in_date DESC`,
    { propertyId, guestId }
  );
}

export async function saveGuestPaymentIntent(
  db: DbConfig,
  reservationId: number,
  reference: string,
  amount: number,
  currency: string
) {
  await executeTenant(
    db,
    `INSERT INTO guest_payment_intents (reservation_id, reference, amount, currency, status)
     VALUES (:reservationId, :reference, :amount, :currency, 'pending')`,
    { reservationId, reference, amount, currency }
  );
}

export async function confirmGuestPayment(
  db: DbConfig,
  propertyId: number,
  reference: string,
  verifiedAmount: number
) {
  const intents = await queryTenant<
    Array<{ id: number; reservation_id: number; amount: number; status: string }>
  >(
    db,
    `SELECT id, reservation_id, amount, status FROM guest_payment_intents
     WHERE reference = :reference LIMIT 1`,
    { reference }
  );
  const intent = intents[0];
  if (!intent) throw new Error('Payment intent not found.');
  if (intent.status === 'success') return { already: true, reservation_id: intent.reservation_id };

  if (Math.abs(Number(intent.amount) - verifiedAmount) > 0.01) {
    throw new Error('Paid amount does not match booking total.');
  }

  const userId = await getSystemUserId(db, propertyId);
  const folioRows = await queryTenant<Array<{ id: number }>>(
    db,
    `SELECT id FROM folios WHERE reservation_id = :reservationId LIMIT 1`,
    { reservationId: intent.reservation_id }
  );
  const folioId = folioRows[0]?.id;
  if (!folioId) throw new Error('Folio not found for reservation.');

  const { addPayment } = await import('@/lib/services/hotel-service');
  await addPayment(db, folioId, userId, {
    method: 'paystack',
    amount: verifiedAmount,
    reference,
  });

  await executeTenant(
    db,
    `UPDATE guest_payment_intents SET status = 'success', paid_at = CURRENT_TIMESTAMP WHERE id = :id`,
    { id: intent.id }
  );

  await confirmPendingWebsiteBooking(db, propertyId, intent.reservation_id);

  return { already: false, reservation_id: intent.reservation_id, folio_id: folioId };
}

export async function getRoomTypeReviews(db: DbConfig, propertyId: number, roomTypeId: number) {
  return queryTenant<
    Array<{
      id: number;
      rating: number;
      comment: string | null;
      created_at: string;
      guest_name: string;
    }>
  >(
    db,
    `SELECT r.id, r.rating, r.comment, r.created_at,
            CONCAT(g.first_name, ' ', g.last_name) AS guest_name
     FROM room_type_reviews r
     INNER JOIN guests g ON g.id = r.guest_id
     WHERE r.property_id = :propertyId AND r.room_type_id = :roomTypeId
     ORDER BY r.created_at DESC`,
    { propertyId, roomTypeId }
  );
}

export async function canGuestReviewRoomType(db: DbConfig, propertyId: number, guestId: number, roomTypeId: number) {
  const rows = await queryTenant<Array<{ id: number }>>(
    db,
    `SELECT id FROM reservations
     WHERE property_id = :propertyId
       AND guest_id = :guestId
       AND room_type_id = :roomTypeId
       AND status = 'checked_out'
     LIMIT 1`,
    { propertyId, guestId, roomTypeId }
  );
  return rows.length > 0;
}

export async function saveRoomTypeReview(
  db: DbConfig,
  propertyId: number,
  guestId: number,
  reservationId: number,
  roomTypeId: number,
  rating: number,
  comment: string
) {
  const allowed = await queryTenant<Array<{ id: number }>>(
    db,
    `SELECT id FROM reservations
     WHERE property_id = :propertyId
       AND guest_id = :guestId
       AND id = :reservationId
       AND room_type_id = :roomTypeId
       AND status = 'checked_out'
     LIMIT 1`,
    { propertyId, guestId, reservationId, roomTypeId }
  );
  if (!allowed[0]) {
    throw new Error('You can only review room types for completed, checked-out stays.');
  }
  await executeTenant(
    db,
    `INSERT INTO room_type_reviews (property_id, room_type_id, guest_id, reservation_id, rating, comment)
     VALUES (:propertyId, :roomTypeId, :guestId, :reservationId, :rating, :comment)`,
    { propertyId, roomTypeId, guestId, reservationId, rating, comment }
  );
}

export async function createRoomHold(
  db: DbConfig,
  propertyId: number,
  roomTypeId: number,
  roomId: number | null,
  sessionId: string,
  expiresAt: Date
) {
  await cleanExpiredHolds(db);
  await executeTenant(
    db,
    `DELETE FROM room_holds WHERE session_id = :sessionId`,
    { sessionId }
  );
  await executeTenant(
    db,
    `INSERT INTO room_holds (property_id, room_type_id, room_id, session_id, expires_at)
     VALUES (:propertyId, :roomTypeId, :roomId, :sessionId, :expiresAt)`,
    { propertyId, roomTypeId, roomId, sessionId, expiresAt }
  );
}

export async function releaseRoomHold(db: DbConfig, sessionId: string) {
  await executeTenant(
    db,
    `DELETE FROM room_holds WHERE session_id = :sessionId`,
    { sessionId }
  );
}

export async function cleanExpiredHolds(db: DbConfig) {
  await executeTenant(
    db,
    `DELETE FROM room_holds WHERE expires_at < CURRENT_TIMESTAMP`
  );
}

export async function updateDigitalCheckin(
  db: DbConfig,
  propertyId: number,
  guestId: number,
  reservationId: number,
  arrivalTime: string,
  idDocumentUrl: string
) {
  const res = await queryTenant<Array<{ id: number }>>(
    db,
    `SELECT id FROM reservations WHERE id = :id AND guest_id = :guestId AND property_id = :propertyId LIMIT 1`,
    { id: reservationId, guestId, propertyId }
  );
  if (!res[0]) throw new Error('Reservation not found or unauthorized.');
  
  await executeTenant(
    db,
    `UPDATE reservations SET arrival_time = :arrivalTime, id_document_url = :idDocumentUrl
     WHERE id = :id`,
    { id: reservationId, arrivalTime, idDocumentUrl }
  );
}

export async function getGuestProfile(db: DbConfig, guestId: number) {
  const rows = await queryTenant<
    Array<{
      id: number;
      first_name: string;
      last_name: string;
      email: string | null;
      phone: string | null;
      account_credits: number;
      preferred_room_notes: string | null;
    }>
  >(
    db,
    `SELECT g.id, g.first_name, g.last_name, g.email, g.phone,
            COALESCE(ga.account_credits, 0.00) AS account_credits,
            ga.preferred_room_notes
     FROM guests g
     LEFT JOIN guest_accounts ga ON ga.guest_id = g.id
     WHERE g.id = :guestId LIMIT 1`,
    { guestId }
  );
  return rows[0] ?? null;
}

export async function updateGuestProfile(
  db: DbConfig,
  guestId: number,
  firstName: string,
  lastName: string,
  phone: string,
  preferredRoomNotes: string
) {
  await executeTenant(
    db,
    `UPDATE guests SET first_name = :firstName, last_name = :lastName, phone = :phone
     WHERE id = :guestId`,
    { guestId, firstName, lastName, phone }
  );
  
  await executeTenant(
    db,
    `UPDATE guest_accounts SET preferred_room_notes = :preferredRoomNotes
     WHERE guest_id = :guestId`,
    { guestId, preferredRoomNotes }
  );
}

async function recalcFolioBalanceLocal(db: DbConfig, folioId: number) {
  const [chargeRows, paymentRows] = await Promise.all([
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
  ]);
  const charges = Number(chargeRows[0]?.total ?? 0);
  const paid = Number(paymentRows[0]?.total ?? 0);
  const balance = Math.round((charges - paid) * 100) / 100;
  await executeTenant(db, `UPDATE folios SET balance = :balance WHERE id = :folioId`, {
    folioId,
    balance,
  });
  return balance;
}

export async function modifyReservationByGuest(
  db: DbConfig,
  propertyId: number,
  guestId: number,
  reservationId: number,
  checkIn: string,
  checkOut: string,
  roomTypeId: number
) {
  const res = await queryTenant<Array<{ id: number; status: string }>>(
    db,
    `SELECT id, status FROM reservations
     WHERE id = :id AND guest_id = :guestId AND property_id = :propertyId
     LIMIT 1`,
    { id: reservationId, guestId, propertyId }
  );
  const booking = res[0];
  if (!booking) throw new Error('Reservation not found or unauthorized.');
  if (['cancelled', 'checked_out', 'no_show'].includes(booking.status)) {
    throw new Error('This booking cannot be modified.');
  }

  const { updateReservation } = await import('@/lib/services/reservations-loop2');
  const result = await updateReservation(db, propertyId, reservationId, {
    check_in_date: checkIn,
    check_out_date: checkOut,
    room_type_id: roomTypeId,
  });

  const folioRows = await queryTenant<Array<{ id: number }>>(
    db,
    `SELECT id FROM folios WHERE reservation_id = :reservationId LIMIT 1`,
    { reservationId }
  );
  const folioId = folioRows[0]?.id;

  if (folioId) {
    const updatedRes = await queryTenant<Array<{ rate_per_night: number; total_amount: number }>>(
      db,
      `SELECT rate_per_night, total_amount FROM reservations WHERE id = :id LIMIT 1`,
      { id: reservationId }
    );
    const rate = Number(updatedRes[0]?.rate_per_night ?? 0);
    const total = Number(updatedRes[0]?.total_amount ?? 0);
    const nights = calculateBookingNights(checkIn, checkOut);
    const userId = await getSystemUserId(db, propertyId);

    await executeTenant(
      db,
      `DELETE FROM folio_charges WHERE folio_id = :folioId AND category = 'room'`,
      { folioId }
    );
    await executeTenant(
      db,
      `INSERT INTO folio_charges (folio_id, description, category, amount, quantity, posted_by)
       VALUES (:folioId, 'Room charges (Modified)', 'room', :amount, :nights, :userId)`,
      { folioId, amount: rate, nights, userId }
    );

    await recalcFolioBalanceLocal(db, folioId);
  }

  return result;
}
