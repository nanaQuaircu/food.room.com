import type { ReportPeriod } from '@/lib/services/hotel-service';
import {
  formatDisplayDate,
  formatDisplayDateRange,
} from '@/lib/dates/format-display-date';

export const REPORT_HEADER_COLOR: [number, number, number] = [0, 174, 239];
export const REPORT_HEADER_HEX = '#00AEEF';

export type ReportPropertyInfo = {
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
};

/** Formats an ISO date (YYYY-MM-DD) as 01-Jan-2026 */
export function formatReportDate(isoDate: string) {
  return formatDisplayDate(isoDate, isoDate);
}

export function formatReportDateRange(startDate: string, endDate: string) {
  return formatDisplayDateRange(startDate, endDate);
}

export function formatReportNumber(value: number, decimals = 2) {
  return Number(value).toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function buildContactLine(property?: ReportPropertyInfo | null) {
  const parts = [property?.email, property?.phone].filter(Boolean) as string[];
  return parts.join(' | ');
}

export function buildReportTitle(
  period: ReportPeriod,
  startDate: string,
  endDate: string,
  periodLabel?: string
) {
  const year = startDate.slice(0, 4);
  if (period === 'yearly') return `ANNUAL OPERATIONS REPORT - ${year}`;
  if (period === 'monthly') {
    const d = new Date(`${startDate}T12:00:00`);
    const monthYear = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }).toUpperCase();
    return `MONTHLY OPERATIONS REPORT - ${monthYear}`;
  }
  if (period === 'weekly') return 'WEEKLY OPERATIONS REPORT';
  if (period === 'daily') {
    return `DAILY OPERATIONS REPORT - ${formatReportDate(startDate)}`;
  }
  return (periodLabel || 'OPERATIONS REPORT').toUpperCase();
}

export function buildReportSubtitle(startDate: string, endDate: string) {
  if (startDate === endDate) return `Date: ${formatReportDate(startDate)}`;
  return `Period: ${formatReportDateRange(startDate, endDate)}`;
}

export function formatPrintedTimestamp(date = new Date()) {
  const datePart = formatDisplayDate(date);
  const timePart = date.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
  return `${datePart} ${timePart}`;
}
