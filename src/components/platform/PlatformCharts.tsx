'use client';

import dynamic from 'next/dynamic';
import { useMemo, type CSSProperties, type ReactNode } from 'react';
import type { ApexOptions } from 'apexcharts';
import { PremiumCard } from '@/components/ui/premium';
import type { PlatformDashboardStats } from '@/lib/platform/platform-stats';
import { AXIS_LABELS, GRID, chartBase } from '@/lib/charts/apex-helpers';

const Chart = dynamic(() => import('react-apexcharts'), { ssr: false });

const PALETTES = {
  companyStatus: ['#3B6D11', '#C6A34D', '#791F1F'],
  signups: ['#C6A34D'],
  plans: ['#F0B100', '#3B6D11'],
  subscription: ['#3B6D11', '#C6A34D', '#0A1428', '#791F1F', '#1F3A63'],
} as const;

function ChartPanel({
  title,
  subtitle,
  children,
  delay = 0,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  delay?: number;
}) {
  return (
    <PremiumCard
      fill
      title={title}
      className="premium-chart-panel"
      style={{ animationDelay: `${delay}ms` } as CSSProperties}
    >
      {subtitle ? <p className="small text-muted mb-3 mt-n2">{subtitle}</p> : null}
      <div className="premium-chart-canvas">{children}</div>
    </PremiumCard>
  );
}

export default function PlatformCharts({ charts }: { charts: PlatformDashboardStats['charts'] }) {
  const companyStatusOptions = useMemo<ApexOptions>(
    () => ({
      colors: [...PALETTES.companyStatus],
      chart: chartBase(260, 'donut'),
      labels: charts.companyStatus.labels,
      legend: { position: 'bottom', fontWeight: 600 },
      dataLabels: { enabled: false },
      stroke: { width: 0 },
      tooltip: { theme: 'light' },
    }),
    [charts.companyStatus.labels]
  );

  const signupsOptions = useMemo<ApexOptions>(
    () => ({
      colors: [...PALETTES.signups],
      chart: { ...chartBase(300, 'bar'), toolbar: { show: false } },
      grid: GRID,
      plotOptions: {
        bar: {
          borderRadius: 8,
          borderRadiusApplication: 'end',
          columnWidth: '55%',
        },
      },
      dataLabels: { enabled: false },
      xaxis: { categories: charts.signups.labels, labels: AXIS_LABELS },
      yaxis: { labels: AXIS_LABELS, min: 0, forceNiceScale: true },
      tooltip: { theme: 'light' },
    }),
    [charts.signups.labels]
  );

  const plansOptions = useMemo<ApexOptions>(
    () => ({
      colors: [...PALETTES.plans],
      chart: { ...chartBase(300, 'bar'), stacked: true, stackType: '100%', toolbar: { show: false } },
      grid: GRID,
      plotOptions: { bar: { borderRadius: 8, horizontal: true } },
      dataLabels: { enabled: false },
      xaxis: { categories: charts.plansByTier.labels, labels: AXIS_LABELS },
      legend: { position: 'bottom', fontWeight: 600 },
      tooltip: { theme: 'light' },
    }),
    [charts.plansByTier.labels]
  );

  const subscriptionOptions = useMemo<ApexOptions>(
    () => ({
      colors: [...PALETTES.subscription],
      chart: chartBase(260, 'donut'),
      labels: charts.subscriptionStatus.labels,
      legend: { position: 'bottom', fontWeight: 600 },
      dataLabels: { enabled: false },
      stroke: { width: 0 },
      tooltip: { theme: 'light' },
    }),
    [charts.subscriptionStatus.labels]
  );

  return (
    <>
      <div className="row g-3 mb-3 premium-dashboard-row">
        <div className="col-12 col-lg-6">
          <ChartPanel title="Company status mix" delay={80}>
            <Chart
              options={companyStatusOptions}
              series={charts.companyStatus.values}
              type="donut"
              height={260}
            />
          </ChartPanel>
        </div>
        <div className="col-12 col-lg-6">
          <ChartPanel title="New hotel signups (last 6 months)" delay={140}>
            <Chart
              options={signupsOptions}
              series={[{ name: 'Signups', data: charts.signups.values }]}
              type="bar"
              height={300}
            />
          </ChartPanel>
        </div>
      </div>

      <div className="row g-3 mb-3 premium-dashboard-row">
        <div className="col-12 col-lg-6">
          <ChartPanel
            title="Tenants by plan tier"
            subtitle="Trials are assigned a plan (default Starter) and counted separately from paying tenants."
            delay={160}
          >
            <Chart
              options={plansOptions}
              series={[
                { name: 'Trialing', data: charts.plansByTier.trialing },
                { name: 'Active (paying)', data: charts.plansByTier.active },
              ]}
              type="bar"
              height={300}
            />
          </ChartPanel>
        </div>
        <div className="col-12 col-lg-6">
          <ChartPanel title="Subscription status" delay={200}>
            <Chart
              options={subscriptionOptions}
              series={charts.subscriptionStatus.values}
              type="donut"
              height={260}
            />
          </ChartPanel>
        </div>
      </div>
    </>
  );
}
