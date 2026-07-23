import { executeTenant, queryTenant } from '@/lib/db/tenant';
import type { DbConfig } from '@/lib/db/central';
import { formatLocalDateIso } from '@/lib/billing/stay-billing';
import { createRoleNotification } from '@/lib/services/in-app-notifications';

const TAXABLE_CATEGORIES = new Set([
  'room',
  'service',
  'minibar',
  'restaurant',
  'food',
  'beverage',
  'laundry',
  'misc',
  'other',
]);

export async function listTaxRates(db: DbConfig, propertyId: number) {
  return queryTenant<
    Array<{
      id: number;
      name: string;
      rate_percent: number;
      applies_to: string;
      is_inclusive: number;
      is_active: number;
    }>
  >(
    db,
    `SELECT id, name, rate_percent, applies_to, is_inclusive, is_active
     FROM tax_rates WHERE property_id = :propertyId ORDER BY name`,
    { propertyId }
  );
}

export async function saveTaxRate(
  db: DbConfig,
  propertyId: number,
  input: {
    id?: number;
    name: string;
    rate_percent: number;
    applies_to?: string;
    is_inclusive?: boolean;
    is_active?: boolean;
  }
) {
  if (input.id) {
    await executeTenant(
      db,
      `UPDATE tax_rates
       SET name = :name, rate_percent = :rate, applies_to = :appliesTo,
           is_inclusive = :inclusive, is_active = :active
       WHERE id = :id AND property_id = :propertyId`,
      {
        id: input.id,
        propertyId,
        name: input.name,
        rate: input.rate_percent,
        appliesTo: input.applies_to || 'all',
        inclusive: input.is_inclusive ? 1 : 0,
        active: input.is_active === false ? 0 : 1,
      }
    );
    return input.id;
  }

  const result = await executeTenant(
    db,
    `INSERT INTO tax_rates (property_id, name, rate_percent, applies_to, is_inclusive, is_active)
     VALUES (:propertyId, :name, :rate, :appliesTo, :inclusive, :active)`,
    {
      propertyId,
      name: input.name,
      rate: input.rate_percent,
      appliesTo: input.applies_to || 'all',
      inclusive: input.is_inclusive ? 1 : 0,
      active: input.is_active === false ? 0 : 1,
    }
  );
  return Number((result as { insertId?: number }).insertId);
}

export async function deleteTaxRate(db: DbConfig, propertyId: number, id: number) {
  await executeTenant(db, `DELETE FROM tax_rates WHERE id = :id AND property_id = :propertyId`, {
    id,
    propertyId,
  });
}

export async function computeTaxForCharge(
  db: DbConfig,
  propertyId: number,
  category: string,
  lineTotal: number
) {
  if (!TAXABLE_CATEGORIES.has(category) || category === 'tax' || lineTotal <= 0) {
    return [] as Array<{ name: string; amount: number }>;
  }

  const rates = await queryTenant<
    Array<{ name: string; rate_percent: number; applies_to: string; is_inclusive: number }>
  >(
    db,
    `SELECT name, rate_percent, applies_to, is_inclusive
     FROM tax_rates
     WHERE property_id = :propertyId AND is_active = 1`,
    { propertyId }
  );

  const taxes: Array<{ name: string; amount: number }> = [];
  for (const rate of rates) {
    const applies =
      rate.applies_to === 'all' ||
      rate.applies_to === category ||
      (rate.applies_to === 'room' && category === 'room') ||
      (rate.applies_to === 'service' && category !== 'room' && category !== 'tax');
    if (!applies) continue;

    const pct = Number(rate.rate_percent) / 100;
    let amount = 0;
    if (rate.is_inclusive) {
      amount = Math.round(((lineTotal - lineTotal / (1 + pct)) || 0) * 100) / 100;
    } else {
      amount = Math.round(lineTotal * pct * 100) / 100;
    }
    if (amount > 0) taxes.push({ name: rate.name, amount });
  }
  return taxes;
}

export async function recalcFolioBalanceWithRefunds(db: DbConfig, folioId: number) {
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

export async function addFolioChargeWithTax(
  db: DbConfig,
  propertyId: number,
  folioId: number,
  userId: number,
  input: { description: string; category: string; amount: number; quantity?: number; skipTax?: boolean }
) {
  const quantity = input.quantity ?? 1;
  await executeTenant(
    db,
    `INSERT INTO folio_charges (folio_id, description, category, amount, quantity, posted_by)
     VALUES (:folioId, :description, :category, :amount, :quantity, :userId)`,
    {
      folioId,
      description: input.description,
      category: input.category,
      amount: input.amount,
      quantity,
      userId,
    }
  );

  if (!input.skipTax && input.category !== 'tax') {
    const lineTotal = Number(input.amount) * quantity;
    const taxes = await computeTaxForCharge(db, propertyId, input.category, lineTotal);
    for (const tax of taxes) {
      await executeTenant(
        db,
        `INSERT INTO folio_charges (folio_id, description, category, amount, quantity, posted_by)
         VALUES (:folioId, :description, 'tax', :amount, 1, :userId)`,
        {
          folioId,
          description: `${tax.name} on ${input.description}`,
          amount: tax.amount,
          userId,
        }
      );
    }
  }

  return recalcFolioBalanceWithRefunds(db, folioId);
}

export async function createRefund(
  db: DbConfig,
  folioId: number,
  userId: number,
  input: {
    amount: number;
    method: string;
    reason?: string;
    payment_id?: number;
    reference?: string;
  }
) {
  if (input.amount <= 0) throw new Error('Refund amount must be positive.');

  if (input.payment_id) {
    const payments = await queryTenant<Array<{ amount: number }>>(
      db,
      `SELECT amount FROM payments WHERE id = :id AND folio_id = :folioId`,
      { id: input.payment_id, folioId }
    );
    const payment = payments[0];
    if (!payment) throw new Error('Payment not found on this folio.');

    const prior = await queryTenant<Array<{ total: number }>>(
      db,
      `SELECT COALESCE(SUM(amount), 0) AS total FROM refunds WHERE payment_id = :paymentId`,
      { paymentId: input.payment_id }
    );
    const already = Number(prior[0]?.total ?? 0);
    if (already + input.amount > Number(payment.amount) + 0.001) {
      throw new Error('Refund exceeds remaining payment amount.');
    }
  }

  await executeTenant(
    db,
    `INSERT INTO refunds (folio_id, payment_id, amount, method, reason, reference, processed_by)
     VALUES (:folioId, :paymentId, :amount, :method, :reason, :reference, :userId)`,
    {
      folioId,
      paymentId: input.payment_id ?? null,
      amount: input.amount,
      method: input.method,
      reason: input.reason || null,
      reference: input.reference || null,
      userId,
    }
  );

  const balance = await recalcFolioBalanceWithRefunds(db, folioId);
  await createRoleNotification(db, ['owner', 'admin', 'finance', 'manager'], {
    type: 'refund',
    title: 'Refund processed',
    body: `Refund of ${input.amount.toFixed(2)} posted to folio #${folioId}`,
    link: '/billing',
  });
  return balance;
}

export async function listRefunds(db: DbConfig, folioId: number) {
  return queryTenant(
    db,
    `SELECT * FROM refunds WHERE folio_id = :folioId ORDER BY processed_at DESC`,
    { folioId }
  );
}

export async function generateInvoice(
  db: DbConfig,
  propertyId: number,
  folioId: number,
  userId: number
) {
  const folios = await queryTenant<Array<{ id: number; status: string }>>(
    db,
    `SELECT f.id, f.status FROM folios f
     JOIN reservations r ON r.id = f.reservation_id
     WHERE f.id = :folioId AND r.property_id = :propertyId`,
    { folioId, propertyId }
  );
  if (!folios[0]) throw new Error('Folio not found.');

  const charges = await queryTenant<
    Array<{ description: string; category: string; amount: number; quantity: number }>
  >(db, `SELECT description, category, amount, quantity FROM folio_charges WHERE folio_id = :folioId`, {
    folioId,
  });
  const payments = await queryTenant<Array<{ amount: number }>>(
    db,
    `SELECT amount FROM payments WHERE folio_id = :folioId`,
    { folioId }
  );
  const refunds = await queryTenant<Array<{ amount: number }>>(
    db,
    `SELECT amount FROM refunds WHERE folio_id = :folioId`,
    { folioId }
  );

  let subtotal = 0;
  let taxTotal = 0;
  for (const c of charges) {
    const line = Number(c.amount) * Number(c.quantity);
    if (c.category === 'tax') taxTotal += line;
    else subtotal += line;
  }
  const paidTotal =
    payments.reduce((s, p) => s + Number(p.amount), 0) -
    refunds.reduce((s, r) => s + Number(r.amount), 0);
  const total = Math.round((subtotal + taxTotal) * 100) / 100;

  const seqRows = await queryTenant<Array<{ c: number }>>(
    db,
    `SELECT COUNT(*) + 1 AS c FROM invoices WHERE property_id = :propertyId`,
    { propertyId }
  );
  const seq = Number(seqRows[0]?.c ?? 1);
  const invoiceNumber = `INV-${formatLocalDateIso().replace(/-/g, '')}-${String(seq).padStart(4, '0')}`;

  const result = await executeTenant(
    db,
    `INSERT INTO invoices
      (property_id, folio_id, invoice_number, status, subtotal, tax_total, total, paid_total, issued_by)
     VALUES
      (:propertyId, :folioId, :invoiceNumber, 'issued', :subtotal, :taxTotal, :total, :paidTotal, :userId)`,
    {
      propertyId,
      folioId,
      invoiceNumber,
      subtotal: Math.round(subtotal * 100) / 100,
      taxTotal: Math.round(taxTotal * 100) / 100,
      total,
      paidTotal: Math.round(paidTotal * 100) / 100,
      userId,
    }
  );
  const invoiceId = Number((result as { insertId?: number }).insertId);

  for (const c of charges) {
    const lineTotal = Math.round(Number(c.amount) * Number(c.quantity) * 100) / 100;
    await executeTenant(
      db,
      `INSERT INTO invoice_lines (invoice_id, description, category, quantity, unit_amount, line_total)
       VALUES (:invoiceId, :description, :category, :quantity, :unitAmount, :lineTotal)`,
      {
        invoiceId,
        description: c.description,
        category: c.category,
        quantity: c.quantity,
        unitAmount: c.amount,
        lineTotal,
      }
    );
  }

  return getInvoiceDetail(db, invoiceId);
}

export async function getInvoiceDetail(db: DbConfig, invoiceId: number) {
  const invoices = await queryTenant(
    db,
    `SELECT i.*, f.reservation_id, r.confirmation_code, g.first_name, g.last_name, g.email,
            p.name AS property_name, p.address AS property_address, p.phone AS property_phone,
            p.email AS property_email, p.currency
     FROM invoices i
     JOIN folios f ON f.id = i.folio_id
     JOIN reservations r ON r.id = f.reservation_id
     JOIN guests g ON g.id = r.guest_id
     JOIN properties p ON p.id = i.property_id
     WHERE i.id = :invoiceId`,
    { invoiceId }
  );
  const lines = await queryTenant(
    db,
    `SELECT * FROM invoice_lines WHERE invoice_id = :invoiceId ORDER BY id`,
    { invoiceId }
  );
  return { invoice: (invoices as unknown[])[0], lines };
}

export async function listInvoices(db: DbConfig, propertyId: number, folioId?: number) {
  if (folioId) {
    return queryTenant(
      db,
      `SELECT * FROM invoices WHERE property_id = :propertyId AND folio_id = :folioId ORDER BY issued_at DESC`,
      { propertyId, folioId }
    );
  }
  return queryTenant(
    db,
    `SELECT i.*, r.confirmation_code, g.first_name, g.last_name
     FROM invoices i
     JOIN folios f ON f.id = i.folio_id
     JOIN reservations r ON r.id = f.reservation_id
     JOIN guests g ON g.id = r.guest_id
     WHERE i.property_id = :propertyId
     ORDER BY i.issued_at DESC
     LIMIT 100`,
    { propertyId }
  );
}

export async function previewNightAudit(db: DbConfig, propertyId: number, businessDate: string) {
  const stays = await queryTenant<
    Array<{
      reservation_id: number;
      folio_id: number;
      confirmation_code: string;
      guest_name: string;
      room_number: string | null;
      rate_per_night: number;
      check_in_date: string;
      check_out_date: string;
    }>
  >(
    db,
    `SELECT r.id AS reservation_id, f.id AS folio_id, r.confirmation_code,
            CONCAT(g.first_name, ' ', g.last_name) AS guest_name,
            rm.room_number, r.rate_per_night, r.check_in_date, r.check_out_date
     FROM reservations r
     JOIN guests g ON g.id = r.guest_id
     JOIN folios f ON f.reservation_id = r.id AND f.status = 'open'
     LEFT JOIN rooms rm ON rm.id = r.room_id
     WHERE r.property_id = :propertyId
       AND r.status = 'checked_in'
       AND r.check_in_date <= :businessDate
       AND r.check_out_date > :businessDate`,
    { propertyId, businessDate }
  );

  const existing = await queryTenant<Array<{ id: number; status: string }>>(
    db,
    `SELECT id, status FROM night_audit_runs
     WHERE property_id = :propertyId AND business_date = :businessDate AND status = 'completed'
     LIMIT 1`,
    { propertyId, businessDate }
  );

  const exceptions: Array<{ reservation_id: number; code: string; message: string }> = [];
  const posts: Array<{
    reservation_id: number;
    folio_id: number;
    confirmation_code: string;
    guest_name: string;
    room_number: string | null;
    amount: number;
    already_posted: boolean;
  }> = [];

  for (const stay of stays) {
    const rate = Number(stay.rate_per_night);
    if (!rate || rate <= 0) {
      exceptions.push({
        reservation_id: stay.reservation_id,
        code: stay.confirmation_code,
        message: 'Missing rate per night',
      });
      continue;
    }

    const prior = await queryTenant<Array<{ id: number }>>(
      db,
      `SELECT nap.id FROM night_audit_posts nap
       JOIN night_audit_runs nar ON nar.id = nap.night_audit_run_id
       WHERE nar.property_id = :propertyId
         AND nar.business_date = :businessDate
         AND nar.status = 'completed'
         AND nap.reservation_id = :reservationId
       LIMIT 1`,
      { propertyId, businessDate, reservationId: stay.reservation_id }
    );

    posts.push({
      reservation_id: stay.reservation_id,
      folio_id: stay.folio_id,
      confirmation_code: stay.confirmation_code,
      guest_name: stay.guest_name,
      room_number: stay.room_number,
      amount: rate,
      already_posted: Boolean(prior[0]),
    });
  }

  return {
    business_date: businessDate,
    already_completed: Boolean(existing[0]),
    posts,
    exceptions,
    to_post: posts.filter((p) => !p.already_posted).length,
  };
}

export async function runNightAudit(
  db: DbConfig,
  propertyId: number,
  userId: number,
  businessDate: string
) {
  const preview = await previewNightAudit(db, propertyId, businessDate);
  if (preview.already_completed) {
    throw new Error('Night audit already completed for this business date.');
  }

  const result = await executeTenant(
    db,
    `INSERT INTO night_audit_runs
      (property_id, business_date, status, rooms_posted, charges_posted, exceptions_json, summary_json, started_by, completed_at)
     VALUES
      (:propertyId, :businessDate, 'completed', 0, 0, :exceptions, :summary, :userId, CURRENT_TIMESTAMP)`,
    {
      propertyId,
      businessDate,
      exceptions: JSON.stringify(preview.exceptions),
      summary: JSON.stringify({ to_post: preview.to_post }),
      userId,
    }
  );
  const runId = Number((result as { insertId?: number }).insertId);

  let roomsPosted = 0;
  let chargesPosted = 0;

  for (const post of preview.posts) {
    if (post.already_posted) continue;

    await addFolioChargeWithTax(db, propertyId, post.folio_id, userId, {
      description: `Room charge — night of ${businessDate}`,
      category: 'room',
      amount: post.amount,
      quantity: 1,
    });

    const chargeRows = await queryTenant<Array<{ id: number }>>(
      db,
      `SELECT id FROM folio_charges WHERE folio_id = :folioId ORDER BY id DESC LIMIT 1`,
      { folioId: post.folio_id }
    );

    await executeTenant(
      db,
      `INSERT INTO night_audit_posts
        (night_audit_run_id, reservation_id, folio_id, folio_charge_id, amount)
       VALUES (:runId, :reservationId, :folioId, :chargeId, :amount)`,
      {
        runId,
        reservationId: post.reservation_id,
        folioId: post.folio_id,
        chargeId: chargeRows[0]?.id ?? null,
        amount: post.amount,
      }
    );
    roomsPosted += 1;
    chargesPosted += 1;
  }

  await executeTenant(
    db,
    `UPDATE night_audit_runs
     SET rooms_posted = :roomsPosted, charges_posted = :chargesPosted,
         summary_json = :summary
     WHERE id = :runId`,
    {
      runId,
      roomsPosted,
      chargesPosted,
      summary: JSON.stringify({ roomsPosted, chargesPosted, exceptions: preview.exceptions.length }),
    }
  );

  await createRoleNotification(db, ['owner', 'admin', 'finance', 'manager'], {
    type: 'night_audit',
    title: 'Night audit completed',
    body: `Posted ${roomsPosted} room night(s) for ${businessDate}`,
    link: '/billing',
  });

  return {
    run_id: runId,
    business_date: businessDate,
    rooms_posted: roomsPosted,
    charges_posted: chargesPosted,
    exceptions: preview.exceptions,
  };
}

export async function listNightAuditRuns(db: DbConfig, propertyId: number) {
  return queryTenant(
    db,
    `SELECT * FROM night_audit_runs WHERE property_id = :propertyId ORDER BY business_date DESC LIMIT 30`,
    { propertyId }
  );
}
