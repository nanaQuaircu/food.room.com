const DISPLAY_MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

/** Normalizes a date value to YYYY-MM-DD when possible. */
export function toIsoDateKey(value: string | Date | null | undefined): string | null {
  if (value == null || value === '') return null;

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  const s = String(value).trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);

  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime())) return toIsoDateKey(parsed);

  return null;
}

/** Formats a date as 01-Jan-2026 for display across the app. */
export function formatDisplayDate(
  value: string | Date | null | undefined,
  fallback = '—'
): string {
  const iso = toIsoDateKey(value);
  if (!iso) return value ? String(value) : fallback;

  const [year, month, day] = iso.split('-');
  const monthIndex = Number(month) - 1;
  if (!year || !day || monthIndex < 0 || monthIndex > 11) return iso;

  return `${day.padStart(2, '0')}-${DISPLAY_MONTHS[monthIndex]}-${year}`;
}

export function formatDisplayDateRange(
  startDate: string,
  endDate: string,
  separator = ' to '
): string {
  if (startDate === endDate) return formatDisplayDate(startDate);
  return `${formatDisplayDate(startDate)}${separator}${formatDisplayDate(endDate)}`;
}
