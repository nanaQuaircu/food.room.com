'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useToast } from '@/components/ui/ToastProvider';
import {
  PremiumPage,
  PageHeader,
  PremiumCard,
  StatCard,
  LoadingState,
  EmptyState,
} from '@/components/ui/premium';
import PlatformCharts from '@/components/platform/PlatformCharts';
import ProvisionHotelForm from '@/components/platform/ProvisionHotelForm';
import PlatformHotelsTable from '@/components/platform/PlatformHotelsTable';
import type { PlatformDashboardStats } from '@/lib/platform/platform-stats';

function formatMoney(amount: number, currency: string) {
  return Number(amount).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

export default function PlatformDashboard({ userName }: { userName: string }) {
  const toast = useToast();
  const [stats, setStats] = useState<PlatformDashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadStats() {
    try {
      const res = await fetch('/api/platform/stats');
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        throw new Error('Unexpected response from platform API.');
      }
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || 'Unable to load platform stats.');
      }
      setStats(json.data);
    } catch (err) {
      toast.error('Dashboard unavailable', err instanceof Error ? err.message : 'Please refresh and try again.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadStats();
  }, []);

  if (loading) {
    return (
      <PremiumPage>
        <PremiumCard>
          <LoadingState label="Loading platform dashboard…" />
        </PremiumCard>
      </PremiumPage>
    );
  }

  if (!stats) {
    return (
      <PremiumPage>
        <PremiumCard>
          <EmptyState message="Could not load platform statistics." icon="ti-alert-circle" />
          <div className="text-center mt-3">
            <button
              type="button"
              className="btn btn-premium btn-sm"
              onClick={() => {
                setLoading(true);
                void loadStats();
              }}
            >
              Retry
            </button>
          </div>
        </PremiumCard>
      </PremiumPage>
    );
  }

  const signupsThisMonth =
    stats.charts.signups.values[stats.charts.signups.values.length - 1] ?? 0;
  const mrrCurrency = stats.mrr.currency;

  return (
    <PremiumPage>
      <PageHeader
        variant="platform"
        title="Platform Dashboard"
        subtitle="Manage tenant hotels, subscriptions, and platform health."
        icon="ti-shield-check"
        actions={
          <Link href="/platform/hotels?add=1" className="btn btn-premium">
            <i className="ti ti-building me-1" />
            Add Hotel
          </Link>
        }
      />

      <div className="premium-hero">
        <h2 className="premium-hero__title">Platform Overview</h2>
        <p className="premium-hero__text">
          {stats.total} hotels registered · {stats.payingTenants} paying tenants · {stats.trial} on
          trial · MRR {mrrCurrency} {formatMoney(stats.mrr.amount, mrrCurrency)}
        </p>
      </div>

      <div className="row g-3 mb-3 premium-dashboard-row">
        <div className="col-md-6 col-xl-3">
          <StatCard
            label="Total Hotels"
            value={stats.total}
            icon="ti-building"
            tone="primary"
            featured
            caption={`${stats.active} active · ${stats.trial} trial`}
          />
        </div>
        <div className="col-md-6 col-xl-3">
          <StatCard
            label="Active"
            value={stats.active}
            icon="ti-circle-check"
            tone="success"
            caption={stats.active === 1 ? '1 live tenant' : `${stats.active} live tenants`}
          />
        </div>
        <div className="col-md-6 col-xl-3">
          <StatCard
            label="On Trial"
            value={stats.trial}
            icon="ti-clock"
            tone="primary"
            featured
            caption={stats.trial === 1 ? '1 hotel evaluating' : `${stats.trial} hotels evaluating`}
          />
        </div>
        <div className="col-md-6 col-xl-3">
          <StatCard
            label="Suspended"
            value={stats.suspended}
            icon="ti-ban"
            tone="warning"
            caption={stats.suspended === 0 ? 'No suspended tenants' : `${stats.suspended} suspended`}
          />
        </div>
      </div>

      <div className="row g-3 mb-3 premium-dashboard-row premium-dashboard-row--kpi">
        <div className="col-md-6 col-xl-3">
          <StatCard
            label="Estimated MRR"
            value={formatMoney(stats.mrr.amount, mrrCurrency)}
            suffix={mrrCurrency}
            icon="ti-currency-dollar"
            tone="warning"
            caption="Monthly recurring revenue"
          />
        </div>
        <div className="col-md-6 col-xl-3">
          <StatCard
            label="Paying Tenants"
            value={stats.payingTenants}
            icon="ti-credit-card"
            tone="primary"
            featured
            caption={
              stats.payingTenants === 1 ? '1 active subscription' : `${stats.payingTenants} active subscriptions`
            }
          />
        </div>
        <div className="col-md-6 col-xl-3">
          <StatCard
            label="Trials Expiring (14d)"
            value={stats.trialExpiryCount}
            icon="ti-alert-triangle"
            tone="warning"
            caption={
              stats.trialExpiryCount === 0
                ? 'No trials ending soon'
                : `${stats.trialExpiryCount} need follow-up`
            }
          />
        </div>
        <div className="col-md-6 col-xl-3">
          <StatCard
            label="Signups This Month"
            value={signupsThisMonth}
            icon="ti-trending-up"
            tone="primary"
            featured
            caption="New hotels this month"
          />
        </div>
      </div>

      <PlatformCharts charts={stats.charts} />

      <div className="row g-3 premium-dashboard-row">
        <div className="col-lg-6">
          <ProvisionHotelForm onSuccess={loadStats} />
        </div>

        <div className="col-lg-6">
          <PremiumCard
            fill
            title="Recent hotels"
            flush
            actions={
              <Link href="/platform/hotels" className="small text-decoration-none fw-medium">
                View all
              </Link>
            }
          >
            {stats.recent.length === 0 ? (
              <EmptyState message="No hotels yet." icon="ti-building" />
            ) : (
              <PlatformHotelsTable hotels={stats.recent} showCreated onChanged={loadStats} />
            )}
          </PremiumCard>
        </div>
      </div>
    </PremiumPage>
  );
}
