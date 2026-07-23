const MS_PER_DAY = 1000 * 60 * 60 * 24;

/** Parse YYYY-MM-DD (or ISO datetime) as local calendar date. */
export function parseDateOnly(value: string | Date): Date {
  if (value instanceof Date) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }
  const [y, m, d] = value.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Local calendar date as YYYY-MM-DD (avoids UTC drift from toISOString()). */
export function formatLocalDateIso(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDaysToDateIso(iso: string, days: number): string {
  const d = parseDateOnly(iso);
  d.setDate(d.getDate() + days);
  return formatLocalDateIso(d);
}

/** Nights between check-in and check-out (hotel convention: checkout morning = nights through prior night). */
export function calculateStayNights(checkIn: string | Date, checkOut: string | Date): number {
  const start = parseDateOnly(checkIn);
  const end = parseDateOnly(checkOut);
  const days = Math.floor((end.getTime() - start.getTime()) / MS_PER_DAY);
  return Math.max(0, days);
}

/** Nights for a new booking preview (check-out must be after check-in). */
export function calculateBookingNights(checkIn: string | Date, checkOut: string | Date): number {
  const nights = calculateStayNights(checkIn, checkOut);
  if (nights <= 0) return 0;
  return nights;
}

/** Billable nights for an occupied stay — minimum one night when the guest occupied the room. */
export function calculateBillableNights(checkIn: string | Date, checkOut: string | Date): number {
  return Math.max(1, calculateStayNights(checkIn, checkOut));
}

export function calculateRoomTotal(ratePerNight: number, nights: number): number {
  return Math.round(ratePerNight * nights * 100) / 100;
}

export type RefundPolicy = 'full' | 'partial' | 'none';

export function resolveRefundAmount(
  policy: RefundPolicy,
  unusedNightsValue: number,
  partialAmount?: number
): number {
  if (policy === 'none' || unusedNightsValue <= 0) return 0;
  if (policy === 'full') return unusedNightsValue;
  const amount = Number(partialAmount ?? 0);
  if (!Number.isFinite(amount) || amount < 0) return 0;
  return Math.min(amount, unusedNightsValue);
}
