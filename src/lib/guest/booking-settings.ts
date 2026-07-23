import type { DbConfig } from '@/lib/db/central';
import { executeTenant, queryTenant } from '@/lib/db/tenant';
import { calculateBookingNights } from '@/lib/billing/stay-billing';
import { listTaxRates } from '@/lib/services/billing-loop2';
import {
  calculateBookingQuote,
  DEFAULT_SECURITY_DEPOSIT,
  DEFAULT_TAX_RATE,
  type UpsellsInput,
} from '@/lib/guest/booking-pricing';

export type PropertyBookingSettings = {
  currency: string;
  security_deposit_amount: number;
  cancellation_free_days: number;
  cancellation_penalty_pct: number;
};

export async function getPropertyBookingSettings(
  db: DbConfig,
  propertyId: number
): Promise<PropertyBookingSettings> {
  const rows = await queryTenant<
    Array<{
      currency: string;
      security_deposit_amount: number | null;
      cancellation_free_days: number | null;
      cancellation_penalty_pct: number | null;
    }>
  >(
    db,
    `SELECT currency,
            COALESCE(security_deposit_amount, ${DEFAULT_SECURITY_DEPOSIT}) AS security_deposit_amount,
            COALESCE(cancellation_free_days, 2) AS cancellation_free_days,
            COALESCE(cancellation_penalty_pct, 50) AS cancellation_penalty_pct
     FROM properties WHERE id = :propertyId LIMIT 1`,
    { propertyId }
  );
  const row = rows[0];
  return {
    currency: row?.currency || 'GHS',
    security_deposit_amount: Number(row?.security_deposit_amount ?? DEFAULT_SECURITY_DEPOSIT),
    cancellation_free_days: Number(row?.cancellation_free_days ?? 2),
    cancellation_penalty_pct: Number(row?.cancellation_penalty_pct ?? 50),
  };
}

export async function getCombinedTaxRate(db: DbConfig, propertyId: number): Promise<number> {
  try {
    const rates = await listTaxRates(db, propertyId);
    const active = rates.filter((r) => r.is_active && !r.is_inclusive);
    if (!active.length) return DEFAULT_TAX_RATE;
    return active.reduce((sum, r) => sum + Number(r.rate_percent) / 100, 0);
  } catch {
    return DEFAULT_TAX_RATE;
  }
}

export async function validatePromoCode(
  db: DbConfig,
  propertyId: number,
  code: string,
  nights: number
) {
  const normalized = code.trim().toUpperCase();
  if (!normalized) return null;

  const rows = await queryTenant<
    Array<{
      id: number;
      code: string;
      discount_type: 'percent' | 'fixed';
      discount_value: number;
      min_nights: number;
      max_uses: number | null;
      used_count: number;
    }>
  >(
    db,
    `SELECT id, code, discount_type, discount_value, min_nights, max_uses, used_count
     FROM promo_codes
     WHERE property_id = :propertyId
       AND UPPER(code) = :code
       AND is_active = 1
       AND (valid_from IS NULL OR valid_from <= CURDATE())
       AND (valid_to IS NULL OR valid_to >= CURDATE())
     LIMIT 1`,
    { propertyId, code: normalized }
  );
  const promo = rows[0];
  if (!promo) throw new Error('Invalid or expired promo code.');
  if (nights < Number(promo.min_nights)) {
    throw new Error(`Promo requires at least ${promo.min_nights} night(s).`);
  }
  if (promo.max_uses != null && Number(promo.used_count) >= Number(promo.max_uses)) {
    throw new Error('Promo code has reached its usage limit.');
  }
  return promo;
}

export function promoDiscountAmount(
  promo: { discount_type: 'percent' | 'fixed'; discount_value: number },
  preTaxTotal: number
) {
  if (promo.discount_type === 'fixed') {
    return Math.min(Number(promo.discount_value), preTaxTotal);
  }
  return Math.round(preTaxTotal * (Number(promo.discount_value) / 100) * 100) / 100;
}

export async function incrementPromoUsage(db: DbConfig, promoId: number) {
  await executeTenant(
    db,
    `UPDATE promo_codes SET used_count = used_count + 1 WHERE id = :id`,
    { id: promoId }
  );
}

export async function buildGuestBookingQuote(
  db: DbConfig,
  propertyId: number,
  input: {
    ratePerNight: number;
    checkIn: string;
    checkOut: string;
    upsells?: UpsellsInput;
    promoCode?: string;
    creditsApplied?: number;
  }
) {
  const nights = calculateBookingNights(input.checkIn, input.checkOut);
  const settings = await getPropertyBookingSettings(db, propertyId);

  let promoDiscount = 0;
  let promoMeta: { id: number; code: string } | null = null;
  if (input.promoCode) {
    const promo = await validatePromoCode(db, propertyId, input.promoCode, nights);
    if (promo) {
      const upsellTotals = input.upsells
        ? (await import('@/lib/guest/booking-pricing')).calculateUpsellTotals(nights, input.upsells)
        : { total: 0 };
      const preTax = input.ratePerNight * nights + upsellTotals.total;
      promoDiscount = promoDiscountAmount(promo, preTax);
      promoMeta = { id: promo.id, code: promo.code };
    }
  }

  // Website checkout shows/charges room (+ optional add-ons) only — no tax or deposit.
  const quote = calculateBookingQuote({
    ratePerNight: input.ratePerNight,
    nights,
    upsells: input.upsells,
    taxRate: 0,
    securityDeposit: 0,
    promoDiscount,
    creditsApplied: input.creditsApplied,
  });

  return { quote, settings, promoMeta };
}

export async function applyGuestCredits(
  db: DbConfig,
  guestId: number,
  amount: number
) {
  if (amount <= 0) return;
  const rows = await queryTenant<Array<{ account_credits: number }>>(
    db,
    `SELECT COALESCE(account_credits, 0) AS account_credits FROM guest_accounts WHERE guest_id = :guestId LIMIT 1`,
    { guestId }
  );
  const available = Number(rows[0]?.account_credits ?? 0);
  if (available < amount) throw new Error('Insufficient loyalty credits.');
  await executeTenant(
    db,
    `UPDATE guest_accounts SET account_credits = account_credits - :amount WHERE guest_id = :guestId`,
    { guestId, amount }
  );
}

export async function awardGuestCredits(
  db: DbConfig,
  guestId: number,
  amount: number
) {
  if (amount <= 0) return;
  await executeTenant(
    db,
    `UPDATE guest_accounts SET account_credits = COALESCE(account_credits, 0) + :amount WHERE guest_id = :guestId`,
    { guestId, amount }
  );
}
