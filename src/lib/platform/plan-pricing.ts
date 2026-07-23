export const YEARLY_PRICE_MULTIPLIER = 10;

export function calcYearlyPrice(monthlyPrice: number) {
  return Math.round(monthlyPrice * YEARLY_PRICE_MULTIPLIER * 100) / 100;
}
