export const UPSELL_RATES = {
  breakfast_per_night: 30,
  late_checkout: 50,
  spa: 100,
} as const;

export const DEFAULT_TAX_RATE = 0.15;
export const DEFAULT_SECURITY_DEPOSIT = 100;

export type UpsellsInput = {
  breakfast?: boolean;
  late_checkout?: boolean;
  spa?: boolean;
};

export type BookingQuoteBreakdown = {
  nights: number;
  rate_per_night: number;
  room_subtotal: number;
  upsells: {
    breakfast: number;
    late_checkout: number;
    spa: number;
    total: number;
  };
  pre_tax_total: number;
  promo_discount: number;
  taxable_total: number;
  tax_rate: number;
  taxes: number;
  security_deposit: number;
  credits_applied: number;
  due_now: number;
  due_at_hotel: number;
  total_amount: number;
};

export function calculateUpsellTotals(nights: number, upsells: UpsellsInput = {}) {
  const breakfast = upsells.breakfast ? UPSELL_RATES.breakfast_per_night * nights : 0;
  const late_checkout = upsells.late_checkout ? UPSELL_RATES.late_checkout : 0;
  const spa = upsells.spa ? UPSELL_RATES.spa : 0;
  return {
    breakfast,
    late_checkout,
    spa,
    total: breakfast + late_checkout + spa,
  };
}

export function calculateBookingQuote(input: {
  ratePerNight: number;
  nights: number;
  upsells?: UpsellsInput;
  taxRate?: number;
  securityDeposit?: number;
  promoDiscount?: number;
  creditsApplied?: number;
}): BookingQuoteBreakdown {
  const nights = Math.max(0, input.nights);
  const ratePerNight = Math.max(0, input.ratePerNight);
  const roomSubtotal = Math.round(ratePerNight * nights * 100) / 100;
  const upsellTotals = calculateUpsellTotals(nights, input.upsells);
  const preTaxTotal = Math.round((roomSubtotal + upsellTotals.total) * 100) / 100;
  const promoDiscount = Math.min(
    Math.max(0, input.promoDiscount ?? 0),
    preTaxTotal
  );
  const taxableTotal = Math.round((preTaxTotal - promoDiscount) * 100) / 100;
  // Guest website quotes pass taxRate/securityDeposit = 0 (room price only).
  const taxRate = Math.max(0, input.taxRate ?? 0);
  const taxes = Math.round(taxableTotal * taxRate * 100) / 100;
  const securityDeposit = Math.max(0, input.securityDeposit ?? 0);
  const stayBeforeCredits = Math.round((taxableTotal + taxes) * 100) / 100;
  const creditsApplied = Math.min(Math.max(0, input.creditsApplied ?? 0), stayBeforeCredits);
  const dueNow = Math.round((stayBeforeCredits - creditsApplied) * 100) / 100;
  const dueAtHotel = Math.round(securityDeposit * 100) / 100;
  const totalAmount = Math.round((dueNow + dueAtHotel) * 100) / 100;
  return {
    nights,
    rate_per_night: ratePerNight,
    room_subtotal: roomSubtotal,
    upsells: upsellTotals,
    pre_tax_total: preTaxTotal,
    promo_discount: promoDiscount,
    taxable_total: taxableTotal,
    tax_rate: taxRate,
    taxes,
    security_deposit: securityDeposit,
    credits_applied: creditsApplied,
    due_now: dueNow,
    due_at_hotel: dueAtHotel,
    total_amount: totalAmount,
  };
}
