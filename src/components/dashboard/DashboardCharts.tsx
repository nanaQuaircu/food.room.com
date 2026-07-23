'use client';

import dynamic from 'next/dynamic';
import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import type { ApexOptions } from 'apexcharts';
import { EmptyState, PremiumCard, StatCard } from '@/components/ui/premium';
import type { DashboardChartData } from '@/lib/services/dashboard-analytics';
import {
  AXIS_LABELS,
  GRID,
  chartBase,
  countLabel,
  currencyLabel,
  donutAmountLabel,
  pieCountLabel,
  polarCountLabel,
} from '@/lib/charts/apex-helpers';
import RemountingChart, { PeriodToggle } from '@/components/dashboard/RemountingChart';

const Chart = dynamic(() => import('react-apexcharts'), { ssr: false });

const PALETTES = {
  traffic: ['#1F3A63', '#C6A34D'],
  revenue: ['#3B6D11'],
  forecast: ['#3D5A85'],
  occupancy: ['#0A1428', '#C6A34D'],
  roomStatus: ['#3B6D11', '#993C1D', '#854F0B', '#791F1F', '#1F3A63', '#8A6A2C', '#6E6A60'],
  reservationStatus: ['#1F3A63', '#3B6D11', '#C6A34D', '#993C1D', '#C9C2B2', '#854F0B'],
  housekeeping: ['#854F0B', '#1F3A63', '#3B6D11', '#C9C2B2'],
  roomsAttention: ['#791F1F', '#854F0B', '#993C1D', '#4A3714'],
  paymentMethods: ['#1F3A63', '#C6A34D', '#3B6D11', '#8A6A2C', '#6E6A60'],
  topRoomTypes: ['#0A1428', '#C6A34D', '#152A4A', '#8A6A2C', '#3D5A85', '#F0E4C6'],
  folioAging: ['#8A6A2C', '#C6A34D', '#D9BE7E'],
  guestRepeat: ['#1F3A63', '#C9C2B2'],
  vip: ['#C6A34D', '#6E6A60'],
  foodRevenue: ['#C67A3D'],
  foodOrders: ['#1F3A63'],
  foodStatus: ['#854F0B', '#1F3A63', '#3B6D11', '#C6A34D', '#6E6A60'],
  foodPayment: ['#3B6D11', '#C6A34D', '#993C1D'],
} as const;

type DashboardChartsProps = {
  totalRooms?: number;
  occupiedRooms?: number;
  revenueToday?: number;
  totalRevenue?: number;
  revenue30Total?: number;
  guestCount?: number;
  reservationCount?: number;
  adr?: number;
  revpar?: number;
  foodOrdersToday?: number;
  foodRevenueToday?: number;
  unpaidCashCod?: number;
  foodRevenue30d?: number;
  openKitchenOrders?: number;
  charts?: DashboardChartData | null;
};

function formatMoney(value: number, decimals = 0) {
  return Number(value).toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function hasData(values: number[]) {
  return values.some((v) => v > 0);
}

function ChartEmpty({ message }: { message: string }) {
  return <EmptyState message={message} icon="ti-chart-bar" />;
}

function ChartPanel({
  title,
  actions,
  children,
  delay = 0,
}: {
  title: string;
  actions?: ReactNode;
  children: React.ReactNode;
  delay?: number;
}) {
  return (
    <PremiumCard fill title={title} actions={actions} className="premium-chart-panel" style={{ animationDelay: `${delay}ms` } as CSSProperties}>
      <div className="premium-chart-canvas">{children}</div>
    </PremiumCard>
  );
}

export default function DashboardCharts({
  totalRooms = 0,
  occupiedRooms = 0,
  revenueToday = 0,
  totalRevenue = 0,
  revenue30Total = 0,
  guestCount = 0,
  reservationCount = 0,
  adr = 0,
  revpar = 0,
  foodOrdersToday = 0,
  foodRevenueToday = 0,
  unpaidCashCod = 0,
  foodRevenue30d = 0,
  openKitchenOrders = 0,
  charts,
}: DashboardChartsProps) {
  const [trafficPeriod, setTrafficPeriod] = useState<'week' | 'month'>('week');
  const [revenuePeriod, setRevenuePeriod] = useState<'week' | 'month'>('week');
  const [foodPeriod, setFoodPeriod] = useState<'week' | 'month'>('week');

  const traffic = trafficPeriod === 'week' ? charts?.arrivalsDepartures7 : charts?.arrivalsDepartures30;
  const revenue = revenuePeriod === 'week' ? charts?.revenue7 : charts?.revenue30;
  const foodRevenue = foodPeriod === 'week' ? charts?.foodRevenue7 : charts?.foodRevenue30;
  const foodOrders = foodPeriod === 'week' ? charts?.foodOrders7 : charts?.foodOrders30;

  const occupancyPct = totalRooms > 0 ? Math.round((occupiedRooms / totalRooms) * 100) : 0;
  const vacantPct = Math.max(0, 100 - occupancyPct);

  const trafficSeries = useMemo(
    () => [
      { name: 'Arrivals', data: [...(traffic?.arrivals ?? [])] },
      { name: 'Departures', data: [...(traffic?.departures ?? [])] },
    ],
    [traffic?.arrivals, traffic?.departures]
  );

  const trafficOptions = useMemo<ApexOptions>(
    () => ({
      colors: [...PALETTES.traffic],
      chart: { ...chartBase(300, 'bar'), id: `traffic-chart-${trafficPeriod}` },
      grid: GRID,
      legend: { show: true, fontWeight: 600 },
      plotOptions: {
        bar: {
          horizontal: false,
          columnWidth: trafficPeriod === 'week' ? '68%' : '82%',
          borderRadius: 8,
          borderRadiusApplication: 'end',
          dataLabels: { position: 'top' },
        },
      },
      dataLabels: countLabel(),
      stroke: { show: false },
      xaxis: {
        categories: [...(traffic?.labels ?? [])],
        labels: { ...AXIS_LABELS, rotate: trafficPeriod === 'month' ? -45 : 0, hideOverlappingLabels: true },
      },
      yaxis: { labels: AXIS_LABELS, min: 0, forceNiceScale: true, title: { text: 'Guests', style: { color: '#64748b', fontWeight: 500 } } },
      tooltip: { theme: 'light' },
    }),
    [traffic?.labels, traffic?.arrivals, traffic?.departures, trafficPeriod]
  );

  const revenueSeries = useMemo(() => [{ name: 'Revenue', data: [...(revenue?.values ?? [])] }], [revenue?.values]);

  const revenueOptions = useMemo<ApexOptions>(
    () => ({
      colors: [...PALETTES.revenue],
      chart: { ...chartBase(280, 'area'), id: `revenue-chart-${revenuePeriod}` },
      grid: GRID,
      dataLabels: currencyLabel(revenuePeriod === 'month' ? 5 : 1),
      stroke: { curve: 'smooth', width: 3 },
      fill: {
        type: 'gradient',
        gradient: { shadeIntensity: 1, opacityFrom: 0.55, opacityTo: 0.08, stops: [0, 90, 100] },
      },
      markers: { size: revenuePeriod === 'week' ? 5 : 0, strokeWidth: 2, hover: { size: 7 } },
      xaxis: {
        categories: [...(revenue?.labels ?? [])],
        labels: { ...AXIS_LABELS, rotate: revenuePeriod === 'month' ? -45 : 0, hideOverlappingLabels: true },
      },
      yaxis: { labels: AXIS_LABELS, min: 0, title: { text: 'GHS', style: { color: '#64748b', fontWeight: 500 } } },
      tooltip: { theme: 'light', y: { formatter: (v: number) => `GHS ${v.toFixed(2)}` } },
    }),
    [revenue?.labels, revenue?.values, revenuePeriod]
  );

  const forecastSeries = useMemo(
    () => [{ name: 'Expected Arrivals', data: charts?.occupancyForecast.values ?? [] }],
    [charts?.occupancyForecast.values]
  );

  const forecastOptions = useMemo<ApexOptions>(
    () => ({
      colors: [...PALETTES.forecast],
      chart: chartBase(280, 'line'),
      grid: GRID,
      stroke: { curve: 'stepline', width: 3 },
      markers: { size: 6, strokeWidth: 2, hover: { size: 8 } },
      dataLabels: countLabel(),
      xaxis: { categories: charts?.occupancyForecast.labels ?? [], labels: AXIS_LABELS },
      yaxis: { labels: AXIS_LABELS, min: 0, title: { text: 'Arrivals', style: { color: '#64748b', fontWeight: 500 } } },
      tooltip: { theme: 'light' },
    }),
    [charts?.occupancyForecast.labels]
  );

  const occupancySeries = useMemo(() => [occupancyPct, vacantPct], [occupancyPct, vacantPct]);

  const occupancyOptions = useMemo<ApexOptions>(
    () => ({
      chart: { ...chartBase(220, 'radialBar'), sparkline: { enabled: false } },
      colors: [...PALETTES.occupancy],
      plotOptions: {
        radialBar: {
          dataLabels: {
            name: { fontSize: '13px', color: '#64748b' },
            value: { fontSize: '20px', fontWeight: 800, color: '#0A1428', formatter: (v) => `${Math.round(Number(v))}%` },
            total: {
              show: true,
              label: 'Occupied',
              fontSize: '13px',
              color: '#64748b',
              formatter: () => `${occupancyPct}%`,
            },
          },
          hollow: { margin: 6, size: '38%' },
          track: { background: '#f1f5f9', strokeWidth: '100%' },
        },
      },
      stroke: { lineCap: 'round' },
      labels: ['Occupied', 'Vacant'],
    }),
    [occupancyPct]
  );

  const roomStatusOptions = useMemo<ApexOptions>(
    () => ({
      labels: charts?.roomStatus.labels ?? [],
      colors: [...PALETTES.roomStatus],
      chart: chartBase(280, 'polarArea'),
      stroke: { colors: ['#fff'], width: 2 },
      fill: { opacity: 0.85 },
      dataLabels: polarCountLabel(),
      legend: { position: 'bottom', fontWeight: 600 },
      yaxis: { show: false },
      tooltip: { theme: 'light' },
    }),
    [charts?.roomStatus.labels]
  );

  const reservationOptions = useMemo<ApexOptions>(
    () => ({
      labels: charts?.reservationStatus.labels ?? [],
      colors: [...PALETTES.reservationStatus],
      chart: chartBase(280, 'pie'),
      dataLabels: pieCountLabel(),
      legend: { position: 'bottom', fontWeight: 600 },
      stroke: { width: 2, colors: ['#fff'] },
      tooltip: { theme: 'light' },
    }),
    [charts?.reservationStatus.labels]
  );

  const housekeepingSeries = useMemo(
    () => [{ name: 'Tasks', data: [...(charts?.housekeeping.values ?? [])] }],
    [charts?.housekeeping.values]
  );

  const housekeepingOptions = useMemo<ApexOptions>(
    () => ({
      colors: [...PALETTES.housekeeping],
      chart: chartBase(280, 'bar'),
      grid: GRID,
      plotOptions: {
        bar: {
          distributed: true,
          borderRadius: 10,
          borderRadiusApplication: 'end',
          columnWidth: '48%',
          dataLabels: { position: 'top' },
        },
      },
      dataLabels: {
        enabled: true,
        offsetY: -18,
        style: { fontSize: '12px', fontWeight: 700, colors: ['#0A1428'] },
        formatter: (val: number) => (val > 0 ? `${val} tasks` : ''),
      },
      xaxis: { categories: charts?.housekeeping.labels ?? [], labels: AXIS_LABELS },
      yaxis: { labels: AXIS_LABELS, min: 0, title: { text: 'Tasks', style: { color: '#64748b', fontWeight: 500 } } },
      legend: { show: false },
      tooltip: { theme: 'light' },
    }),
    [charts?.housekeeping.labels, charts?.housekeeping.values]
  );

  const rankedRoomTypes = useMemo(() => {
    const labels = charts?.topRoomTypes.labels ?? [];
    const values = charts?.topRoomTypes.values ?? [];
    return labels
      .map((label, i) => ({ label, value: values[i] ?? 0 }))
      .sort((a, b) => b.value - a.value);
  }, [charts?.topRoomTypes.labels, charts?.topRoomTypes.values]);

  const topRoomTypesSeries = useMemo(
    () => [{ name: 'Bookings', data: rankedRoomTypes.map((row) => row.value) }],
    [rankedRoomTypes]
  );

  const topRoomTypesOptions = useMemo<ApexOptions>(
    () => ({
      colors: ['#6366F1'],
      chart: chartBase(280, 'bar'),
      grid: GRID,
      plotOptions: {
        bar: {
          horizontal: true,
          borderRadius: 8,
          barHeight: '62%',
          dataLabels: { position: 'right' },
        },
      },
      fill: {
        type: 'gradient',
        gradient: {
          shade: 'light',
          type: 'horizontal',
          shadeIntensity: 0.35,
          gradientToColors: ['#A5B4FC'],
          opacityFrom: 1,
          opacityTo: 0.95,
          stops: [0, 100],
        },
      },
      dataLabels: {
        enabled: true,
        offsetX: 28,
        style: { fontSize: '12px', fontWeight: 700, colors: ['#312E81'] },
        formatter: (val: number) => (val > 0 ? `${val} bookings` : ''),
      },
      xaxis: {
        categories: rankedRoomTypes.map((row) => row.label),
        labels: AXIS_LABELS,
      },
      yaxis: { labels: { ...AXIS_LABELS, maxWidth: 120 } },
      tooltip: { theme: 'light', y: { formatter: (v: number) => `${v} bookings` } },
    }),
    [rankedRoomTypes]
  );

  const roomsAttentionSeries = useMemo(
    () => [{ name: 'Rooms', data: charts?.roomsAttention.values ?? [] }],
    [charts?.roomsAttention.values]
  );

  const roomsAttentionOptions = useMemo<ApexOptions>(
    () => ({
      colors: [...PALETTES.roomsAttention],
      chart: chartBase(280, 'bar'),
      grid: GRID,
      plotOptions: {
        bar: { horizontal: true, distributed: true, borderRadius: 8, barHeight: '58%', dataLabels: { position: 'center' } },
      },
      dataLabels: {
        enabled: true,
        style: { fontSize: '12px', fontWeight: 700, colors: ['#fff'] },
        formatter: (val: number) => (val > 0 ? `${val} rooms` : ''),
      },
      xaxis: { categories: charts?.roomsAttention.labels ?? [], labels: AXIS_LABELS },
      yaxis: { labels: AXIS_LABELS },
      legend: { show: false },
      tooltip: { theme: 'light' },
    }),
    [charts?.roomsAttention.labels]
  );

  const paymentOptions = useMemo<ApexOptions>(
    () => ({
      labels: charts?.paymentMethods.labels ?? [],
      colors: [...PALETTES.paymentMethods],
      chart: chartBase(280, 'donut'),
      dataLabels: donutAmountLabel(),
      legend: { position: 'bottom', fontWeight: 600 },
      plotOptions: { pie: { donut: { size: '58%', labels: { show: true, total: { show: true, label: 'Total', formatter: (w) => `GHS ${w.globals.seriesTotals.reduce((a: number, b: number) => a + b, 0).toFixed(0)}` } } } } },
      stroke: { width: 0 },
      tooltip: { theme: 'light', y: { formatter: (v: number) => `GHS ${v.toFixed(2)}` } },
    }),
    [charts?.paymentMethods.labels]
  );

  const folioAgingSeries = useMemo(
    () => [{ name: 'Open Folios', data: charts?.folioAging.values ?? [] }],
    [charts?.folioAging.values]
  );

  const folioAgingOptions = useMemo<ApexOptions>(
    () => ({
      colors: [...PALETTES.folioAging],
      chart: chartBase(280, 'bar'),
      grid: GRID,
      plotOptions: {
        bar: {
          distributed: true,
          borderRadius: 10,
          borderRadiusApplication: 'end',
          columnWidth: '52%',
          dataLabels: { position: 'top' },
        },
      },
      dataLabels: {
        enabled: true,
        offsetY: -18,
        style: { fontSize: '12px', fontWeight: 700, colors: ['#92400e'] },
        formatter: (val: number) => (val > 0 ? `${val} folios` : ''),
      },
      xaxis: { categories: charts?.folioAging.labels ?? [], labels: AXIS_LABELS },
      yaxis: { labels: AXIS_LABELS, min: 0 },
      legend: { show: false },
      tooltip: { theme: 'light' },
    }),
    [charts?.folioAging.labels]
  );

  const guestRepeatOptions = useMemo<ApexOptions>(
    () => ({
      labels: charts?.guestRepeat.labels ?? [],
      colors: [...PALETTES.guestRepeat],
      chart: chartBase(280, 'donut'),
      dataLabels: pieCountLabel(),
      legend: { position: 'bottom', fontWeight: 600 },
      plotOptions: {
        pie: {
          startAngle: -90,
          endAngle: 90,
          offsetY: 12,
          donut: { size: '62%', labels: { show: true, total: { show: true, label: 'Guests', formatter: (w) => String(w.globals.seriesTotals.reduce((a: number, b: number) => a + b, 0)) } } },
        },
      },
      stroke: { width: 0 },
      tooltip: { theme: 'light' },
    }),
    [charts?.guestRepeat.labels]
  );

  const vipSeries = useMemo(
    () => [
      { name: 'VIP', data: [charts?.vipGuests.values[0] ?? 0] },
      { name: 'Regular', data: [charts?.vipGuests.values[1] ?? 0] },
    ],
    [charts?.vipGuests.values]
  );

  const vipOptions = useMemo<ApexOptions>(
    () => ({
      colors: [...PALETTES.vip],
      chart: chartBase(200, 'bar'),
      plotOptions: {
        bar: {
          horizontal: true,
          barHeight: '48%',
          stacked: true,
          borderRadius: 10,
          dataLabels: { position: 'center' },
        },
      },
      dataLabels: {
        enabled: true,
        style: { fontSize: '13px', fontWeight: 700, colors: ['#fff', '#fff'] },
        formatter: (val: number, opts) => {
          const total = (charts?.vipGuests.values[0] ?? 0) + (charts?.vipGuests.values[1] ?? 0);
          const pct = total > 0 ? Math.round((val / total) * 100) : 0;
          return val > 0 ? `${val} (${pct}%)` : '';
        },
      },
      xaxis: { categories: ['Guest mix'], labels: { show: false } },
      yaxis: { labels: { show: false } },
      grid: { show: false },
      legend: { position: 'bottom', fontWeight: 600 },
      tooltip: { theme: 'light' },
    }),
    [charts?.vipGuests.values]
  );

  const foodRevenueSeries = useMemo(
    () => [{ name: 'Food Revenue', data: [...(foodRevenue?.values ?? [])] }],
    [foodRevenue?.values]
  );

  const foodRevenueOptions = useMemo<ApexOptions>(
    () => ({
      colors: [...PALETTES.foodRevenue],
      chart: { ...chartBase(280, 'area'), id: `food-revenue-${foodPeriod}` },
      grid: GRID,
      dataLabels: currencyLabel(foodPeriod === 'month' ? 5 : 1),
      stroke: { curve: 'smooth', width: 3 },
      fill: {
        type: 'gradient',
        gradient: { shadeIntensity: 1, opacityFrom: 0.5, opacityTo: 0.08, stops: [0, 90, 100] },
      },
      markers: { size: foodPeriod === 'week' ? 5 : 0, strokeWidth: 2, hover: { size: 7 } },
      xaxis: {
        categories: [...(foodRevenue?.labels ?? [])],
        labels: { ...AXIS_LABELS, rotate: foodPeriod === 'month' ? -45 : 0, hideOverlappingLabels: true },
      },
      yaxis: { labels: AXIS_LABELS, min: 0, title: { text: 'GHS', style: { color: '#64748b', fontWeight: 500 } } },
      tooltip: { theme: 'light', y: { formatter: (v: number) => `GHS ${v.toFixed(2)}` } },
    }),
    [foodRevenue?.labels, foodRevenue?.values, foodPeriod]
  );

  const foodOrdersSeries = useMemo(
    () => [{ name: 'Orders', data: [...(foodOrders?.values ?? [])] }],
    [foodOrders?.values]
  );

  const foodOrdersOptions = useMemo<ApexOptions>(
    () => ({
      colors: [...PALETTES.foodOrders],
      chart: { ...chartBase(280, 'bar'), id: `food-orders-${foodPeriod}` },
      grid: GRID,
      plotOptions: {
        bar: {
          borderRadius: 8,
          borderRadiusApplication: 'end',
          columnWidth: foodPeriod === 'week' ? '58%' : '78%',
          dataLabels: { position: 'top' },
        },
      },
      dataLabels: countLabel(),
      xaxis: {
        categories: [...(foodOrders?.labels ?? [])],
        labels: { ...AXIS_LABELS, rotate: foodPeriod === 'month' ? -45 : 0, hideOverlappingLabels: true },
      },
      yaxis: { labels: AXIS_LABELS, min: 0, forceNiceScale: true, title: { text: 'Orders', style: { color: '#64748b', fontWeight: 500 } } },
      tooltip: { theme: 'light' },
    }),
    [foodOrders?.labels, foodOrders?.values, foodPeriod]
  );

  const foodStatusOptions = useMemo<ApexOptions>(
    () => ({
      labels: charts?.foodOrderStatus.labels ?? [],
      colors: [...PALETTES.foodStatus],
      chart: chartBase(280, 'donut'),
      dataLabels: pieCountLabel(),
      legend: { position: 'bottom', fontWeight: 600 },
      plotOptions: {
        pie: {
          donut: {
            size: '62%',
            labels: {
              show: true,
              total: {
                show: true,
                label: 'Orders',
                formatter: (w) => String(w.globals.seriesTotals.reduce((a: number, b: number) => a + b, 0)),
              },
            },
          },
        },
      },
      stroke: { width: 2, colors: ['#fff'] },
      tooltip: { theme: 'light' },
    }),
    [charts?.foodOrderStatus.labels]
  );

  const foodPaymentOptions = useMemo<ApexOptions>(
    () => ({
      labels: charts?.foodPaymentMix.labels ?? [],
      colors: [...PALETTES.foodPayment],
      chart: chartBase(280, 'donut'),
      dataLabels: pieCountLabel(),
      legend: { position: 'bottom', fontWeight: 600 },
      plotOptions: {
        pie: {
          donut: {
            size: '62%',
            labels: {
              show: true,
              total: {
                show: true,
                label: 'Orders',
                formatter: (w) => String(w.globals.seriesTotals.reduce((a: number, b: number) => a + b, 0)),
              },
            },
          },
        },
      },
      stroke: { width: 2, colors: ['#fff'] },
      tooltip: { theme: 'light' },
    }),
    [charts?.foodPaymentMix.labels]
  );

  const kpiRow = (
    <div className="row g-3 mb-3 premium-dashboard-row premium-dashboard-row--kpi">
      {[
        {
          label: 'Food orders',
          value: String(foodOrdersToday),
          suffix: undefined as string | undefined,
          icon: 'ti-tools-kitchen-2',
          hint:
            openKitchenOrders > 0
              ? `${openKitchenOrders} still in kitchen`
              : 'Restaurant & room service · all time',
          featured: false,
        },
        {
          label: 'Food revenue',
          value: formatMoney(foodRevenueToday),
          suffix: 'GHS',
          icon: 'ti-meat',
          hint: 'Paid F&B orders · all time',
          featured: true,
        },
        {
          label: 'Unpaid Cash / COD',
          value: formatMoney(unpaidCashCod),
          suffix: 'GHS',
          icon: 'ti-cash',
          hint: 'Awaiting Mark cash paid',
          featured: false,
        },
        {
          label: 'Guests',
          value: String(guestCount),
          suffix: undefined as string | undefined,
          icon: 'ti-users',
          hint: `${reservationCount} stays booked · all time`,
          featured: false,
        },
      ].map((kpi) => (
        <div key={kpi.label} className="col-md-6 col-xl-3">
          <StatCard
            label={kpi.label}
            value={kpi.value}
            suffix={kpi.suffix}
            icon={kpi.icon}
            featured={Boolean(kpi.featured)}
            tone={kpi.featured ? 'primary' : 'warning'}
            caption={kpi.hint}
          />
        </div>
      ))}
    </div>
  );

  if (!charts) {
    return (
      <>
        {kpiRow}
        <PremiumCard>
          <ChartEmpty message="Chart data unavailable." />
        </PremiumCard>
      </>
    );
  }

  return (
    <>
      {kpiRow}

      <div className="row g-3 mb-3 premium-dashboard-row">
        <div className="col-12 col-lg-6">
          <ChartPanel
            title="Food Revenue Trend"
            delay={60}
            actions={<PeriodToggle value={foodPeriod} onChange={setFoodPeriod} />}
          >
            {hasData(foodRevenue?.values ?? []) ? (
              <RemountingChart
                remountKey={`food-rev-${foodPeriod}-${foodRevenue?.labels.length ?? 0}`}
                options={foodRevenueOptions}
                series={foodRevenueSeries}
                type="area"
                height={280}
              />
            ) : (
              <ChartEmpty message="No paid food orders for this period." />
            )}
          </ChartPanel>
        </div>
        <div className="col-12 col-lg-6">
          <ChartPanel
            title="Food Orders Volume"
            delay={100}
            actions={<PeriodToggle value={foodPeriod} onChange={setFoodPeriod} />}
          >
            {hasData(foodOrders?.values ?? []) ? (
              <RemountingChart
                remountKey={`food-ord-${foodPeriod}-${foodOrders?.labels.length ?? 0}`}
                options={foodOrdersOptions}
                series={foodOrdersSeries}
                type="bar"
                height={280}
              />
            ) : (
              <ChartEmpty message="No restaurant orders for this period." />
            )}
          </ChartPanel>
        </div>
      </div>

      <div className="row g-3 mb-3 premium-dashboard-row">
        <div className="col-12 col-md-6">
          <ChartPanel title="Kitchen Order Status (7 days)" delay={80}>
            {hasData(charts.foodOrderStatus?.values ?? []) ? (
              <Chart options={foodStatusOptions} series={charts.foodOrderStatus.values} type="donut" height={280} />
            ) : (
              <ChartEmpty message="No kitchen orders in the last 7 days." />
            )}
          </ChartPanel>
        </div>
        <div className="col-12 col-md-6">
          <ChartPanel title="Food Payment Mix (30 days)" delay={120}>
            {hasData(charts.foodPaymentMix?.values ?? []) ? (
              <Chart options={foodPaymentOptions} series={charts.foodPaymentMix.values} type="donut" height={280} />
            ) : (
              <ChartEmpty message="No food payment data in the last 30 days." />
            )}
          </ChartPanel>
        </div>
      </div>

      <div className="row g-3 mb-3 premium-dashboard-row">
        <div className="col-12 col-lg-7">
          <ChartPanel
            title="Arrivals vs Departures"
            delay={80}
            actions={<PeriodToggle value={trafficPeriod} onChange={setTrafficPeriod} />}
          >
            <RemountingChart
              remountKey={`traffic-${trafficPeriod}-${traffic?.labels.length ?? 0}`}
              options={trafficOptions}
              series={trafficSeries}
              type="bar"
              height={300}
            />
          </ChartPanel>
        </div>

        <div className="col-12 col-lg-5">
          <ChartPanel title="Property Overview" delay={140}>
            <h3 className="h6 text-secondary mb-3">Room occupancy gauge</h3>
            <div className="row align-items-center g-3">
              <div className="col-sm-6">
                <Chart options={occupancyOptions} series={occupancySeries} type="radialBar" height={220} />
              </div>
              <div className="col-sm-6">
                <div className="row g-3 text-center">
                  <div className="col-6">
                    <h2 className="mb-1 fs-4 fw-bold">{occupiedRooms}</h2>
                    <p className="text-secondary mb-1 small">Occupied</p>
                    <span className="premium-badge premium-badge--primary">{occupancyPct}%</span>
                  </div>
                  <div className="col-6">
                    <h2 className="mb-1 fs-4 fw-bold">{Math.max(0, totalRooms - occupiedRooms)}</h2>
                    <p className="text-secondary mb-1 small">Vacant</p>
                    <span className="premium-badge premium-badge--success">{vacantPct}%</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="row text-center border-top mt-3 pt-3 g-2">
              <div className="col-4">
                <h3 className="fw-bold mb-1 fs-5">{totalRooms}</h3>
                <small className="text-secondary">Rooms</small>
              </div>
              <div className="col-4 border-start border-end">
                <h3 className="fw-bold mb-1 fs-5">{guestCount || '—'}</h3>
                <small className="text-secondary">Guests</small>
              </div>
              <div className="col-4">
                <h3 className="fw-bold mb-1 fs-5">{reservationCount || '—'}</h3>
                <small className="text-secondary">Bookings</small>
              </div>
            </div>
          </ChartPanel>
        </div>
      </div>

      <div className="row g-3 mb-3 premium-dashboard-row">
        <div className="col-12 col-lg-6">
          <ChartPanel
            title="Revenue Trend"
            delay={160}
            actions={<PeriodToggle value={revenuePeriod} onChange={setRevenuePeriod} />}
          >
            {hasData(revenue?.values ?? []) ? (
              <RemountingChart
                remountKey={`revenue-${revenuePeriod}-${revenue?.labels.length ?? 0}`}
                options={revenueOptions}
                series={revenueSeries}
                type="area"
                height={280}
              />
            ) : (
              <ChartEmpty message="No payment data for this period." />
            )}
          </ChartPanel>
        </div>
        <div className="col-12 col-lg-6">
          <ChartPanel title="Occupancy Forecast (14 days)" delay={200}>
            {hasData(charts.occupancyForecast.values) ? (
              <Chart options={forecastOptions} series={forecastSeries} type="line" height={280} />
            ) : (
              <ChartEmpty message="No upcoming arrivals scheduled." />
            )}
          </ChartPanel>
        </div>
      </div>

      <div className="row g-3 mb-3 premium-dashboard-row">
        <div className="col-12 col-md-6 col-xl-3">
          <ChartPanel title="Room Status" delay={80}>
            {hasData(charts.roomStatus.values) ? (
              <Chart options={roomStatusOptions} series={charts.roomStatus.values} type="polarArea" height={280} />
            ) : (
              <ChartEmpty message="No room data." />
            )}
          </ChartPanel>
        </div>
        <div className="col-12 col-md-6 col-xl-3">
          <ChartPanel title="Reservation Status" delay={120}>
            {hasData(charts.reservationStatus.values) ? (
              <Chart options={reservationOptions} series={charts.reservationStatus.values} type="pie" height={280} />
            ) : (
              <ChartEmpty message="No reservations yet." />
            )}
          </ChartPanel>
        </div>
        <div className="col-12 col-md-6 col-xl-3">
          <ChartPanel title="Housekeeping Workload" delay={160}>
            {hasData(charts.housekeeping.values) ? (
              <Chart options={housekeepingOptions} series={housekeepingSeries} type="bar" height={280} />
            ) : (
              <ChartEmpty message="No housekeeping tasks." />
            )}
          </ChartPanel>
        </div>
        <div className="col-12 col-md-6 col-xl-3">
          <ChartPanel title="Rooms Needing Attention" delay={200}>
            {hasData(charts.roomsAttention.values) ? (
              <Chart options={roomsAttentionOptions} series={roomsAttentionSeries} type="bar" height={280} />
            ) : (
              <ChartEmpty message="All rooms are in good standing." />
            )}
          </ChartPanel>
        </div>
      </div>

      <div className="row g-3 mb-3 premium-dashboard-row">
        <div className="col-12 col-md-6 col-xl-4">
          <ChartPanel title="Payment Methods (30 days)" delay={80}>
            {hasData(charts.paymentMethods.values) ? (
              <Chart options={paymentOptions} series={charts.paymentMethods.values} type="donut" height={280} />
            ) : (
              <ChartEmpty message="No payments in the last 30 days." />
            )}
          </ChartPanel>
        </div>
        <div className="col-12 col-md-6 col-xl-4">
          <ChartPanel title="Top Room Types Booked" delay={120}>
            {hasData(charts.topRoomTypes.values) ? (
              <Chart options={topRoomTypesOptions} series={topRoomTypesSeries} type="bar" height={280} />
            ) : (
              <ChartEmpty message="No room type bookings yet." />
            )}
          </ChartPanel>
        </div>
        <div className="col-12 col-md-6 col-xl-4">
          <ChartPanel title="Open Folio Balance Aging" delay={160}>
            {hasData(charts.folioAging.values) ? (
              <Chart options={folioAgingOptions} series={folioAgingSeries} type="bar" height={280} />
            ) : (
              <ChartEmpty message="No open folio balances." />
            )}
          </ChartPanel>
        </div>
      </div>

      <div className="row g-3 mb-3 premium-dashboard-row">
        <div className="col-12 col-md-6">
          <ChartPanel title="Guest Repeat Rate" delay={80}>
            {hasData(charts.guestRepeat.values) ? (
              <Chart options={guestRepeatOptions} series={charts.guestRepeat.values} type="donut" height={280} />
            ) : (
              <ChartEmpty message="No guest history yet." />
            )}
          </ChartPanel>
        </div>
        <div className="col-12 col-md-6">
          <ChartPanel title="VIP vs Regular Guests" delay={120}>
            {hasData(charts.vipGuests.values) ? (
              <Chart options={vipOptions} series={vipSeries} type="bar" height={220} />
            ) : (
              <ChartEmpty message="No guests on file." />
            )}
          </ChartPanel>
        </div>
      </div>
    </>
  );
}
