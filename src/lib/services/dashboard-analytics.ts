import type { DbConfig } from '@/lib/db/central';
import { queryTenant } from '@/lib/db/tenant';
import { formatDisplayDate } from '@/lib/dates/format-display-date';

export type ChartSeries = {
  labels: string[];
  values: number[];
};

export type ArrivalsDeparturesChart = {
  labels: string[];
  arrivals: number[];
  departures: number[];
};

export type DashboardChartData = {
  arrivalsDepartures7: ArrivalsDeparturesChart;
  arrivalsDepartures30: ArrivalsDeparturesChart;
  revenue7: ChartSeries;
  revenue30: ChartSeries;
  roomStatus: ChartSeries;
  reservationStatus: ChartSeries;
  housekeeping: ChartSeries;
  roomsAttention: ChartSeries;
  paymentMethods: ChartSeries;
  topRoomTypes: ChartSeries;
  occupancyForecast: ChartSeries;
  guestRepeat: ChartSeries;
  vipGuests: ChartSeries;
  folioAging: ChartSeries;
  foodRevenue7: ChartSeries;
  foodRevenue30: ChartSeries;
  foodOrders7: ChartSeries;
  foodOrders30: ChartSeries;
  foodOrderStatus: ChartSeries;
  foodPaymentMix: ChartSeries;
  adr: number;
  revpar: number;
  revenue30Total: number;
};

function localDateStr(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function buildDateRange(days: number, forward = false): string[] {
  const out: string[] = [];
  if (forward) {
    for (let i = 0; i < days; i++) out.push(localDateStr(i));
  } else {
    for (let i = days - 1; i >= 0; i--) out.push(localDateStr(-i));
  }
  return out;
}

function shortLabel(isoDate: string): string {
  return formatDisplayDate(isoDate);
}

function toDateKey(value: string | Date): string {
  if (value instanceof Date) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  const s = String(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime())) return toDateKey(parsed);
  return s.slice(0, 10);
}

function mapDailyCounts(dates: string[], rows: Array<{ d: string | Date; c: number }>): number[] {
  const map = new Map<string, number>();
  for (const row of rows) {
    map.set(toDateKey(row.d), Number(row.c));
  }
  return dates.map((d) => map.get(d) ?? 0);
}

function mapDailyAmounts(dates: string[], rows: Array<{ d: string | Date; amount: number }>): number[] {
  const map = new Map<string, number>();
  for (const row of rows) {
    map.set(toDateKey(row.d), Number(row.amount));
  }
  return dates.map((d) => map.get(d) ?? 0);
}

const ROOM_STATUS_LABELS: Record<string, string> = {
  vacant: 'Vacant',
  occupied: 'Occupied',
  dirty: 'Dirty',
  clean: 'Clean',
  inspected: 'Inspected',
  out_of_order: 'Out of Order',
  out_of_service: 'Out of Service',
};

const RESERVATION_STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  checked_in: 'Checked In',
  checked_out: 'Checked Out',
  cancelled: 'Cancelled',
  no_show: 'No Show',
};

const HOUSEKEEPING_STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

const FOOD_ORDER_STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  preparing: 'Preparing',
  ready: 'Ready',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: 'Cash',
  card: 'Card',
  mobile_money: 'Mobile Money',
  bank_transfer: 'Bank Transfer',
  other: 'Other',
  paystack: 'Paystack',
};

function labelRows(
  rows: Array<{ key: string; c: number }>,
  labelMap: Record<string, string>
): ChartSeries {
  return {
    labels: rows.map((r) => labelMap[r.key] ?? r.key.replace(/_/g, ' ')),
    values: rows.map((r) => Number(r.c)),
  };
}

export async function getDashboardChartData(db: DbConfig, propertyId: number): Promise<DashboardChartData> {
  const [
    arrivalRows7,
    departureRows7,
    arrivalRows30,
    departureRows30,
    revenueRows7,
    revenueRows30,
    roomStatusRows,
    reservationStatusRows,
    housekeepingRows,
    roomsAttentionRows,
    paymentMethodRows,
    topRoomTypeRows,
    forecastRows,
    guestRepeatRows,
    vipRows,
    folioAgingRows,
    kpiRows,
  ] = await Promise.all([
    queryTenant<Array<{ d: string; c: number }>>(
      db,
      `SELECT DATE_FORMAT(check_in_date, '%Y-%m-%d') AS d, COUNT(*) AS c
       FROM reservations
       WHERE property_id = :propertyId
         AND check_in_date >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
         AND check_in_date <= CURDATE()
         AND status NOT IN ('cancelled', 'no_show')
       GROUP BY check_in_date`,
      { propertyId }
    ),
    queryTenant<Array<{ d: string; c: number }>>(
      db,
      `SELECT DATE_FORMAT(check_out_date, '%Y-%m-%d') AS d, COUNT(*) AS c
       FROM reservations
       WHERE property_id = :propertyId
         AND check_out_date >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
         AND check_out_date <= CURDATE()
         AND status NOT IN ('cancelled', 'no_show', 'pending')
       GROUP BY check_out_date`,
      { propertyId }
    ),
    queryTenant<Array<{ d: string; c: number }>>(
      db,
      `SELECT DATE_FORMAT(check_in_date, '%Y-%m-%d') AS d, COUNT(*) AS c
       FROM reservations
       WHERE property_id = :propertyId
         AND check_in_date >= DATE_SUB(CURDATE(), INTERVAL 29 DAY)
         AND check_in_date <= CURDATE()
         AND status NOT IN ('cancelled', 'no_show')
       GROUP BY check_in_date`,
      { propertyId }
    ),
    queryTenant<Array<{ d: string; c: number }>>(
      db,
      `SELECT DATE_FORMAT(check_out_date, '%Y-%m-%d') AS d, COUNT(*) AS c
       FROM reservations
       WHERE property_id = :propertyId
         AND check_out_date >= DATE_SUB(CURDATE(), INTERVAL 29 DAY)
         AND check_out_date <= CURDATE()
         AND status NOT IN ('cancelled', 'no_show', 'pending')
       GROUP BY check_out_date`,
      { propertyId }
    ),
    queryTenant<Array<{ d: string; amount: number }>>(
      db,
      `SELECT DATE_FORMAT(p.paid_at, '%Y-%m-%d') AS d, COALESCE(SUM(p.amount), 0) AS amount
       FROM payments p
       JOIN folios f ON f.id = p.folio_id
       JOIN reservations r ON r.id = f.reservation_id
       WHERE r.property_id = :propertyId
         AND DATE(p.paid_at) >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
       GROUP BY DATE(p.paid_at)`,
      { propertyId }
    ),
    queryTenant<Array<{ d: string; amount: number }>>(
      db,
      `SELECT DATE_FORMAT(p.paid_at, '%Y-%m-%d') AS d, COALESCE(SUM(p.amount), 0) AS amount
       FROM payments p
       JOIN folios f ON f.id = p.folio_id
       JOIN reservations r ON r.id = f.reservation_id
       WHERE r.property_id = :propertyId
         AND DATE(p.paid_at) >= DATE_SUB(CURDATE(), INTERVAL 29 DAY)
       GROUP BY DATE(p.paid_at)`,
      { propertyId }
    ),
    queryTenant<Array<{ status: string; c: number }>>(
      db,
      `SELECT status, COUNT(*) AS c FROM rooms
       WHERE property_id = :propertyId AND is_active = 1
       GROUP BY status ORDER BY c DESC`,
      { propertyId }
    ),
    queryTenant<Array<{ status: string; c: number }>>(
      db,
      `SELECT status, COUNT(*) AS c FROM reservations
       WHERE property_id = :propertyId
       GROUP BY status ORDER BY c DESC`,
      { propertyId }
    ),
    queryTenant<Array<{ status: string; c: number }>>(
      db,
      `SELECT status, COUNT(*) AS c FROM housekeeping_tasks
       WHERE property_id = :propertyId
       GROUP BY status ORDER BY c DESC`,
      { propertyId }
    ),
    queryTenant<Array<{ status: string; c: number }>>(
      db,
      `SELECT status, COUNT(*) AS c FROM rooms
       WHERE property_id = :propertyId
         AND status IN ('dirty', 'clean', 'out_of_order', 'out_of_service')
       GROUP BY status ORDER BY c DESC`,
      { propertyId }
    ),
    queryTenant<Array<{ method: string; total: number }>>(
      db,
      `SELECT p.method, COALESCE(SUM(p.amount), 0) AS total
       FROM payments p
       JOIN folios f ON f.id = p.folio_id
       JOIN reservations r ON r.id = f.reservation_id
       WHERE r.property_id = :propertyId
         AND DATE(p.paid_at) >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
       GROUP BY p.method ORDER BY total DESC`,
      { propertyId }
    ),
    queryTenant<Array<{ label: string; c: number }>>(
      db,
      `SELECT rt.name AS label, COUNT(*) AS c
       FROM reservations r
       JOIN room_types rt ON rt.id = r.room_type_id
       WHERE r.property_id = :propertyId AND r.status NOT IN ('cancelled', 'no_show')
       GROUP BY rt.id, rt.name
       ORDER BY c DESC LIMIT 6`,
      { propertyId }
    ),
    queryTenant<Array<{ d: string; c: number }>>(
      db,
      `SELECT DATE_FORMAT(check_in_date, '%Y-%m-%d') AS d, COUNT(*) AS c
       FROM reservations
       WHERE property_id = :propertyId
         AND check_in_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 13 DAY)
         AND status IN ('confirmed', 'pending', 'checked_in')
       GROUP BY check_in_date`,
      { propertyId }
    ),
    queryTenant<Array<{ repeatGuests: number; firstTimeGuests: number }>>(
      db,
      `SELECT
         COALESCE(SUM(CASE WHEN res_count > 1 THEN 1 ELSE 0 END), 0) AS repeatGuests,
         COALESCE(SUM(CASE WHEN res_count <= 1 THEN 1 ELSE 0 END), 0) AS firstTimeGuests
       FROM (
         SELECT g.id, COUNT(r.id) AS res_count
         FROM guests g
         INNER JOIN reservations r ON r.guest_id = g.id
           AND r.property_id = :propertyId
           AND r.status NOT IN ('cancelled', 'no_show')
         GROUP BY g.id
       ) guest_stats`,
      { propertyId }
    ),
    queryTenant<Array<{ vip: number; regular: number }>>(
      db,
      `SELECT
         COALESCE(SUM(CASE WHEN g.is_vip = 1 THEN 1 ELSE 0 END), 0) AS vip,
         COALESCE(SUM(CASE WHEN g.is_vip = 0 THEN 1 ELSE 0 END), 0) AS regular
       FROM guests g
       WHERE EXISTS (
         SELECT 1 FROM reservations r
         WHERE r.guest_id = g.id AND r.property_id = :propertyId
       )`,
      { propertyId }
    ),
    queryTenant<Array<{ bucket: string; c: number }>>(
      db,
      `SELECT
         CASE
           WHEN f.balance < 500 THEN 'Under 500'
           WHEN f.balance < 2000 THEN '500 – 2,000'
           ELSE 'Over 2,000'
         END AS bucket,
         COUNT(*) AS c
       FROM folios f
       JOIN reservations r ON r.id = f.reservation_id
       WHERE r.property_id = :propertyId AND f.status = 'open' AND f.balance > 0
       GROUP BY bucket
       ORDER BY MIN(f.balance)`,
      { propertyId }
    ),
    queryTenant<Array<{ adr: number; revenue30: number; totalRooms: number }>>(
      db,
      `SELECT
         (SELECT COALESCE(AVG(rate_per_night), 0)
          FROM reservations
          WHERE property_id = :propertyId
            AND status IN ('checked_in', 'checked_out')
            AND check_out_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)) AS adr,
         (SELECT COALESCE(SUM(p.amount), 0)
          FROM payments p
          JOIN folios f ON f.id = p.folio_id
          JOIN reservations r ON r.id = f.reservation_id
          WHERE r.property_id = :propertyId
            AND DATE(p.paid_at) >= DATE_SUB(CURDATE(), INTERVAL 29 DAY)) AS revenue30,
         (SELECT COUNT(*) FROM rooms WHERE property_id = :propertyId AND is_active = 1) AS totalRooms`,
      { propertyId }
    ),
  ]);

  let foodRevenueRows7: Array<{ d: string; amount: number }> = [];
  let foodRevenueRows30: Array<{ d: string; amount: number }> = [];
  let foodOrderRows7: Array<{ d: string; c: number }> = [];
  let foodOrderRows30: Array<{ d: string; c: number }> = [];
  let foodStatusRows: Array<{ status: string; c: number }> = [];
  let foodPaymentRows: Array<{ bucket: string; c: number }> = [];

  try {
    [
      foodRevenueRows7,
      foodRevenueRows30,
      foodOrderRows7,
      foodOrderRows30,
      foodStatusRows,
      foodPaymentRows,
    ] = await Promise.all([
      queryTenant<Array<{ d: string; amount: number }>>(
        db,
        `SELECT DATE_FORMAT(created_at, '%Y-%m-%d') AS d,
                COALESCE(SUM(total_amount), 0) AS amount
         FROM food_orders
         WHERE property_id = :propertyId
           AND payment_status = 'paid'
           AND status <> 'cancelled'
           AND DATE(created_at) >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
         GROUP BY DATE(created_at)`,
        { propertyId }
      ),
      queryTenant<Array<{ d: string; amount: number }>>(
        db,
        `SELECT DATE_FORMAT(created_at, '%Y-%m-%d') AS d,
                COALESCE(SUM(total_amount), 0) AS amount
         FROM food_orders
         WHERE property_id = :propertyId
           AND payment_status = 'paid'
           AND status <> 'cancelled'
           AND DATE(created_at) >= DATE_SUB(CURDATE(), INTERVAL 29 DAY)
         GROUP BY DATE(created_at)`,
        { propertyId }
      ),
      queryTenant<Array<{ d: string; c: number }>>(
        db,
        `SELECT DATE_FORMAT(created_at, '%Y-%m-%d') AS d, COUNT(*) AS c
         FROM food_orders
         WHERE property_id = :propertyId
           AND status <> 'cancelled'
           AND DATE(created_at) >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
         GROUP BY DATE(created_at)`,
        { propertyId }
      ),
      queryTenant<Array<{ d: string; c: number }>>(
        db,
        `SELECT DATE_FORMAT(created_at, '%Y-%m-%d') AS d, COUNT(*) AS c
         FROM food_orders
         WHERE property_id = :propertyId
           AND status <> 'cancelled'
           AND DATE(created_at) >= DATE_SUB(CURDATE(), INTERVAL 29 DAY)
         GROUP BY DATE(created_at)`,
        { propertyId }
      ),
      queryTenant<Array<{ status: string; c: number }>>(
        db,
        `SELECT status, COUNT(*) AS c
         FROM food_orders
         WHERE property_id = :propertyId
           AND DATE(created_at) >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
         GROUP BY status
         ORDER BY FIELD(status, 'pending', 'preparing', 'ready', 'delivered', 'cancelled')`,
        { propertyId }
      ),
      queryTenant<Array<{ bucket: string; c: number }>>(
        db,
        `SELECT
           CASE
             WHEN payment_status = 'paid' THEN 'Paid'
             WHEN payment_method IN ('cash', 'cash_on_delivery', 'cod') THEN 'Unpaid cash / COD'
             ELSE 'Unpaid other'
           END AS bucket,
           COUNT(*) AS c
         FROM food_orders
         WHERE property_id = :propertyId
           AND status <> 'cancelled'
           AND DATE(created_at) >= DATE_SUB(CURDATE(), INTERVAL 29 DAY)
         GROUP BY bucket`,
        { propertyId }
      ),
    ]);
  } catch (err) {
    // Older tenants may lack food_orders; log so chart failures are visible in dev.
    console.error('Dashboard food chart queries failed:', err);
  }

  const dates7 = buildDateRange(7);
  const dates30 = buildDateRange(30);
  const dates14 = buildDateRange(14, true);

  const kpi = kpiRows[0] ?? { adr: 0, revenue30: 0, totalRooms: 0 };
  const totalRooms = Number(kpi.totalRooms);
  const revenue30Total = Number(kpi.revenue30);
  const revpar = totalRooms > 0 ? Math.round((revenue30Total / (totalRooms * 30)) * 100) / 100 : 0;

  const repeat = guestRepeatRows[0] ?? { repeatGuests: 0, firstTimeGuests: 0 };
  const vip = vipRows[0] ?? { vip: 0, regular: 0 };

  return {
    arrivalsDepartures7: {
      labels: dates7.map(shortLabel),
      arrivals: mapDailyCounts(dates7, arrivalRows7),
      departures: mapDailyCounts(dates7, departureRows7),
    },
    arrivalsDepartures30: {
      labels: dates30.map(shortLabel),
      arrivals: mapDailyCounts(dates30, arrivalRows30),
      departures: mapDailyCounts(dates30, departureRows30),
    },
    revenue7: {
      labels: dates7.map(shortLabel),
      values: mapDailyAmounts(dates7, revenueRows7),
    },
    revenue30: {
      labels: dates30.map(shortLabel),
      values: mapDailyAmounts(dates30, revenueRows30),
    },
    roomStatus: labelRows(
      roomStatusRows.map((r) => ({ key: r.status, c: r.c })),
      ROOM_STATUS_LABELS
    ),
    reservationStatus: labelRows(
      reservationStatusRows.map((r) => ({ key: r.status, c: r.c })),
      RESERVATION_STATUS_LABELS
    ),
    housekeeping: labelRows(
      housekeepingRows.map((r) => ({ key: r.status, c: r.c })),
      HOUSEKEEPING_STATUS_LABELS
    ),
    roomsAttention: labelRows(
      roomsAttentionRows.map((r) => ({ key: r.status, c: r.c })),
      ROOM_STATUS_LABELS
    ),
    paymentMethods: {
      labels: paymentMethodRows.map((r) => PAYMENT_METHOD_LABELS[r.method] ?? r.method),
      values: paymentMethodRows.map((r) => Number(r.total)),
    },
    topRoomTypes: {
      labels: topRoomTypeRows.map((r) => r.label),
      values: topRoomTypeRows.map((r) => Number(r.c)),
    },
    occupancyForecast: {
      labels: dates14.map(shortLabel),
      values: mapDailyCounts(dates14, forecastRows),
    },
    guestRepeat: {
      labels: ['Repeat Guests', 'First-time Guests'],
      values: [Number(repeat.repeatGuests), Number(repeat.firstTimeGuests)],
    },
    vipGuests: {
      labels: ['VIP', 'Regular'],
      values: [Number(vip.vip), Number(vip.regular)],
    },
    folioAging: {
      labels: folioAgingRows.map((r) => r.bucket),
      values: folioAgingRows.map((r) => Number(r.c)),
    },
    foodRevenue7: {
      labels: dates7.map(shortLabel),
      values: mapDailyAmounts(dates7, foodRevenueRows7),
    },
    foodRevenue30: {
      labels: dates30.map(shortLabel),
      values: mapDailyAmounts(dates30, foodRevenueRows30),
    },
    foodOrders7: {
      labels: dates7.map(shortLabel),
      values: mapDailyCounts(dates7, foodOrderRows7),
    },
    foodOrders30: {
      labels: dates30.map(shortLabel),
      values: mapDailyCounts(dates30, foodOrderRows30),
    },
    foodOrderStatus: labelRows(
      foodStatusRows.map((r) => ({ key: r.status, c: r.c })),
      FOOD_ORDER_STATUS_LABELS
    ),
    foodPaymentMix: {
      labels: foodPaymentRows.map((r) => r.bucket),
      values: foodPaymentRows.map((r) => Number(r.c)),
    },
    adr: Number(kpi.adr),
    revpar,
    revenue30Total,
  };
}
