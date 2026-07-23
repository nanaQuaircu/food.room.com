import type { DbConfig } from '@/lib/db/central';
import { executeTenant, queryTenant } from '@/lib/db/tenant';
import { calculateBookingNights } from '@/lib/billing/stay-billing';
import { cancelReservationWithWaitlistNotify } from '@/lib/services/reservations-loop2';
import { createRefund } from '@/lib/services/billing-loop2';
import { UPSELL_RATES, type UpsellsInput } from '@/lib/guest/booking-pricing';
import {
  applyGuestCredits,
  awardGuestCredits,
  getPropertyBookingSettings,
  incrementPromoUsage,
  type PropertyBookingSettings,
} from '@/lib/guest/booking-settings';

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
    ),
  ]);
  const balance =
    Math.round(
      (Number(chargeRows[0]?.total ?? 0) -
        Number(paymentRows[0]?.total ?? 0) +
        Number(refundRows[0]?.total ?? 0)) *
        100
    ) / 100;
  await executeTenant(db, `UPDATE folios SET balance = :balance WHERE id = :folioId`, {
    folioId,
    balance,
  });
  return balance;
}

export async function finalizeWebsiteBookingCharges(
  db: DbConfig,
  propertyId: number,
  reservationId: number,
  input: {
    checkIn: string;
    checkOut: string;
    upsells?: UpsellsInput;
    quote: {
      upsells: { breakfast: number; late_checkout: number; spa: number; total: number };
      taxes: number;
      tax_rate: number;
      security_deposit: number;
      promo_discount: number;
      credits_applied: number;
      due_now: number;
      due_at_hotel: number;
      total_amount: number;
    };
    promo?: { id: number; code: string } | null;
    guestId?: number;
  }
) {
  const userId = await getSystemUserId(db, propertyId);
  const folioRows = await queryTenant<Array<{ id: number }>>(
    db,
    `SELECT id FROM folios WHERE reservation_id = :reservationId LIMIT 1`,
    { reservationId }
  );
  const folioId = folioRows[0]?.id;
  if (!folioId) throw new Error('Folio not found for reservation.');

  const nights = calculateBookingNights(input.checkIn, input.checkOut);
  const upsells = input.upsells || {};

  if (upsells.breakfast) {
    await executeTenant(
      db,
      `INSERT INTO folio_charges (folio_id, description, category, amount, quantity, posted_by)
       VALUES (:folioId, 'Breakfast Buffet Add-on', 'restaurant', :amount, :nights, :userId)`,
      { folioId, amount: UPSELL_RATES.breakfast_per_night, nights, userId }
    );
  }
  if (upsells.late_checkout) {
    await executeTenant(
      db,
      `INSERT INTO folio_charges (folio_id, description, category, amount, quantity, posted_by)
       VALUES (:folioId, 'Late Check-out Add-on', 'service', :amount, 1, :userId)`,
      { folioId, amount: UPSELL_RATES.late_checkout, userId }
    );
  }
  if (upsells.spa) {
    await executeTenant(
      db,
      `INSERT INTO folio_charges (folio_id, description, category, amount, quantity, posted_by)
       VALUES (:folioId, 'Spa Access Deposit', 'service', :amount, 1, :userId)`,
      { folioId, amount: UPSELL_RATES.spa, userId }
    );
  }

  if (input.quote.promo_discount > 0) {
    await executeTenant(
      db,
      `INSERT INTO folio_charges (folio_id, description, category, amount, quantity, posted_by)
       VALUES (:folioId, 'Promo discount', 'misc', :amount, 1, :userId)`,
      { folioId, amount: -input.quote.promo_discount, userId }
    );
  }

  if (input.quote.taxes > 0) {
    await executeTenant(
      db,
      `INSERT INTO folio_charges (folio_id, description, category, amount, quantity, posted_by)
       VALUES (:folioId, :desc, 'tax', :amount, 1, :userId)`,
      {
        folioId,
        desc: `Taxes & levies (${Math.round(input.quote.tax_rate * 100)}%)`,
        amount: input.quote.taxes,
        userId,
      }
    );
  }

  if (input.quote.security_deposit > 0) {
    await executeTenant(
      db,
      `INSERT INTO folio_charges (folio_id, description, category, amount, quantity, posted_by)
       VALUES (:folioId, 'Refundable security deposit (due at hotel)', 'misc', :amount, 1, :userId)`,
      { folioId, amount: input.quote.security_deposit, userId }
    );
  }

  if (input.quote.credits_applied > 0 && input.guestId) {
    await applyGuestCredits(db, input.guestId, input.quote.credits_applied);
    const { addPayment } = await import('@/lib/services/hotel-service');
    await addPayment(db, folioId, userId, {
      method: 'other',
      amount: input.quote.credits_applied,
      reference: 'LOYALTY',
    });
  }

  await executeTenant(
    db,
    `UPDATE reservations
     SET total_amount = :total,
         deposit_amount = 0,
         upsells = :upsells,
         promo_code = :promoCode,
         promo_discount = :promoDiscount
     WHERE id = :id`,
    {
      id: reservationId,
      total: input.quote.due_now,
      upsells: JSON.stringify(input.upsells || {}),
      promoCode: input.promo?.code || null,
      promoDiscount: input.quote.promo_discount,
    }
  );

  if (input.promo?.id) {
    await incrementPromoUsage(db, input.promo.id);
  }

  await recalcFolioBalance(db, folioId);

  // Earn 5% of stay charges paid now (exclude deposit)
  if (input.guestId) {
    const earn = Math.round(input.quote.due_now * 0.05 * 100) / 100;
    if (earn > 0) await awardGuestCredits(db, input.guestId, earn);
  }

  return {
    folioId,
    total_amount: input.quote.due_now,
    due_at_hotel: input.quote.due_at_hotel,
  };
}

function daysUntilCheckIn(checkIn: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(`${checkIn}T12:00:00`);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

export type CancellationPreview = {
  refundable: number;
  penalty: number;
  policy_label: string;
};

export function previewGuestCancellation(
  settings: PropertyBookingSettings,
  checkIn: string,
  amountPaid: number,
  totalAmount: number
): CancellationPreview {
  const daysLeft = daysUntilCheckIn(checkIn);
  if (daysLeft >= settings.cancellation_free_days) {
    return {
      refundable: amountPaid,
      penalty: 0,
      policy_label: `Free cancellation (${settings.cancellation_free_days}+ days before check-in)`,
    };
  }
  const penalty = Math.round(totalAmount * (settings.cancellation_penalty_pct / 100) * 100) / 100;
  const refundable = Math.max(0, Math.round((amountPaid - penalty) * 100) / 100);
  return {
    refundable,
    penalty: Math.min(penalty, amountPaid),
    policy_label: `${settings.cancellation_penalty_pct}% penalty within ${settings.cancellation_free_days} days of check-in`,
  };
}

export async function cancelReservationByGuest(
  db: DbConfig,
  propertyId: number,
  guestId: number,
  reservationId: number
) {
  const rows = await queryTenant<
    Array<{
      id: number;
      status: string;
      check_in_date: string;
      total_amount: number;
      confirmation_code: string;
    }>
  >(
    db,
    `SELECT id, status, check_in_date, total_amount, confirmation_code
     FROM reservations
     WHERE id = :id AND guest_id = :guestId AND property_id = :propertyId
     LIMIT 1`,
    { id: reservationId, guestId, propertyId }
  );
  const booking = rows[0];
  if (!booking) throw new Error('Reservation not found or unauthorized.');
  if (!['confirmed', 'pending'].includes(booking.status)) {
    throw new Error('This booking cannot be cancelled online.');
  }

  const settings = await getPropertyBookingSettings(db, propertyId);
  const folioRows = await queryTenant<Array<{ id: number }>>(
    db,
    `SELECT id FROM folios WHERE reservation_id = :reservationId LIMIT 1`,
    { reservationId }
  );
  const folioId = folioRows[0]?.id;

  let amountPaid = 0;
  if (folioId) {
    const paidRows = await queryTenant<Array<{ total: number }>>(
      db,
      `SELECT COALESCE(SUM(amount), 0) AS total FROM payments WHERE folio_id = :folioId`,
      { folioId }
    );
    amountPaid = Number(paidRows[0]?.total ?? 0);
  }

  const preview = previewGuestCancellation(
    settings,
    String(booking.check_in_date).slice(0, 10),
    amountPaid,
    Number(booking.total_amount)
  );

  await cancelReservationWithWaitlistNotify(db, propertyId, reservationId);

  if (folioId && preview.refundable > 0) {
    const userId = await getSystemUserId(db, propertyId);
    await createRefund(db, folioId, userId, {
      amount: preview.refundable,
      method: 'original',
      reason: `Guest cancellation — ${booking.confirmation_code}`,
      reference: `CANCEL-${booking.confirmation_code}`,
    });
  }

  return {
    confirmation_code: booking.confirmation_code,
    ...preview,
  };
}

export async function saveGuestContactInquiry(
  db: DbConfig,
  propertyId: number,
  input: { name: string; email: string; subject?: string; message: string }
) {
  await executeTenant(
    db,
    `INSERT INTO guest_contact_inquiries (property_id, name, email, subject, message)
     VALUES (:propertyId, :name, :email, :subject, :message)`,
    {
      propertyId,
      name: input.name,
      email: input.email,
      subject: input.subject || null,
      message: input.message,
    }
  );
}

export async function listGuestStayHistory(db: DbConfig, propertyId: number, guestId: number) {
  return queryTenant(
    db,
    `SELECT r.id, r.confirmation_code, r.status,
            DATE_FORMAT(r.check_in_date, '%Y-%m-%d') AS check_in_date,
            DATE_FORMAT(r.check_out_date, '%Y-%m-%d') AS check_out_date,
            r.total_amount, rt.name AS room_type_name, rm.room_number
     FROM reservations r
     LEFT JOIN room_types rt ON rt.id = r.room_type_id
     LEFT JOIN rooms rm ON rm.id = r.room_id
     WHERE r.property_id = :propertyId AND r.guest_id = :guestId
     ORDER BY r.check_in_date DESC
     LIMIT 50`,
    { propertyId, guestId }
  );
}

export async function getTapeChartData(
  db: DbConfig,
  propertyId: number,
  startDate: string,
  days: number = 14
) {
  const rooms = await queryTenant<
    Array<{ id: number; room_number: string; room_type_name: string; status: string }>
  >(
    db,
    `SELECT r.id, r.room_number, r.status, rt.name AS room_type_name
     FROM rooms r
     JOIN room_types rt ON rt.id = r.room_type_id
     WHERE r.property_id = :propertyId AND r.is_active = 1
     ORDER BY rt.name, r.room_number`,
    { propertyId }
  );

  const endDate = new Date(`${startDate}T12:00:00`);
  endDate.setDate(endDate.getDate() + days);
  const endIso = endDate.toISOString().slice(0, 10);

  const reservations = await queryTenant<
    Array<{
      id: number;
      room_id: number | null;
      confirmation_code: string;
      status: string;
      check_in_date: string;
      check_out_date: string;
      guest_name: string;
      room_type_name: string | null;
    }>
  >(
    db,
    `SELECT r.id, r.room_id, r.confirmation_code, r.status,
            DATE_FORMAT(r.check_in_date, '%Y-%m-%d') AS check_in_date,
            DATE_FORMAT(r.check_out_date, '%Y-%m-%d') AS check_out_date,
            CONCAT(g.first_name, ' ', g.last_name) AS guest_name,
            rt.name AS room_type_name
     FROM reservations r
     JOIN guests g ON g.id = r.guest_id
     LEFT JOIN room_types rt ON rt.id = r.room_type_id
     WHERE r.property_id = :propertyId
       AND r.status IN ('pending', 'confirmed', 'checked_in')
       AND r.check_in_date < :endDate
       AND r.check_out_date > :startDate
     ORDER BY r.check_in_date`,
    { propertyId, startDate, endDate: endIso }
  );

  const dateCols: string[] = [];
  const cursor = new Date(`${startDate}T12:00:00`);
  for (let i = 0; i < days; i++) {
    dateCols.push(cursor.toISOString().slice(0, 10));
    cursor.setDate(cursor.getDate() + 1);
  }

  return { rooms, reservations, dateCols, startDate, days };
}

export async function listAuditLogs(db: DbConfig, propertyId: number, limit = 100) {
  return queryTenant(
    db,
    `SELECT a.id, a.action, a.entity_type, a.entity_id, a.details, a.created_at,
            u.full_name AS user_name
     FROM audit_logs a
     INNER JOIN users u ON u.id = a.user_id AND u.property_id = :propertyId
     ORDER BY a.created_at DESC
     LIMIT :limit`,
    { propertyId, limit }
  );
}

export async function markReservationNoShow(db: DbConfig, propertyId: number, reservationId: number) {
  const rows = await queryTenant<
    Array<{ id: number; status: string; room_id: number | null; confirmation_code: string }>
  >(
    db,
    `SELECT id, status, room_id, confirmation_code FROM reservations
     WHERE id = :id AND property_id = :propertyId LIMIT 1`,
    { id: reservationId, propertyId }
  );
  const booking = rows[0];
  if (!booking) throw new Error('Reservation not found.');
  if (!['confirmed', 'pending'].includes(booking.status)) {
    throw new Error('Only confirmed or pending arrivals can be marked no-show.');
  }

  // Free the room inventory — no-shows no longer block those dates.
  await executeTenant(
    db,
    `UPDATE reservations
     SET status = 'no_show', room_id = NULL,
         notes = TRIM(CONCAT(COALESCE(notes, ''), CASE WHEN COALESCE(notes, '') = '' THEN '' ELSE '\n' END,
           'Marked no-show on ', DATE_FORMAT(NOW(), '%Y-%m-%d'),
           ' — dates released for resale.'))
     WHERE id = :id AND property_id = :propertyId`,
    { id: reservationId, propertyId }
  );

  // If a room was occupied for this stay, return it to vacant when safe.
  if (booking.room_id) {
    await executeTenant(
      db,
      `UPDATE rooms SET status = 'vacant'
       WHERE id = :roomId AND property_id = :propertyId AND status = 'occupied'`,
      { roomId: booking.room_id, propertyId }
    );
  }

  return { id: reservationId, confirmation_code: booking.confirmation_code, status: 'no_show' as const };
}
