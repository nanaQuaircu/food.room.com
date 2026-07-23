'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useToast } from '@/components/ui/ToastProvider';
import {
  PremiumPage,
  PageHeader,
  PremiumCard,
  LoadingState,
  EmptyState,
} from '@/components/ui/premium';
import TablePagination, { paginateSlice } from '@/components/ui/TablePagination';
import { fetchApi } from '@/lib/client/fetch-api';
import { useTenantSession } from '@/components/providers/TenantSessionProvider';
import { ATTENDANCE_ADMIN_ROLES, hasAnyRole } from '@/lib/roles';

const PAGE_SIZE = 15;

type TodayRecord = {
  id: number;
  clock_in_at: string | null;
  clock_out_at: string | null;
};

type TodayRow = {
  user_id: number;
  user_name: string;
  clock_in_at: string | null;
  clock_out_at: string | null;
};

type HistoryRow = {
  id: number;
  user_id: number;
  user_name: string;
  work_date: string;
  clock_in_at: string | null;
  clock_out_at: string | null;
};

type StaffOption = { id: number; name: string };

type Geofence = {
  geofence_enabled: boolean;
  attendance_radius_m: number | null;
};

function getCurrentPosition(): Promise<{ latitude: number; longitude: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not supported on this device.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        }),
      (err) => reject(new Error(err.message || 'Unable to get your location.')),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  });
}

function formatClockTime(value: Date) {
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  }).format(value);
}

function formatClockDate(value: Date) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(value);
}

function formatRecordTime(iso: string | null) {
  if (!iso) return '-';
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(iso));
}

function statusMessage(record: TodayRecord | null) {
  if (!record?.clock_in_at) return 'Not clocked in today.';
  if (!record.clock_out_at) return `Clocked in at ${formatRecordTime(record.clock_in_at)}`;
  return `Clocked in at ${formatRecordTime(record.clock_in_at)} · Out at ${formatRecordTime(record.clock_out_at)}`;
}

export default function AttendanceModule() {
  const toast = useToast();
  const session = useTenantSession();
  const isAdmin = hasAnyRole(session.userRole, ATTENDANCE_ADMIN_ROLES);

  const [now, setNow] = useState(() => new Date());
  const [loadingToday, setLoadingToday] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [acting, setActing] = useState<'in' | 'out' | null>(null);
  const [record, setRecord] = useState<TodayRecord | null>(null);
  const [geofence, setGeofence] = useState<Geofence>({ geofence_enabled: false, attendance_radius_m: null });
  const [todayRows, setTodayRows] = useState<TodayRow[]>([]);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({ user_id: '', from: '', to: '' });

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const loadToday = useCallback(async () => {
    setLoadingToday(true);
    try {
      const res = await fetchApi<{
        record: TodayRecord | null;
        today: TodayRow[];
        geofence?: Geofence;
      }>('/api/attendance?scope=today', { skipCache: true });
      if (!res.success) {
        toast.error('Failed to load attendance', res.message);
        return;
      }
      setRecord(res.data?.record ?? null);
      setTodayRows(res.data?.today ?? []);
      setGeofence(
        res.data?.geofence ?? { geofence_enabled: false, attendance_radius_m: null }
      );
    } catch {
      toast.error('Failed to load attendance');
    } finally {
      setLoadingToday(false);
    }
  }, [toast]);

  const [appliedFilters, setAppliedFilters] = useState({ user_id: '', from: '', to: '', search: '' });

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const params = new URLSearchParams();
      if (appliedFilters.from) params.set('from', appliedFilters.from);
      if (appliedFilters.to) params.set('to', appliedFilters.to);
      if (appliedFilters.user_id) params.set('user_id', appliedFilters.user_id);
      if (appliedFilters.search.trim()) params.set('search', appliedFilters.search.trim());

      const res = await fetchApi<{ history: HistoryRow[]; staff: StaffOption[] }>(
        `/api/attendance?${params.toString()}`,
        { skipCache: true }
      );
      if (!res.success) {
        toast.error('Failed to load history', res.message);
        return;
      }
      setHistory(res.data?.history ?? []);
      setStaff(res.data?.staff ?? []);
      setPage(1);
    } catch {
      toast.error('Failed to load history');
    } finally {
      setLoadingHistory(false);
    }
  }, [appliedFilters, toast]);

  useEffect(() => {
    void loadToday();
  }, [loadToday]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const historyPaged = useMemo(() => paginateSlice(history, page, PAGE_SIZE), [history, page]);

  async function handleClock(action: 'clock_in' | 'clock_out') {
    setActing(action === 'clock_in' ? 'in' : 'out');
    try {
      let latitude: number | undefined;
      let longitude: number | undefined;

      if (geofence.geofence_enabled) {
        try {
          const pos = await getCurrentPosition();
          latitude = pos.latitude;
          longitude = pos.longitude;
        } catch (err) {
          toast.error(
            'Location required',
            err instanceof Error ? err.message : 'Enable location access to clock in/out.'
          );
          return;
        }
      }

      const res = await fetchApi<{ record: TodayRecord | null }>('/api/attendance', {
        method: 'POST',
        body: JSON.stringify({ action, latitude, longitude }),
      });
      if (!res.success) {
        toast.error('Action failed', res.message);
        return;
      }
      toast.success(action === 'clock_in' ? 'Clocked in' : 'Clocked out', res.message);
      setRecord(res.data?.record ?? null);
      await Promise.all([loadToday(), loadHistory()]);
    } catch {
      toast.error('Action failed');
    } finally {
      setActing(null);
    }
  }

  function handleFilterSubmit(e: FormEvent) {
    e.preventDefault();
    setAppliedFilters({ ...filters, search });
  }

  function clearFilters() {
    setFilters({ user_id: '', from: '', to: '' });
    setSearch('');
    setAppliedFilters({ user_id: '', from: '', to: '', search: '' });
    setPage(1);
  }

  const canClockIn = !record?.clock_in_at;
  const canClockOut = Boolean(record?.clock_in_at && !record?.clock_out_at);

  return (
    <PremiumPage>
      <PageHeader
        title="Employee Attendance"
        subtitle="Clock in and out, and review attendance history."
      />

      <PremiumCard className="mb-4 text-center attendance-live-clock">
        <div className="attendance-live-clock__time">{formatClockTime(now)}</div>
        <div className="attendance-live-clock__date text-muted">{formatClockDate(now)}</div>
      </PremiumCard>

      <div className="row g-4 mb-4">
        <div className="col-lg-6">
          <PremiumCard title="Clock In / Out">
            {loadingToday ? (
              <LoadingState label="Loading…" />
            ) : (
              <>
                <div className="mb-3">
                  <label className="form-label">Employee Name</label>
                  <input className="form-control" value={session.userName} readOnly />
                </div>

                <div className="d-flex flex-wrap gap-2 mb-3">
                  <button
                    type="button"
                    className="btn btn-success flex-fill"
                    disabled={acting !== null || !canClockIn}
                    onClick={() => void handleClock('clock_in')}
                  >
                    {acting === 'in' ? 'Clocking in…' : 'Clock In'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger flex-fill"
                    disabled={acting !== null || !canClockOut}
                    onClick={() => void handleClock('clock_out')}
                  >
                    {acting === 'out' ? 'Clocking out…' : 'Clock Out'}
                  </button>
                </div>

                <p
                  className={`small mb-0 ${
                    record?.clock_in_at && !record.clock_out_at ? 'text-success fw-semibold' : 'text-muted'
                  }`}
                >
                  {statusMessage(record)}
                </p>
                {geofence.geofence_enabled ? (
                  <p className="small text-muted mt-2 mb-0">
                    On-site check required within {geofence.attendance_radius_m} m of the hotel. Your
                    browser will ask for location when you clock in or out.
                  </p>
                ) : null}
              </>
            )}
          </PremiumCard>
        </div>

        <div className="col-lg-6">
          <PremiumCard title="Today's Attendance" flush>
            {loadingToday ? (
              <LoadingState label="Loading…" />
            ) : todayRows.length === 0 ? (
              <EmptyState message="No one has clocked in today." />
            ) : (
              <div className="table-responsive">
                <table className="table premium-table mb-0">
                  <thead>
                    <tr>
                      <th>Employee</th>
                      <th>Time In</th>
                      <th>Time Out</th>
                    </tr>
                  </thead>
                  <tbody>
                    {todayRows.map((row) => (
                      <tr key={row.user_id}>
                        <td>{row.user_name}</td>
                        <td>{row.clock_in_at ? formatRecordTime(row.clock_in_at) : '-'}</td>
                        <td>
                          {row.clock_out_at
                            ? formatRecordTime(row.clock_out_at)
                            : row.clock_in_at
                              ? 'Not clocked out'
                              : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </PremiumCard>
        </div>
      </div>

      <PremiumCard title="Attendance History" flush>
        <div className="p-3 border-bottom">
          <form className="row g-3 align-items-end" onSubmit={handleFilterSubmit}>
            {isAdmin ? (
              <div className="col-md-3">
                <label className="form-label">Select Staff</label>
                <select
                  className="form-select"
                  value={filters.user_id}
                  onChange={(e) => setFilters((f) => ({ ...f, user_id: e.target.value }))}
                >
                  <option value="">All Staff</option>
                  {staff.map((s) => (
                    <option key={s.id} value={String(s.id)}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            <div className="col-md-3">
              <label className="form-label">From Date</label>
              <input
                type="date"
                className="form-control"
                value={filters.from}
                onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))}
              />
            </div>
            <div className="col-md-3">
              <label className="form-label">To Date</label>
              <input
                type="date"
                className="form-control"
                value={filters.to}
                onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))}
              />
            </div>
            <div className="col-md-3 d-flex gap-2">
              <button type="submit" className="btn btn-premium">
                Apply
              </button>
              <button type="button" className="btn btn-outline-secondary" onClick={clearFilters}>
                Clear Filters
              </button>
            </div>
            <div className="col-md-4 ms-md-auto">
              <label className="form-label">Search</label>
              <input
                className="form-control"
                placeholder="Search by name…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </form>
        </div>

        {loadingHistory ? (
          <LoadingState label="Loading history…" />
        ) : history.length === 0 ? (
          <EmptyState message="No attendance records match your filters." />
        ) : (
          <>
            <div className="table-responsive">
              <table className="table premium-table mb-0">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Full Name</th>
                    <th>Date</th>
                    <th>Time In</th>
                    <th>Time Out</th>
                  </tr>
                </thead>
                <tbody>
                  {historyPaged.items.map((row, index) => (
                    <tr key={row.id}>
                      <td>{(historyPaged.safePage - 1) * PAGE_SIZE + index + 1}</td>
                      <td>{row.user_name}</td>
                      <td>{row.work_date}</td>
                      <td>{formatRecordTime(row.clock_in_at)}</td>
                      <td>{formatRecordTime(row.clock_out_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <TablePagination
              page={page}
              pageSize={PAGE_SIZE}
              total={history.length}
              onPageChange={setPage}
            />
          </>
        )}
      </PremiumCard>
    </PremiumPage>
  );
}
