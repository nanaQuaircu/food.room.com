import type { DbConfig } from '@/lib/db/central';
import { executeTenant, queryTenant } from '@/lib/db/tenant';
import { addPayment } from '@/lib/services/hotel-service';

export type CorporateAccount = {
  id: number;
  property_id: number;
  name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  credit_limit: number;
  notes: string | null;
  is_active: number;
  created_at: string;
};

export type DebtorLedgerRow = {
  reservation_id: number;
  confirmation_code: string;
  reservation_status: string;
  check_in_date: string;
  check_out_date: string;
  folio_id: number;
  folio_status: string;
  first_name: string;
  last_name: string;
  corporate_account_id: number | null;
  company_name: string | null;
  owed: number;
  paid: number;
  balance: number;
  status: 'Outstanding' | 'Partial' | 'Paid';
};

export type DebtorPaymentRow = {
  id: number;
  folio_id: number;
  method: string;
  amount: number;
  reference: string | null;
  paid_at: string;
  confirmation_code: string;
  first_name: string;
  last_name: string;
  company_name: string | null;
};

export type CompanySummaryRow = {
  id: number;
  name: string;
  bookings: number;
  owed: number;
  paid: number;
  balance: number;
};

function debtorStatus(owed: number, paid: number): 'Outstanding' | 'Partial' | 'Paid' {
  const balance = Math.round((owed - paid) * 100) / 100;
  if (balance <= 0) return 'Paid';
  if (paid > 0) return 'Partial';
  return 'Outstanding';
}

export async function listCorporateAccounts(db: DbConfig, propertyId: number) {
  return queryTenant<CorporateAccount[]>(
    db,
    `SELECT id, property_id, name, contact_name, email, phone, credit_limit, notes, is_active, created_at
     FROM corporate_accounts
     WHERE property_id = :propertyId
     ORDER BY name`,
    { propertyId }
  );
}

export async function createCorporateAccount(
  db: DbConfig,
  propertyId: number,
  input: {
    name: string;
    contact_name?: string;
    email?: string;
    phone?: string;
    credit_limit?: number;
    notes?: string;
  }
) {
  if (!input.name || !input.name.trim()) {
    throw new Error('Company name is required.');
  }
  const result = await executeTenant(
    db,
    `INSERT INTO corporate_accounts (property_id, name, contact_name, email, phone, credit_limit, notes, is_active)
     VALUES (:propertyId, :name, :contactName, :email, :phone, :creditLimit, :notes, 1)`,
    {
      propertyId,
      name: input.name.trim(),
      contactName: input.contact_name || null,
      email: input.email || null,
      phone: input.phone || null,
      creditLimit: input.credit_limit ?? 0,
      notes: input.notes || null,
    }
  );
  return Number((result as { insertId?: number }).insertId);
}

export async function updateCorporateAccount(
  db: DbConfig,
  propertyId: number,
  id: number,
  input: {
    name?: string;
    contact_name?: string | null;
    email?: string | null;
    phone?: string | null;
    credit_limit?: number;
    notes?: string | null;
    is_active?: boolean;
  }
) {
  const fields: string[] = [];
  const params: Record<string, string | number | null> = { id, propertyId };

  if (input.name !== undefined) {
    fields.push('name = :name');
    params.name = input.name.trim();
  }
  if (input.contact_name !== undefined) {
    fields.push('contact_name = :contactName');
    params.contactName = input.contact_name || null;
  }
  if (input.email !== undefined) {
    fields.push('email = :email');
    params.email = input.email || null;
  }
  if (input.phone !== undefined) {
    fields.push('phone = :phone');
    params.phone = input.phone || null;
  }
  if (input.credit_limit !== undefined) {
    fields.push('credit_limit = :creditLimit');
    params.creditLimit = input.credit_limit;
  }
  if (input.notes !== undefined) {
    fields.push('notes = :notes');
    params.notes = input.notes || null;
  }
  if (input.is_active !== undefined) {
    fields.push('is_active = :isActive');
    params.isActive = input.is_active ? 1 : 0;
  }

  if (fields.length === 0) return;

  await executeTenant(
    db,
    `UPDATE corporate_accounts SET ${fields.join(', ')} WHERE id = :id AND property_id = :propertyId`,
    params
  );
}

export async function listDebtorsMasterLedger(
  db: DbConfig,
  propertyId: number,
  filters?: { corporate_account_id?: number; status?: string }
): Promise<DebtorLedgerRow[]> {
  const rows = await queryTenant<
    Array<{
      reservation_id: number;
      confirmation_code: string;
      reservation_status: string;
      check_in_date: string;
      check_out_date: string;
      folio_id: number;
      folio_status: string;
      first_name: string;
      last_name: string;
      corporate_account_id: number | null;
      company_name: string | null;
      owed: number | string | null;
      paid: number | string | null;
    }>
  >(
    db,
    `SELECT r.id AS reservation_id, r.confirmation_code, r.status AS reservation_status,
            r.check_in_date, r.check_out_date,
            f.id AS folio_id, f.status AS folio_status,
            g.first_name, g.last_name,
            ca.id AS corporate_account_id, ca.name AS company_name,
            COALESCE(charges.total, 0) AS owed,
            COALESCE(pays.total, 0) AS paid
     FROM reservations r
     JOIN folios f ON f.reservation_id = r.id
     JOIN guests g ON g.id = r.guest_id
     LEFT JOIN corporate_accounts ca ON ca.id = r.corporate_account_id
     LEFT JOIN (
       SELECT folio_id, SUM(amount * quantity) AS total FROM folio_charges GROUP BY folio_id
     ) charges ON charges.folio_id = f.id
     LEFT JOIN (
       SELECT folio_id, SUM(amount) AS total FROM payments GROUP BY folio_id
     ) pays ON pays.folio_id = f.id
     WHERE r.property_id = :propertyId AND r.billing_type = 'corporate'
       ${filters?.corporate_account_id ? 'AND r.corporate_account_id = :corporateAccountId' : ''}
     ORDER BY r.check_in_date DESC, r.id DESC`,
    {
      propertyId,
      ...(filters?.corporate_account_id ? { corporateAccountId: filters.corporate_account_id } : {}),
    }
  );

  const mapped: DebtorLedgerRow[] = rows.map((row) => {
    const owed = Number(row.owed ?? 0);
    const paid = Number(row.paid ?? 0);
    const balance = Math.round((owed - paid) * 100) / 100;
    return {
      reservation_id: row.reservation_id,
      confirmation_code: row.confirmation_code,
      reservation_status: row.reservation_status,
      check_in_date: row.check_in_date,
      check_out_date: row.check_out_date,
      folio_id: row.folio_id,
      folio_status: row.folio_status,
      first_name: row.first_name,
      last_name: row.last_name,
      corporate_account_id: row.corporate_account_id,
      company_name: row.company_name,
      owed,
      paid,
      balance,
      status: debtorStatus(owed, paid),
    };
  });

  if (filters?.status) {
    return mapped.filter((row) => row.status === filters.status);
  }
  return mapped;
}

export async function listPaymentLog(db: DbConfig, propertyId: number): Promise<DebtorPaymentRow[]> {
  return queryTenant<DebtorPaymentRow[]>(
    db,
    `SELECT p.id, p.folio_id, p.method, p.amount, p.reference, p.paid_at,
            r.confirmation_code, g.first_name, g.last_name, ca.name AS company_name
     FROM payments p
     JOIN folios f ON f.id = p.folio_id
     JOIN reservations r ON r.id = f.reservation_id
     JOIN guests g ON g.id = r.guest_id
     LEFT JOIN corporate_accounts ca ON ca.id = r.corporate_account_id
     WHERE r.property_id = :propertyId AND r.billing_type = 'corporate'
     ORDER BY p.paid_at DESC
     LIMIT 300`,
    { propertyId }
  );
}

export async function companySummary(db: DbConfig, propertyId: number): Promise<CompanySummaryRow[]> {
  const rows = await queryTenant<
    Array<{ id: number; name: string; bookings: number | string; owed: number | string | null; paid: number | string | null }>
  >(
    db,
    `SELECT ca.id, ca.name,
            COUNT(DISTINCT r.id) AS bookings,
            COALESCE(SUM(charges.total), 0) AS owed,
            COALESCE(SUM(pays.total), 0) AS paid
     FROM corporate_accounts ca
     LEFT JOIN reservations r
       ON r.corporate_account_id = ca.id AND r.billing_type = 'corporate' AND r.property_id = ca.property_id
     LEFT JOIN folios f ON f.reservation_id = r.id
     LEFT JOIN (
       SELECT folio_id, SUM(amount * quantity) AS total FROM folio_charges GROUP BY folio_id
     ) charges ON charges.folio_id = f.id
     LEFT JOIN (
       SELECT folio_id, SUM(amount) AS total FROM payments GROUP BY folio_id
     ) pays ON pays.folio_id = f.id
     WHERE ca.property_id = :propertyId
     GROUP BY ca.id, ca.name
     ORDER BY ca.name`,
    { propertyId }
  );

  return rows.map((row) => {
    const owed = Number(row.owed ?? 0);
    const paid = Number(row.paid ?? 0);
    return {
      id: row.id,
      name: row.name,
      bookings: Number(row.bookings ?? 0),
      owed,
      paid,
      balance: Math.round((owed - paid) * 100) / 100,
    };
  });
}

export async function postDebtorPayment(
  db: DbConfig,
  propertyId: number,
  folioId: number,
  userId: number,
  input: { method: string; amount: number; reference?: string }
) {
  const rows = await queryTenant<Array<{ id: number }>>(
    db,
    `SELECT f.id
     FROM folios f
     JOIN reservations r ON r.id = f.reservation_id
     WHERE f.id = :folioId AND r.property_id = :propertyId AND r.billing_type = 'corporate'`,
    { folioId, propertyId }
  );
  if (rows.length === 0) {
    throw new Error('Folio not found on a corporate-billed reservation.');
  }
  return addPayment(db, folioId, userId, input);
}

export async function assignReservationToCorporate(
  db: DbConfig,
  propertyId: number,
  reservationId: number,
  corporateAccountId: number
) {
  const accounts = await queryTenant<Array<{ id: number }>>(
    db,
    `SELECT id FROM corporate_accounts WHERE id = :corporateAccountId AND property_id = :propertyId`,
    { corporateAccountId, propertyId }
  );
  if (accounts.length === 0) {
    throw new Error('Corporate account not found.');
  }

  await executeTenant(
    db,
    `UPDATE reservations
     SET corporate_account_id = :corporateAccountId, billing_type = 'corporate'
     WHERE id = :reservationId AND property_id = :propertyId`,
    { reservationId, propertyId, corporateAccountId }
  );
}

export type DebtorImportRow = {
  booking_ref: string;
  guest_name: string;
  company: string;
  check_in?: string | number | Date | null;
  check_out?: string | number | Date | null;
  nights?: number;
  rate?: number;
  total_owed: number;
  total_paid?: number;
  room?: string;
  notes?: string;
};

function parseImportDate(value: unknown): string | null {
  if (value == null || value === '' || value === '—') return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    // Excel serial date
    const utc = Math.round((value - 25569) * 86400 * 1000);
    return new Date(utc).toISOString().slice(0, 10);
  }
  const raw = String(value).trim();
  // DD/MM/YY or DD/MM/YYYY
  const m = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m) {
    const day = Number(m[1]);
    const month = Number(m[2]);
    let year = Number(m[3]);
    if (year < 100) year += 2000;
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  return null;
}

function splitGuestName(fullName: string): { first: string; last: string } {
  const parts = fullName.trim().replace(/\s+/g, ' ').split(' ');
  if (parts.length === 1) return { first: parts[0], last: 'Guest' };
  return { first: parts[0], last: parts.slice(1).join(' ') };
}

async function findOrCreateCorporateByName(db: DbConfig, propertyId: number, name: string) {
  const trimmed = name.trim() || 'Individual';
  const existing = await queryTenant<Array<{ id: number }>>(
    db,
    `SELECT id FROM corporate_accounts
     WHERE property_id = :propertyId AND name = :name LIMIT 1`,
    { propertyId, name: trimmed }
  );
  if (existing[0]) return existing[0].id;
  return createCorporateAccount(db, propertyId, {
    name: trimmed,
    notes: 'Created from debtors ledger import',
  });
}

async function findOrCreateGuestByName(db: DbConfig, first: string, last: string) {
  const existing = await queryTenant<Array<{ id: number }>>(
    db,
    `SELECT id FROM guests
     WHERE first_name = :first AND last_name = :last
     ORDER BY id ASC LIMIT 1`,
    { first, last }
  );
  if (existing[0]) return existing[0].id;

  const result = await executeTenant(
    db,
    `INSERT INTO guests (first_name, last_name, email, phone, nationality, is_vip, notes)
     VALUES (:first, :last, NULL, NULL, NULL, 0, 'Imported from debtors ledger')`,
    { first, last }
  );
  return Number((result as { insertId?: number }).insertId);
}

/**
 * Import MASTER LEDGER-style rows (from Excel export).
 * Creates corporate accounts, guests, checked-out reservations, folio charges, and payments.
 * Skips rows whose booking_ref already exists as confirmation_code.
 */
export async function importDebtorLedgerRows(
  db: DbConfig,
  propertyId: number,
  userId: number,
  rows: DebtorImportRow[]
): Promise<{ imported: number; skipped: number; errors: string[] }> {
  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const [index, row] of rows.entries()) {
    const bookingRef = String(row.booking_ref || '').trim().toUpperCase();
    const guestName = String(row.guest_name || '').trim();
    const company = String(row.company || '').trim();
    const totalOwed = Number(row.total_owed);
    const totalPaid = Math.max(0, Number(row.total_paid ?? 0));

    if (!bookingRef || !guestName || !company || !Number.isFinite(totalOwed) || totalOwed <= 0) {
      errors.push(`Row ${index + 1}: missing booking ref, guest, company, or total owed.`);
      skipped += 1;
      continue;
    }

    try {
      const existing = await queryTenant<Array<{ id: number }>>(
        db,
        `SELECT id FROM reservations
         WHERE property_id = :propertyId AND confirmation_code = :code LIMIT 1`,
        { propertyId, code: bookingRef }
      );
      if (existing[0]) {
        skipped += 1;
        continue;
      }

      const corporateAccountId = await findOrCreateCorporateByName(db, propertyId, company);
      const { first, last } = splitGuestName(guestName);
      const guestId = await findOrCreateGuestByName(db, first, last);

      let checkIn = parseImportDate(row.check_in);
      let checkOut = parseImportDate(row.check_out);
      const nights = Math.max(1, Math.floor(Number(row.nights) || 1));
      if (!checkIn) checkIn = new Date().toISOString().slice(0, 10);
      if (!checkOut) {
        const d = new Date(`${checkIn}T12:00:00Z`);
        d.setUTCDate(d.getUTCDate() + nights);
        checkOut = d.toISOString().slice(0, 10);
      }

      const rate = Number(row.rate);
      const ratePerNight =
        Number.isFinite(rate) && rate > 0 ? rate : Math.round((totalOwed / nights) * 100) / 100;

      let roomId: number | null = null;
      const roomNumber = String(row.room || '').trim();
      if (roomNumber) {
        const rooms = await queryTenant<Array<{ id: number }>>(
          db,
          `SELECT id FROM rooms
           WHERE property_id = :propertyId AND room_number = :roomNumber LIMIT 1`,
          { propertyId, roomNumber }
        );
        roomId = rooms[0]?.id ?? null;
      }

      const noteParts = [
        row.notes ? String(row.notes) : '',
        roomNumber && !roomId ? `Excel room ${roomNumber}` : '',
        'Imported from debtors ledger',
      ].filter(Boolean);

      const result = await executeTenant(
        db,
        `INSERT INTO reservations
           (property_id, guest_id, corporate_account_id, billing_type, confirmation_code, status,
            check_in_date, check_out_date, adults, room_id, rate_per_night, total_amount,
            notes, source, created_by)
         VALUES
           (:propertyId, :guestId, :corporateAccountId, 'corporate', :code, 'checked_out',
            :checkIn, :checkOut, 1, :roomId, :rate, :total, :notes, 'debtors_import', :userId)`,
        {
          propertyId,
          guestId,
          corporateAccountId,
          code: bookingRef,
          checkIn,
          checkOut,
          roomId,
          rate: ratePerNight,
          total: totalOwed,
          notes: noteParts.join(' · ') || null,
          userId,
        }
      );

      const reservationId = Number((result as { insertId?: number }).insertId);
      const balance = Math.round((totalOwed - totalPaid) * 100) / 100;

      await executeTenant(
        db,
        `INSERT INTO folios (reservation_id, status, balance)
         VALUES (:reservationId, 'open', :balance)`,
        { reservationId, balance: Math.max(0, balance) }
      );

      const folioRows = await queryTenant<Array<{ id: number }>>(
        db,
        `SELECT id FROM folios WHERE reservation_id = :reservationId LIMIT 1`,
        { reservationId }
      );
      const folioId = folioRows[0]?.id;
      if (!folioId) throw new Error('Folio not created');

      await executeTenant(
        db,
        `INSERT INTO folio_charges (folio_id, description, category, amount, quantity, posted_by)
         VALUES (:folioId, :description, 'room', :amount, 1, :userId)`,
        {
          folioId,
          description: `Imported stay ${bookingRef}`,
          amount: totalOwed,
          userId,
        }
      );

      if (totalPaid > 0) {
        await addPayment(db, folioId, userId, {
          method: 'bank_transfer',
          amount: totalPaid,
          reference: `Import ${bookingRef}`,
        });
      }

      imported += 1;
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Import failed';
      errors.push(`Row ${index + 1} (${bookingRef}): ${message}`);
      skipped += 1;
    }
  }

  return { imported, skipped, errors };
}
