import { executeTenant, queryTenant } from '@/lib/db/tenant';
import type { DbConfig } from '@/lib/db/central';
import {
  calculateBookingNights,
  calculateRoomTotal,
} from '@/lib/billing/stay-billing';
import { createRoleNotification } from '@/lib/services/in-app-notifications';
import { addPayment, allocateConfirmationCode } from '@/lib/services/hotel-service';

export async function listRatePlans(db: DbConfig, propertyId: number, roomTypeId?: number) {
  return queryTenant(
    db,
    `SELECT rp.*, rt.name AS room_type_name
     FROM rate_plans rp
     LEFT JOIN room_types rt ON rt.id = rp.room_type_id
     WHERE rp.property_id = :propertyId
       AND (:roomTypeId IS NULL OR rp.room_type_id = :roomTypeId OR rp.room_type_id IS NULL)
     ORDER BY rp.is_active DESC, rp.name`,
    { propertyId, roomTypeId: roomTypeId ?? null }
  );
}

export async function saveRatePlan(
  db: DbConfig,
  propertyId: number,
  input: {
    id?: number;
    name: string;
    code?: string;
    description?: string;
    room_type_id?: number | null;
    nightly_rate: number;
    is_active?: boolean;
  }
) {
  if (input.id) {
    await executeTenant(
      db,
      `UPDATE rate_plans
       SET name = :name, code = :code, description = :description,
           room_type_id = :roomTypeId, nightly_rate = :rate, is_active = :active
       WHERE id = :id AND property_id = :propertyId`,
      {
        id: input.id,
        propertyId,
        name: input.name,
        code: input.code || null,
        description: input.description || null,
        roomTypeId: input.room_type_id ?? null,
        rate: input.nightly_rate,
        active: input.is_active === false ? 0 : 1,
      }
    );
    return input.id;
  }
  const result = await executeTenant(
    db,
    `INSERT INTO rate_plans
      (property_id, room_type_id, name, code, description, nightly_rate, is_active)
     VALUES
      (:propertyId, :roomTypeId, :name, :code, :description, :rate, :active)`,
    {
      propertyId,
      roomTypeId: input.room_type_id ?? null,
      name: input.name,
      code: input.code || null,
      description: input.description || null,
      rate: input.nightly_rate,
      active: input.is_active === false ? 0 : 1,
    }
  );
  return Number((result as { insertId?: number }).insertId);
}

export async function getInventoryLimit(db: DbConfig, propertyId: number, roomTypeId: number) {
  const rooms = await queryTenant<Array<{ c: number }>>(
    db,
    `SELECT COUNT(*) AS c FROM rooms
     WHERE property_id = :propertyId AND room_type_id = :roomTypeId AND is_active = 1`,
    { propertyId, roomTypeId }
  );
  const inventory = Number(rooms[0]?.c ?? 0);

  const limits = await queryTenant<
    Array<{ overbook_percent: number; sell_limit_override: number | null; allow_overbook: number }>
  >(
    db,
    `SELECT overbook_percent, sell_limit_override, allow_overbook
     FROM room_type_inventory_limits
     WHERE property_id = :propertyId AND room_type_id = :roomTypeId
     LIMIT 1`,
    { propertyId, roomTypeId }
  );
  const limit = limits[0];
  const overbookPct = Number(limit?.overbook_percent ?? 0);
  const allowOverbook = Boolean(limit?.allow_overbook);
  const sellLimit =
    limit?.sell_limit_override != null
      ? Number(limit.sell_limit_override)
      : Math.floor(inventory * (1 + overbookPct / 100));

  return { inventory, sellLimit, allowOverbook, overbookPct };
}

export async function saveInventoryLimit(
  db: DbConfig,
  propertyId: number,
  input: {
    room_type_id: number;
    overbook_percent?: number;
    sell_limit_override?: number | null;
    allow_overbook?: boolean;
  }
) {
  await executeTenant(
    db,
    `INSERT INTO room_type_inventory_limits
      (property_id, room_type_id, overbook_percent, sell_limit_override, allow_overbook)
     VALUES (:propertyId, :roomTypeId, :overbook, :sellLimit, :allow)
     ON DUPLICATE KEY UPDATE
       overbook_percent = VALUES(overbook_percent),
       sell_limit_override = VALUES(sell_limit_override),
       allow_overbook = VALUES(allow_overbook)`,
    {
      propertyId,
      roomTypeId: input.room_type_id,
      overbook: input.overbook_percent ?? 0,
      sellLimit: input.sell_limit_override ?? null,
      allow: input.allow_overbook ? 1 : 0,
    }
  );
}

export async function countOverlappingBookings(
  db: DbConfig,
  propertyId: number,
  roomTypeId: number,
  checkIn: string,
  checkOut: string,
  excludeReservationId?: number
) {
  const rows = await queryTenant<Array<{ c: number }>>(
    db,
    `SELECT COUNT(*) AS c FROM reservations
     WHERE property_id = :propertyId
       AND room_type_id = :roomTypeId
       AND status IN ('pending', 'confirmed', 'checked_in')
       AND check_in_date < :checkOut
       AND check_out_date > :checkIn
       AND (:excludeId IS NULL OR id <> :excludeId)`,
    {
      propertyId,
      roomTypeId,
      checkIn,
      checkOut,
      excludeId: excludeReservationId ?? null,
    }
  );
  return Number(rows[0]?.c ?? 0);
}

export async function checkAvailability(
  db: DbConfig,
  propertyId: number,
  roomTypeId: number,
  checkIn: string,
  checkOut: string,
  options?: { excludeReservationId?: number; forceOverbook?: boolean; excludeSessionId?: string }
) {
  const booked = await countOverlappingBookings(
    db,
    propertyId,
    roomTypeId,
    checkIn,
    checkOut,
    options?.excludeReservationId
  );

  const holdRows = await queryTenant<Array<{ c: number }>>(
    db,
    `SELECT COUNT(*) AS c FROM room_holds
     WHERE property_id = :propertyId
       AND room_type_id = :roomTypeId
       AND expires_at > CURRENT_TIMESTAMP
       AND (:excludeSessionId IS NULL OR session_id <> :excludeSessionId)`,
    {
      propertyId,
      roomTypeId,
      excludeSessionId: options?.excludeSessionId ?? null,
    }
  );
  const activeHolds = Number(holdRows[0]?.c ?? 0);

  const limits = await getInventoryLimit(db, propertyId, roomTypeId);
  const totalOccupied = booked + activeHolds;
  const available = Math.max(0, limits.sellLimit - totalOccupied);
  const overCapacity = totalOccupied >= limits.sellLimit;

  if (overCapacity && !options?.forceOverbook) {
    return {
      ok: false as const,
      available,
      booked,
      activeHolds,
      ...limits,
      message: limits.allowOverbook
        ? 'No availability for these dates. Owner/manager can force overbook, or add to waitlist.'
        : 'No availability for these dates. Add guest to waitlist or choose other dates.',
    };
  }

  if (overCapacity && options?.forceOverbook && !limits.allowOverbook) {
    return {
      ok: false as const,
      available,
      booked,
      activeHolds,
      ...limits,
      message: 'Overbooking is disabled for this room type.',
    };
  }

  return { ok: true as const, available, booked, activeHolds, ...limits };
}

export async function createReservationAdvanced(
  db: DbConfig,
  propertyId: number,
  userId: number,
  input: {
    guest_id: number;
    check_in_date: string;
    check_out_date: string;
    room_type_id?: number;
    room_id?: number;
    rate_plan_id?: number;
    adults?: number;
    children?: number;
    rate_per_night?: number;
    deposit_amount?: number;
    deposit_method?: string;
    notes?: string;
    force_overbook?: boolean;
    source?: string;
    billing_type?: 'guest' | 'corporate';
    corporate_account_id?: number | null;
    exclude_hold_session_id?: string;
    status?: 'pending' | 'confirmed';
  }
) {
  const nights = calculateBookingNights(input.check_in_date, input.check_out_date);
  if (nights <= 0) throw new Error('Check-out date must be after check-in date.');

  let rate = input.rate_per_night ?? 0;
  let ratePlanId = input.rate_plan_id ?? null;

  if (ratePlanId) {
    const plans = await queryTenant<Array<{ nightly_rate: number; room_type_id: number | null }>>(
      db,
      `SELECT nightly_rate, room_type_id FROM rate_plans
       WHERE id = :id AND property_id = :propertyId AND is_active = 1 LIMIT 1`,
      { id: ratePlanId, propertyId }
    );
    if (!plans[0]) throw new Error('Rate plan not found.');
    rate = Number(plans[0].nightly_rate);
    if (!input.room_type_id && plans[0].room_type_id) {
      input.room_type_id = Number(plans[0].room_type_id);
    }
  } else if (!rate && input.room_type_id) {
    const rows = await queryTenant<Array<{ base_rate: number }>>(
      db,
      `SELECT base_rate FROM room_types WHERE id = :id`,
      { id: input.room_type_id }
    );
    rate = Number(rows[0]?.base_rate ?? 0);
  }

  if (input.room_type_id) {
    const avail = await checkAvailability(
      db,
      propertyId,
      input.room_type_id,
      input.check_in_date,
      input.check_out_date,
      {
        forceOverbook: input.force_overbook,
        excludeSessionId: input.exclude_hold_session_id,
      }
    );
    if (!avail.ok) throw new Error(avail.message);
  }

  const total = calculateRoomTotal(rate, nights);
  const deposit = Math.max(0, Number(input.deposit_amount ?? 0));
  const confirmation = await allocateConfirmationCode(db);

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

  const reservationStatus = input.status === 'pending' ? 'pending' : 'confirmed';

  const result = await executeTenant(
    db,
    `INSERT INTO reservations
       (property_id, guest_id, corporate_account_id, billing_type, confirmation_code, status,
        check_in_date, check_out_date, adults, children, room_type_id, rate_plan_id, room_id,
        rate_per_night, total_amount, deposit_amount, notes, source, created_by)
     VALUES
       (:propertyId, :guestId, :corporateAccountId, :billingType, :confirmation, :status,
        :checkIn, :checkOut, :adults, :children, :roomTypeId, :ratePlanId, :roomId,
        :rate, :total, :deposit, :notes, :source, :userId)`,
    {
      propertyId,
      guestId: input.guest_id,
      corporateAccountId,
      billingType,
      confirmation,
      status: reservationStatus,
      checkIn: input.check_in_date,
      checkOut: input.check_out_date,
      adults: input.adults ?? 1,
      children: input.children ?? 0,
      roomTypeId: input.room_type_id || null,
      ratePlanId,
      roomId: input.room_id || null,
      rate,
      total,
      deposit,
      notes: input.notes || null,
      source: input.source || 'direct',
      userId,
    }
  );

  const reservationId = Number((result as { insertId?: number }).insertId);
  await executeTenant(
    db,
    `INSERT INTO folios (reservation_id, status, balance) VALUES (:reservationId, 'open', :balance)`,
    { reservationId, balance: total }
  );

  const folioRows = await queryTenant<Array<{ id: number }>>(
    db,
    `SELECT id FROM folios WHERE reservation_id = :reservationId LIMIT 1`,
    { reservationId }
  );
  const folioId = folioRows[0]?.id;

  if (folioId && total > 0) {
    await executeTenant(
      db,
      `INSERT INTO folio_charges (folio_id, description, category, amount, quantity, posted_by)
       VALUES (:folioId, 'Room charges', 'room', :amount, :nights, :userId)`,
      { folioId, amount: rate, nights, userId }
    );
    await executeTenant(db, `UPDATE folios SET balance = :balance WHERE id = :folioId`, {
      folioId,
      balance: total,
    });
  }

  if (folioId && deposit > 0) {
    await addPayment(db, folioId, userId, {
      method: input.deposit_method || 'cash',
      amount: deposit,
      reference: `Deposit ${confirmation}`,
    });
  }

  await createRoleNotification(db, ['owner', 'admin', 'manager', 'front_desk'], {
    type: 'reservation',
    title: 'New reservation',
    body: `Booking ${confirmation} confirmed`,
    link: '/reservations',
  });

  return { id: reservationId, confirmation_code: confirmation, total_amount: total, deposit_amount: deposit };
}

export async function updateReservation(
  db: DbConfig,
  propertyId: number,
  id: number,
  input: {
    check_in_date?: string;
    check_out_date?: string;
    room_type_id?: number | null;
    rate_plan_id?: number | null;
    adults?: number;
    children?: number;
    rate_per_night?: number;
    notes?: string;
    force_overbook?: boolean;
  }
) {
  const rows = await queryTenant<
    Array<{
      status: string;
      check_in_date: string;
      check_out_date: string;
      room_type_id: number | null;
      rate_plan_id: number | null;
      rate_per_night: number;
      adults: number;
      children: number;
      notes: string | null;
    }>
  >(
    db,
    `SELECT status, check_in_date, check_out_date, room_type_id, rate_plan_id,
            rate_per_night, adults, children, notes
     FROM reservations WHERE id = :id AND property_id = :propertyId LIMIT 1`,
    { id, propertyId }
  );
  const current = rows[0];
  if (!current) throw new Error('Reservation not found.');
  if (['cancelled', 'checked_out', 'no_show'].includes(current.status)) {
    throw new Error('This reservation can no longer be modified.');
  }

  const checkIn = input.check_in_date || String(current.check_in_date).slice(0, 10);
  const checkOut = input.check_out_date || String(current.check_out_date).slice(0, 10);
  const roomTypeId =
    input.room_type_id !== undefined ? input.room_type_id : current.room_type_id;
  let ratePlanId =
    input.rate_plan_id !== undefined ? input.rate_plan_id : current.rate_plan_id;
  let rate = input.rate_per_night ?? Number(current.rate_per_night);

  if (input.rate_plan_id) {
    const plans = await queryTenant<Array<{ nightly_rate: number }>>(
      db,
      `SELECT nightly_rate FROM rate_plans WHERE id = :id AND property_id = :propertyId LIMIT 1`,
      { id: input.rate_plan_id, propertyId }
    );
    if (plans[0]) rate = Number(plans[0].nightly_rate);
  }

  const nights = calculateBookingNights(checkIn, checkOut);
  if (nights <= 0) throw new Error('Check-out date must be after check-in date.');

  if (roomTypeId) {
    const avail = await checkAvailability(db, propertyId, roomTypeId, checkIn, checkOut, {
      excludeReservationId: id,
      forceOverbook: input.force_overbook,
    });
    if (!avail.ok) throw new Error(avail.message);
  }

  const total = calculateRoomTotal(rate, nights);
  await executeTenant(
    db,
    `UPDATE reservations
     SET check_in_date = :checkIn, check_out_date = :checkOut,
         room_type_id = :roomTypeId, rate_plan_id = :ratePlanId,
         adults = :adults, children = :children,
         rate_per_night = :rate, total_amount = :total,
         notes = :notes
     WHERE id = :id AND property_id = :propertyId`,
    {
      id,
      propertyId,
      checkIn,
      checkOut,
      roomTypeId: roomTypeId || null,
      ratePlanId: ratePlanId || null,
      adults: input.adults ?? current.adults,
      children: input.children ?? current.children,
      rate,
      total,
      notes: input.notes !== undefined ? input.notes : current.notes,
    }
  );

  return { id, total_amount: total };
}

export async function cancelReservationWithWaitlistNotify(
  db: DbConfig,
  propertyId: number,
  id: number
) {
  const rows = await queryTenant<
    Array<{ room_type_id: number | null; check_in_date: string; check_out_date: string; confirmation_code: string }>
  >(
    db,
    `SELECT room_type_id, check_in_date, check_out_date, confirmation_code
     FROM reservations WHERE id = :id AND property_id = :propertyId LIMIT 1`,
    { id, propertyId }
  );
  await executeTenant(
    db,
    `UPDATE reservations SET status = 'cancelled' WHERE id = :id AND property_id = :propertyId`,
    { id, propertyId }
  );

  const cancelled = rows[0];
  if (cancelled?.room_type_id) {
    const waiting = await queryTenant<Array<{ id: number }>>(
      db,
      `SELECT id FROM waitlist_entries
       WHERE property_id = :propertyId
         AND status = 'waiting'
         AND (room_type_id IS NULL OR room_type_id = :roomTypeId)
         AND check_in_date < :checkOut
         AND check_out_date > :checkIn
       ORDER BY priority ASC, created_at ASC
       LIMIT 5`,
      {
        propertyId,
        roomTypeId: cancelled.room_type_id,
        checkIn: String(cancelled.check_in_date).slice(0, 10),
        checkOut: String(cancelled.check_out_date).slice(0, 10),
      }
    );
    if (waiting.length) {
      await createRoleNotification(db, ['owner', 'admin', 'manager', 'front_desk'], {
        type: 'waitlist',
        title: 'Inventory freed for waitlist',
        body: `Cancellation of ${cancelled.confirmation_code} may free dates for ${waiting.length} waitlist guest(s)`,
        link: '/reservations',
      });
    }
  }
}

export async function listWaitlist(db: DbConfig, propertyId: number) {
  return queryTenant(
    db,
    `SELECT w.*, g.first_name, g.last_name, g.email, g.phone, rt.name AS room_type_name
     FROM waitlist_entries w
     JOIN guests g ON g.id = w.guest_id
     LEFT JOIN room_types rt ON rt.id = w.room_type_id
     WHERE w.property_id = :propertyId
     ORDER BY FIELD(w.status, 'waiting', 'offered', 'booked', 'cancelled', 'expired'),
              w.priority ASC, w.created_at ASC`,
    { propertyId }
  );
}

export async function addWaitlistEntry(
  db: DbConfig,
  propertyId: number,
  userId: number,
  input: {
    guest_id: number;
    check_in_date: string;
    check_out_date: string;
    room_type_id?: number;
    adults?: number;
    children?: number;
    notes?: string;
    priority?: number;
  }
) {
  const result = await executeTenant(
    db,
    `INSERT INTO waitlist_entries
      (property_id, guest_id, room_type_id, check_in_date, check_out_date,
       adults, children, notes, priority, created_by)
     VALUES
      (:propertyId, :guestId, :roomTypeId, :checkIn, :checkOut,
       :adults, :children, :notes, :priority, :userId)`,
    {
      propertyId,
      guestId: input.guest_id,
      roomTypeId: input.room_type_id || null,
      checkIn: input.check_in_date,
      checkOut: input.check_out_date,
      adults: input.adults ?? 1,
      children: input.children ?? 0,
      notes: input.notes || null,
      priority: input.priority ?? 5,
      userId,
    }
  );
  return Number((result as { insertId?: number }).insertId);
}

export async function promoteWaitlistEntry(
  db: DbConfig,
  propertyId: number,
  userId: number,
  waitlistId: number,
  options?: { force_overbook?: boolean; rate_plan_id?: number }
) {
  const rows = await queryTenant<
    Array<{
      guest_id: number;
      room_type_id: number | null;
      check_in_date: string;
      check_out_date: string;
      adults: number;
      children: number;
      notes: string | null;
      status: string;
    }>
  >(
    db,
    `SELECT guest_id, room_type_id, check_in_date, check_out_date, adults, children, notes, status
     FROM waitlist_entries WHERE id = :id AND property_id = :propertyId LIMIT 1`,
    { id: waitlistId, propertyId }
  );
  const entry = rows[0];
  if (!entry) throw new Error('Waitlist entry not found.');
  if (entry.status !== 'waiting' && entry.status !== 'offered') {
    throw new Error('Waitlist entry is not available to promote.');
  }

  const booking = await createReservationAdvanced(db, propertyId, userId, {
    guest_id: entry.guest_id,
    check_in_date: String(entry.check_in_date).slice(0, 10),
    check_out_date: String(entry.check_out_date).slice(0, 10),
    room_type_id: entry.room_type_id || undefined,
    adults: entry.adults,
    children: entry.children,
    notes: entry.notes || undefined,
    rate_plan_id: options?.rate_plan_id,
    force_overbook: options?.force_overbook,
  });

  await executeTenant(
    db,
    `UPDATE waitlist_entries
     SET status = 'booked', promoted_reservation_id = :reservationId
     WHERE id = :id`,
    { id: waitlistId, reservationId: booking.id }
  );

  return booking;
}

export async function cancelWaitlistEntry(db: DbConfig, propertyId: number, id: number) {
  await executeTenant(
    db,
    `UPDATE waitlist_entries SET status = 'cancelled'
     WHERE id = :id AND property_id = :propertyId`,
    { id, propertyId }
  );
}
