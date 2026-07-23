'use client';

import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useState } from 'react';
import { useToast } from '@/components/ui/ToastProvider';
import {
  PremiumPage,
  PremiumCard,
  StatCard,
  LoadingState,
  EmptyState,
  StatusBadge,
} from '@/components/ui/premium';
import { fetchApi, peekApiCache } from '@/lib/client/fetch-api';
import type { DashboardChartData } from '@/lib/services/dashboard-analytics';

const DashboardCharts = dynamic(() => import('@/components/dashboard/DashboardCharts'), {
  ssr: false,
  loading: () => (
    <PremiumCard>
      <LoadingState label="Loading charts…" />
    </PremiumCard>
  ),
});

type DashboardStats = {
  occupancy: number;
  totalRooms: number;
  occupiedRooms: number;
  arrivalsToday: number;
  departuresToday: number;
  revenueToday: number;
  totalRevenue: number;
  guestCount: number;
  reservationCount: number;
  adr: number;
  revpar: number;
  revenue30Total: number;
  foodOrdersToday: number;
  foodRevenueToday: number;
  unpaidCashCod: number;
  foodRevenue30d: number;
  openKitchenOrders: number;
  charts: DashboardChartData | null;
  recentReservations: Array<{
    id: number;
    confirmation_code: string;
    status: string;
    check_in_date: string;
    check_out_date: string;
    total_amount: number;
    first_name: string;
    last_name: string;
    room_number: string | null;
  }>;
  roomsNeedingAttention: Array<{
    id: number;
    room_number: string;
    status: string;
    floor: string | null;
  }>;
};

function roomStatusIcon(status: string) {
  if (status === 'dirty' || status === 'clean') return 'ti-brush';
  return 'ti-tool';
}

function roomStatusTone(status: string) {
  return status === 'dirty' || status === 'clean' ? 'dirty' : 'ooo';
}

function initialDashboardStats() {
  const cached = peekApiCache<DashboardStats>('/api/dashboard/stats');
  return cached?.success ? (cached.data ?? null) : null;
}

export default function DashboardLive() {
  const toast = useToast();
  const seeded = initialDashboardStats();
  const [stats, setStats] = useState<DashboardStats | null>(seeded);
  const [loading, setLoading] = useState(!seeded);

  const loadStats = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    try {
      const res = await fetchApi<DashboardStats>('/api/dashboard/stats');
      if (!res.success) {
        toast.error('Failed to load dashboard', res.message);
        return;
      }
      setStats(res.data ?? null);
    } catch {
      toast.error('Failed to load dashboard');
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void loadStats({ silent: Boolean(seeded) });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hydrate once; silent if cache seeded
  }, [loadStats]);

  if (loading && !stats) {
    return (
      <PremiumPage>
        <PremiumCard>
          <LoadingState label="Loading dashboard…" />
        </PremiumCard>
      </PremiumPage>
    );
  }

  const s = stats;
  const totalRooms = s?.totalRooms ?? 0;
  const occupiedRooms = s?.occupiedRooms ?? 0;
  const arrivals = s?.arrivalsToday ?? 0;
  const departures = s?.departuresToday ?? 0;
  const totalRevenue = Number(s?.totalRevenue ?? 0);
  const occupancy = s?.occupancy ?? 0;

  function formatMoney(value: number, decimals = 0) {
    return Number(value).toLocaleString(undefined, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  }

  return (
    <PremiumPage>
      <div className="premium-hero premium-hero--light">
        <h2 className="premium-hero__title">Operations overview</h2>
        <p className="premium-hero__text">
          {occupiedRooms} of {totalRooms} rooms occupied · {arrivals} stays · {departures} checked out
          · {formatMoney(totalRevenue)} GHS room revenue
        </p>
      </div>

      <div className="row g-3 mb-3 premium-dashboard-row">
        <div className="col-md-6 col-xl-3">
          <StatCard
            label="Occupancy"
            value={occupancy}
            suffix="%"
            icon="ti-building"
            tone="primary"
            featured
            caption={`${occupiedRooms} of ${totalRooms} rooms · live`}
          />
        </div>
        <div className="col-md-6 col-xl-3">
          <StatCard
            label="Total stays"
            value={arrivals}
            icon="ti-door-enter"
            tone="success"
            caption={arrivals === 1 ? '1 booking all time' : `${arrivals} bookings all time`}
          />
        </div>
        <div className="col-md-6 col-xl-3">
          <StatCard
            label="Checked out"
            value={departures}
            icon="ti-door-exit"
            tone="warning"
            caption={departures === 1 ? '1 completed stay' : `${departures} completed stays`}
          />
        </div>
        <div className="col-md-6 col-xl-3">
          <StatCard
            label="Room revenue"
            value={formatMoney(totalRevenue)}
            suffix="GHS"
            icon="ti-currency-dollar"
            tone="warning"
            caption="All folio payments collected"
          />
        </div>
      </div>

      <DashboardCharts
        totalRooms={s?.totalRooms}
        occupiedRooms={s?.occupiedRooms}
        revenueToday={s?.revenueToday}
        totalRevenue={s?.totalRevenue}
        revenue30Total={s?.revenue30Total}
        guestCount={s?.guestCount}
        reservationCount={s?.reservationCount}
        adr={s?.adr}
        revpar={s?.revpar}
        foodOrdersToday={s?.foodOrdersToday}
        foodRevenueToday={s?.foodRevenueToday}
        unpaidCashCod={s?.unpaidCashCod}
        foodRevenue30d={s?.foodRevenue30d}
        openKitchenOrders={s?.openKitchenOrders}
        charts={s?.charts}
      />

      <div className="row g-3 premium-dashboard-row">
        <div className="col-lg-6">
          <PremiumCard
            fill
            title="Rooms Needing Attention"
            actions={
              <Link href="/housekeeping" className="small text-decoration-none fw-medium">
                View all
              </Link>
            }
          >
            {(s?.roomsNeedingAttention ?? []).length === 0 ? (
              <EmptyState message="All rooms are in good standing." icon="ti-circle-check" />
            ) : (
              <div className="dashboard-card-scroll">
                <div className="premium-feed">
                  {s?.roomsNeedingAttention.map((room) => (
                  <div key={room.id} className="premium-feed__item">
                    <div className={`premium-feed__icon premium-feed__icon--${roomStatusTone(room.status)}`}>
                      <i className={`ti ${roomStatusIcon(room.status)}`} />
                    </div>
                    <div className="flex-grow-1 min-w-0">
                      <p className="mb-0 fw-semibold">Room {room.room_number}</p>
                      <small className="text-muted">Floor {room.floor || '—'}</small>
                    </div>
                    <StatusBadge status={room.status} />
                  </div>
                ))}
                </div>
              </div>
            )}
          </PremiumCard>
        </div>

        <div className="col-lg-6">
          <PremiumCard
            fill
            flush
            title="Recent Reservations"
            actions={
              <Link href="/reservations" className="small text-decoration-none fw-medium">
                View all
              </Link>
            }
          >
            {(s?.recentReservations ?? []).length === 0 ? (
              <div className="p-4">
                <EmptyState message="No reservations yet." icon="ti-calendar" />
              </div>
            ) : (
              <div className="dashboard-card-scroll">
                <div className="premium-reservation-row premium-reservation-row--header d-none d-md-grid text-uppercase small text-muted fw-semibold">
                  <span>Guest</span>
                  <span>Room</span>
                  <span>Total</span>
                  <span>Status</span>
                </div>
                {s?.recentReservations.map((r) => (
                  <div key={r.id} className="premium-reservation-row">
                    <div className="premium-reservation-row__guest">
                      <p className="premium-reservation-row__name mb-0">
                        {r.first_name} {r.last_name}
                      </p>
                      <span className="premium-reservation-row__code">{r.confirmation_code}</span>
                    </div>
                    <div className="premium-reservation-row__meta">
                      <span className="d-md-none text-muted me-1">Room</span>
                      {r.room_number || '—'}
                    </div>
                    <div className="premium-reservation-row__meta fw-medium">
                      <span className="d-md-none text-muted me-1">Total</span>
                      {Number(r.total_amount).toFixed(2)}
                    </div>
                    <div>
                      <StatusBadge status={r.status} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </PremiumCard>
        </div>
      </div>
    </PremiumPage>
  );
}
