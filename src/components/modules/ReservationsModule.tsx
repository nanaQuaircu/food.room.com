'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useToast } from '@/components/ui/ToastProvider';
import {
  PremiumPage,
  PageHeader,
  PremiumCard,
  PremiumTabs,
  LoadingState,
  EmptyState,
  StatusBadge,
} from '@/components/ui/premium';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { fetchApi } from '@/lib/client/fetch-api';
import { formatDisplayDate } from '@/lib/dates/format-display-date';
import {
  addDaysToDateIso,
  calculateBookingNights,
  calculateRoomTotal,
} from '@/lib/billing/stay-billing';

type Guest = { id: number; first_name: string; last_name: string };
type RoomType = { id: number; name: string; base_rate: number };
type RatePlan = {
  id: number;
  name: string;
  nightly_rate: number;
  room_type_id: number | null;
  room_type_name: string | null;
  is_active: number;
};
type Reservation = {
  id: number;
  confirmation_code: string;
  status: string;
  check_in_date: string;
  check_out_date: string;
  total_amount: number;
  deposit_amount?: number;
  first_name: string;
  last_name: string;
  room_type_name: string | null;
  room_number: string | null;
};
type WaitlistEntry = {
  id: number;
  status: string;
  check_in_date: string;
  check_out_date: string;
  first_name: string;
  last_name: string;
  room_type_name: string | null;
  priority: number;
};

export default function ReservationsModule() {
  const toast = useToast();
  const [tab, setTab] = useState<'bookings' | 'rates' | 'waitlist' | 'tape'>('bookings');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [guests, setGuests] = useState<Guest[]>([]);
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
  const [ratePlans, setRatePlans] = useState<RatePlan[]>([]);
  const [waitlist, setWaitlist] = useState<WaitlistEntry[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState<Reservation | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Reservation | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [form, setForm] = useState({
    guest_id: '',
    check_in_date: '',
    check_out_date: '',
    room_type_id: '',
    rate_plan_id: '',
    deposit_amount: '',
    force_overbook: false,
    billing_type: 'guest' as 'guest' | 'corporate',
    corporate_account_id: '',
  });
  const [corporateAccounts, setCorporateAccounts] = useState<Array<{ id: number; name: string }>>([]);
  const [rateForm, setRateForm] = useState({
    name: '',
    room_type_id: '',
    nightly_rate: '',
  });
  const [limitForm, setLimitForm] = useState({
    room_type_id: '',
    overbook_percent: '0',
    allow_overbook: false,
  });
  const [waitForm, setWaitForm] = useState({
    guest_id: '',
    check_in_date: '',
    check_out_date: '',
    room_type_id: '',
  });
  const [tapeData, setTapeData] = useState<{
    rooms: Array<{ id: number; room_number: string; room_type_name: string }>;
    reservations: Array<{
      id: number;
      room_id: number | null;
      confirmation_code: string;
      guest_name: string;
      check_in_date: string;
      check_out_date: string;
    }>;
    dateCols: string[];
  } | null>(null);

  const loadTapeChart = useCallback(async () => {
    const start = new Date().toISOString().slice(0, 10);
    const res = await fetchApi<typeof tapeData>(`/api/reservations?view=tape_chart&start_date=${start}&days=14`);
    if (res.success && res.data) setTapeData(res.data);
  }, []);

  useEffect(() => {
    if (tab === 'tape') void loadTapeChart();
  }, [tab, loadTapeChart]);

  async function markNoShow(id: number) {
    const res = await fetchApi('/api/reservations', {
      method: 'PATCH',
      body: JSON.stringify({ action: 'no_show', id }),
    });
    if (res.success) {
      toast.success('Marked as no-show');
      void loadData();
    } else {
      toast.error(res.message || 'Failed');
    }
  }

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [resRes, guestsRes, typesRes, plansRes, waitRes, accountsRes] = await Promise.all([
        fetchApi<Reservation[]>('/api/reservations'),
        fetchApi<Guest[]>('/api/guests'),
        fetchApi<RoomType[]>('/api/room-types'),
        fetchApi<RatePlan[]>('/api/reservations?view=rate_plans'),
        fetchApi<WaitlistEntry[]>('/api/reservations?view=waitlist'),
        fetchApi<Array<{ id: number; name: string }>>('/api/debtors?action=accounts'),
      ]);
      if (!resRes.success) {
        toast.error('Failed to load reservations', resRes.message);
        return;
      }
      setReservations(resRes.data ?? []);
      if (guestsRes.success) setGuests(guestsRes.data ?? []);
      if (typesRes.success) setRoomTypes(typesRes.data ?? []);
      if (plansRes.success) setRatePlans(plansRes.data ?? []);
      if (waitRes.success) setWaitlist(waitRes.data ?? []);
      if (accountsRes.success) setCorporateAccounts(accountsRes.data ?? []);
    } catch {
      toast.error('Failed to load reservations');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const selectedRoomType = roomTypes.find((rt) => String(rt.id) === form.room_type_id);
  const selectedPlan = ratePlans.find((p) => String(p.id) === form.rate_plan_id);
  const nightlyRate = selectedPlan
    ? Number(selectedPlan.nightly_rate)
    : Number(selectedRoomType?.base_rate ?? 0);

  const bookingNights = useMemo(() => {
    if (!form.check_in_date || !form.check_out_date) return 0;
    return calculateBookingNights(form.check_in_date, form.check_out_date);
  }, [form.check_in_date, form.check_out_date]);

  const bookingTotal = useMemo(() => {
    if (bookingNights <= 0 || nightlyRate <= 0) return 0;
    return calculateRoomTotal(nightlyRate, bookingNights);
  }, [nightlyRate, bookingNights]);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetchApi('/api/reservations', {
        method: 'POST',
        body: JSON.stringify({
          guest_id: Number(form.guest_id),
          check_in_date: form.check_in_date,
          check_out_date: form.check_out_date,
          room_type_id: form.room_type_id ? Number(form.room_type_id) : undefined,
          rate_plan_id: form.rate_plan_id ? Number(form.rate_plan_id) : undefined,
          deposit_amount: form.deposit_amount ? Number(form.deposit_amount) : undefined,
          force_overbook: form.force_overbook,
          billing_type: form.billing_type,
          corporate_account_id:
            form.billing_type === 'corporate' && form.corporate_account_id
              ? Number(form.corporate_account_id)
              : undefined,
        }),
      });
      if (!res.success) {
        toast.error('Failed to create reservation', res.message);
        return;
      }
      toast.success('Reservation created');
      setForm({
        guest_id: '',
        check_in_date: '',
        check_out_date: '',
        room_type_id: '',
        rate_plan_id: '',
        deposit_amount: '',
        force_overbook: false,
        billing_type: 'guest',
        corporate_account_id: '',
      });
      setShowForm(false);
      await loadData();
    } catch {
      toast.error('Failed to create reservation');
    } finally {
      setSaving(false);
    }
  }

  async function handleModify(e: FormEvent) {
    e.preventDefault();
    if (!editTarget) return;
    setSaving(true);
    try {
      const res = await fetchApi('/api/reservations', {
        method: 'PATCH',
        body: JSON.stringify({
          action: 'modify',
          id: editTarget.id,
          check_in_date: form.check_in_date,
          check_out_date: form.check_out_date,
          room_type_id: form.room_type_id ? Number(form.room_type_id) : undefined,
          rate_plan_id: form.rate_plan_id ? Number(form.rate_plan_id) : undefined,
          force_overbook: form.force_overbook,
        }),
      });
      if (!res.success) {
        toast.error('Modify failed', res.message);
        return;
      }
      toast.success('Reservation updated');
      setEditTarget(null);
      setShowForm(false);
      await loadData();
    } catch {
      toast.error('Modify failed');
    } finally {
      setSaving(false);
    }
  }

  async function confirmCancelReservation() {
    if (!cancelTarget) return;
    setCancelling(true);
    try {
      const res = await fetchApi('/api/reservations', {
        method: 'PATCH',
        body: JSON.stringify({ id: cancelTarget.id }),
      });
      if (!res.success) {
        toast.error('Cancel failed', res.message);
        return;
      }
      toast.success('Reservation cancelled');
      setCancelTarget(null);
      await loadData();
    } catch {
      toast.error('Cancel failed');
    } finally {
      setCancelling(false);
    }
  }

  async function handleSaveRate(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetchApi('/api/reservations', {
        method: 'POST',
        body: JSON.stringify({
          type: 'rate_plan',
          name: rateForm.name,
          room_type_id: rateForm.room_type_id ? Number(rateForm.room_type_id) : null,
          nightly_rate: Number(rateForm.nightly_rate),
        }),
      });
      if (!res.success) {
        toast.error('Could not save rate plan', res.message);
        return;
      }
      toast.success('Rate plan saved');
      setRateForm({ name: '', room_type_id: '', nightly_rate: '' });
      await loadData();
    } catch {
      toast.error('Could not save rate plan');
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveLimit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetchApi('/api/reservations', {
        method: 'POST',
        body: JSON.stringify({
          type: 'inventory_limit',
          room_type_id: Number(limitForm.room_type_id),
          overbook_percent: Number(limitForm.overbook_percent),
          allow_overbook: limitForm.allow_overbook,
        }),
      });
      if (!res.success) {
        toast.error('Could not save overbooking settings', res.message);
        return;
      }
      toast.success('Overbooking settings saved');
      await loadData();
    } catch {
      toast.error('Could not save overbooking settings');
    } finally {
      setSaving(false);
    }
  }

  async function handleWaitlist(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetchApi('/api/reservations', {
        method: 'POST',
        body: JSON.stringify({
          type: 'waitlist',
          guest_id: Number(waitForm.guest_id),
          check_in_date: waitForm.check_in_date,
          check_out_date: waitForm.check_out_date,
          room_type_id: waitForm.room_type_id ? Number(waitForm.room_type_id) : undefined,
        }),
      });
      if (!res.success) {
        toast.error('Could not add to waitlist', res.message);
        return;
      }
      toast.success('Added to waitlist');
      setWaitForm({ guest_id: '', check_in_date: '', check_out_date: '', room_type_id: '' });
      await loadData();
    } catch {
      toast.error('Could not add to waitlist');
    } finally {
      setSaving(false);
    }
  }

  function openEdit(r: Reservation) {
    setEditTarget(r);
    setForm({
      guest_id: '',
      check_in_date: String(r.check_in_date).slice(0, 10),
      check_out_date: String(r.check_out_date).slice(0, 10),
      room_type_id: '',
      rate_plan_id: '',
      deposit_amount: '',
      force_overbook: false,
      billing_type: 'guest',
      corporate_account_id: '',
    });
    setShowForm(true);
    setTab('bookings');
  }

  return (
    <PremiumPage>
      <PageHeader
        title="Reservations"
        subtitle="Bookings, rate plans, deposits, waitlist, and overbooking."
        icon="ti-calendar-check"
        actions={
          tab === 'bookings' ? (
            <button
              type="button"
              className="btn btn-premium"
              onClick={() => {
                setEditTarget(null);
                setShowForm(!showForm);
              }}
            >
              {showForm ? 'Close' : 'New Reservation'}
            </button>
          ) : null
        }
      />

      <PremiumTabs
        tabs={[
          { id: 'bookings', label: 'Bookings' },
          { id: 'rates', label: 'Rate plans' },
          { id: 'waitlist', label: 'Waitlist' },
          { id: 'tape', label: 'Tape chart' },
        ]}
        active={tab}
        onChange={(id) => setTab(id as typeof tab)}
      />

      {tab === 'rates' ? (
        <div className="row g-3">
          <div className="col-md-5">
            <PremiumCard title="New rate plan">
              <form className="premium-form" onSubmit={handleSaveRate}>
                <div className="mb-2">
                  <input
                    className="form-control"
                    placeholder="Plan name"
                    value={rateForm.name}
                    onChange={(e) => setRateForm({ ...rateForm, name: e.target.value })}
                    required
                  />
                </div>
                <div className="mb-2">
                  <select
                    className="form-select"
                    value={rateForm.room_type_id}
                    onChange={(e) => setRateForm({ ...rateForm, room_type_id: e.target.value })}
                  >
                    <option value="">All room types</option>
                    {roomTypes.map((rt) => (
                      <option key={rt.id} value={rt.id}>
                        {rt.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="mb-3">
                  <input
                    type="number"
                    step="0.01"
                    className="form-control"
                    placeholder="Nightly rate"
                    value={rateForm.nightly_rate}
                    onChange={(e) => setRateForm({ ...rateForm, nightly_rate: e.target.value })}
                    required
                  />
                </div>
                <button className="btn btn-primary" type="submit" disabled={saving}>
                  Save plan
                </button>
              </form>
            </PremiumCard>
            <PremiumCard title="Overbooking controls" className="mt-3">
              <form className="premium-form" onSubmit={handleSaveLimit}>
                <div className="mb-2">
                  <select
                    className="form-select"
                    value={limitForm.room_type_id}
                    onChange={(e) => setLimitForm({ ...limitForm, room_type_id: e.target.value })}
                    required
                  >
                    <option value="">Room type…</option>
                    {roomTypes.map((rt) => (
                      <option key={rt.id} value={rt.id}>
                        {rt.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="mb-2">
                  <label className="form-label small">Overbook %</label>
                  <input
                    type="number"
                    step="0.01"
                    className="form-control"
                    value={limitForm.overbook_percent}
                    onChange={(e) => setLimitForm({ ...limitForm, overbook_percent: e.target.value })}
                  />
                </div>
                <div className="form-check mb-3">
                  <input
                    id="allow_overbook"
                    type="checkbox"
                    className="form-check-input"
                    checked={limitForm.allow_overbook}
                    onChange={(e) => setLimitForm({ ...limitForm, allow_overbook: e.target.checked })}
                  />
                  <label className="form-check-label" htmlFor="allow_overbook">
                    Allow forced overbook
                  </label>
                </div>
                <button className="btn btn-outline-primary" type="submit" disabled={saving}>
                  Save limits
                </button>
              </form>
            </PremiumCard>
          </div>
          <div className="col-md-7">
            <PremiumCard title="Rate plans" flush>
              {ratePlans.length === 0 ? (
                <EmptyState message="No rate plans yet." icon="ti-tags" />
              ) : (
                <div className="table-responsive">
                  <table className="table premium-table mb-0">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Room type</th>
                        <th>Nightly</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ratePlans.map((p) => (
                        <tr key={p.id}>
                          <td>{p.name}</td>
                          <td>{p.room_type_name || 'All'}</td>
                          <td>GHS {Number(p.nightly_rate).toFixed(2)}</td>
                          <td>{p.is_active ? 'Active' : 'Inactive'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </PremiumCard>
          </div>
        </div>
      ) : null}

      {tab === 'waitlist' ? (
        <div className="row g-3">
          <div className="col-md-5">
            <PremiumCard title="Add to waitlist">
              <form className="premium-form" onSubmit={handleWaitlist}>
                <div className="mb-2">
                  <select
                    className="form-select"
                    value={waitForm.guest_id}
                    onChange={(e) => setWaitForm({ ...waitForm, guest_id: e.target.value })}
                    required
                  >
                    <option value="">Guest…</option>
                    {guests.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.first_name} {g.last_name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="mb-2">
                  <select
                    className="form-select"
                    value={waitForm.room_type_id}
                    onChange={(e) => setWaitForm({ ...waitForm, room_type_id: e.target.value })}
                  >
                    <option value="">Any room type</option>
                    {roomTypes.map((rt) => (
                      <option key={rt.id} value={rt.id}>
                        {rt.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="mb-2">
                  <input
                    type="date"
                    className="form-control"
                    value={waitForm.check_in_date}
                    onChange={(e) => setWaitForm({ ...waitForm, check_in_date: e.target.value })}
                    required
                  />
                </div>
                <div className="mb-3">
                  <input
                    type="date"
                    className="form-control"
                    value={waitForm.check_out_date}
                    min={waitForm.check_in_date ? addDaysToDateIso(waitForm.check_in_date, 1) : undefined}
                    onChange={(e) => setWaitForm({ ...waitForm, check_out_date: e.target.value })}
                    required
                  />
                </div>
                <button className="btn btn-primary" type="submit" disabled={saving}>
                  Add to waitlist
                </button>
              </form>
            </PremiumCard>
          </div>
          <div className="col-md-7">
            <PremiumCard title="Waitlist" flush>
              {waitlist.length === 0 ? (
                <EmptyState message="Waitlist is empty." icon="ti-hourglass" />
              ) : (
                <div className="table-responsive">
                  <table className="table premium-table mb-0">
                    <thead>
                      <tr>
                        <th>Guest</th>
                        <th>Dates</th>
                        <th>Type</th>
                        <th>Status</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {waitlist.map((w) => (
                        <tr key={w.id}>
                          <td>
                            {w.first_name} {w.last_name}
                          </td>
                          <td>
                            {formatDisplayDate(w.check_in_date)} → {formatDisplayDate(w.check_out_date)}
                          </td>
                          <td>{w.room_type_name || '—'}</td>
                          <td>
                            <StatusBadge status={w.status} />
                          </td>
                          <td className="text-end">
                            {w.status === 'waiting' || w.status === 'offered' ? (
                              <button
                                type="button"
                                className="btn btn-sm btn-premium"
                                disabled={saving}
                                onClick={async () => {
                                  setSaving(true);
                                  const res = await fetchApi('/api/reservations', {
                                    method: 'POST',
                                    body: JSON.stringify({ type: 'waitlist_promote', id: w.id }),
                                  });
                                  setSaving(false);
                                  if (!res.success) {
                                    toast.error('Promote failed', res.message);
                                    return;
                                  }
                                  toast.success('Promoted to reservation');
                                  await loadData();
                                }}
                              >
                                Promote
                              </button>
                            ) : null}
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
      ) : null}

      {tab === 'bookings' ? (
        <>
          {showForm ? (
            <PremiumCard title={editTarget ? `Modify ${editTarget.confirmation_code}` : 'Create Reservation'}>
              <form className="premium-form" onSubmit={editTarget ? handleModify : handleCreate}>
                <div className="row g-3">
                  {!editTarget ? (
                    <div className="col-md-6">
                      <label className="form-label">Guest</label>
                      <select
                        className="form-select"
                        value={form.guest_id}
                        onChange={(e) => setForm({ ...form, guest_id: e.target.value })}
                        required
                      >
                        <option value="">Select guest…</option>
                        {guests.map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.first_name} {g.last_name}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}
                  {!editTarget ? (
                    <>
                      <div className="col-md-6">
                        <label className="form-label">Billing</label>
                        <select
                          className="form-select"
                          value={form.billing_type}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              billing_type: e.target.value as 'guest' | 'corporate',
                              corporate_account_id:
                                e.target.value === 'corporate' ? form.corporate_account_id : '',
                            })
                          }
                        >
                          <option value="guest">Guest pays (normal)</option>
                          <option value="corporate">Company / debtor account</option>
                        </select>
                      </div>
                      {form.billing_type === 'corporate' ? (
                        <div className="col-md-6">
                          <label className="form-label">Company</label>
                          <select
                            className="form-select"
                            value={form.corporate_account_id}
                            onChange={(e) => setForm({ ...form, corporate_account_id: e.target.value })}
                            required
                          >
                            <option value="">Select company…</option>
                            {corporateAccounts.map((a) => (
                              <option key={a.id} value={a.id}>
                                {a.name}
                              </option>
                            ))}
                          </select>
                          <div className="form-text">Stay appears on Debtors → Master Ledger.</div>
                        </div>
                      ) : null}
                    </>
                  ) : null}
                  <div className="col-md-6">
                    <label className="form-label">Room Type</label>
                    <select
                      className="form-select"
                      value={form.room_type_id}
                      onChange={(e) => setForm({ ...form, room_type_id: e.target.value, rate_plan_id: '' })}
                    >
                      <option value="">Any / TBD</option>
                      {roomTypes.map((rt) => (
                        <option key={rt.id} value={rt.id}>
                          {rt.name} — GHS {Number(rt.base_rate).toFixed(2)}/night
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-md-6">
                    <label className="form-label">Rate plan</label>
                    <select
                      className="form-select"
                      value={form.rate_plan_id}
                      onChange={(e) => setForm({ ...form, rate_plan_id: e.target.value })}
                    >
                      <option value="">Use room type base rate</option>
                      {ratePlans
                        .filter(
                          (p) =>
                            !form.room_type_id ||
                            !p.room_type_id ||
                            String(p.room_type_id) === form.room_type_id
                        )
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} — GHS {Number(p.nightly_rate).toFixed(2)}
                          </option>
                        ))}
                    </select>
                  </div>
                  <div className="col-md-6">
                    <label className="form-label">Check-in</label>
                    <input
                      type="date"
                      className="form-control"
                      value={form.check_in_date}
                      onChange={(e) => setForm({ ...form, check_in_date: e.target.value })}
                      required
                    />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label">Check-out</label>
                    <input
                      type="date"
                      className="form-control"
                      value={form.check_out_date}
                      min={form.check_in_date ? addDaysToDateIso(form.check_in_date, 1) : undefined}
                      onChange={(e) => setForm({ ...form, check_out_date: e.target.value })}
                      required
                    />
                  </div>
                  {!editTarget ? (
                    <div className="col-md-6">
                      <label className="form-label">Deposit (optional)</label>
                      <input
                        type="number"
                        step="0.01"
                        className="form-control"
                        value={form.deposit_amount}
                        onChange={(e) => setForm({ ...form, deposit_amount: e.target.value })}
                      />
                    </div>
                  ) : null}
                  <div className="col-md-6 d-flex align-items-end">
                    <div className="form-check mb-2">
                      <input
                        id="force_overbook"
                        type="checkbox"
                        className="form-check-input"
                        checked={form.force_overbook}
                        onChange={(e) => setForm({ ...form, force_overbook: e.target.checked })}
                      />
                      <label className="form-check-label" htmlFor="force_overbook">
                        Force overbook if full
                      </label>
                    </div>
                  </div>
                  {bookingNights > 0 && nightlyRate > 0 ? (
                    <div className="col-12">
                      <div className="alert alert-light border mb-0 py-2 small">
                        <strong>{bookingNights}</strong> night{bookingNights === 1 ? '' : 's'} × GHS{' '}
                        {nightlyRate.toFixed(2)} = <strong>GHS {bookingTotal.toFixed(2)}</strong>
                      </div>
                    </div>
                  ) : null}
                  <div className="col-12">
                    <button type="submit" className="btn btn-premium" disabled={saving}>
                      {saving ? 'Saving…' : editTarget ? 'Save changes' : 'Create Reservation'}
                    </button>
                  </div>
                </div>
              </form>
            </PremiumCard>
          ) : null}

          <PremiumCard title="All Reservations" flush>
            {loading ? (
              <LoadingState label="Loading reservations…" />
            ) : reservations.length === 0 ? (
              <EmptyState message="No reservations yet." icon="ti-calendar" />
            ) : (
              <div className="table-responsive">
                <table className="table premium-table mb-0">
                  <thead>
                    <tr>
                      <th>Confirmation</th>
                      <th>Guest</th>
                      <th>Room Type</th>
                      <th>Dates</th>
                      <th>Total</th>
                      <th>Deposit</th>
                      <th>Status</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {reservations.map((r) => (
                      <tr key={r.id}>
                        <td>
                          <code>{r.confirmation_code}</code>
                        </td>
                        <td>
                          {r.first_name} {r.last_name}
                        </td>
                        <td>{r.room_type_name || '—'}</td>
                        <td>
                          {formatDisplayDate(r.check_in_date)} → {formatDisplayDate(r.check_out_date)}
                        </td>
                        <td>GHS {Number(r.total_amount).toFixed(2)}</td>
                        <td>GHS {Number(r.deposit_amount ?? 0).toFixed(2)}</td>
                        <td>
                          <StatusBadge status={r.status} />
                        </td>
                        <td className="text-nowrap">
                          {r.status !== 'cancelled' && r.status !== 'checked_out' ? (
                            <>
                              <button
                                type="button"
                                className="btn btn-sm btn-outline-secondary me-1"
                                onClick={() => openEdit(r)}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                className="btn btn-sm btn-premium-outline"
                                onClick={() => setCancelTarget(r)}
                              >
                                Cancel
                              </button>
                              {r.status === 'confirmed' ? (
                                <button
                                  type="button"
                                  className="btn btn-sm btn-outline-warning ms-1"
                                  onClick={() => void markNoShow(r.id)}
                                >
                                  No-show
                                </button>
                              ) : null}
                            </>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </PremiumCard>
        </>
      ) : null}

      {tab === 'tape' ? (
        <PremiumCard title="14-day tape chart">
          {!tapeData ? (
            <LoadingState label="Loading tape chart…" />
          ) : (
            <div className="table-responsive">
              <table className="table table-sm premium-table mb-0">
                <thead>
                  <tr>
                    <th>Room</th>
                    {tapeData.dateCols.map((d) => (
                      <th key={d} className="text-center small">
                        {d.slice(5)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tapeData.rooms.map((room) => (
                    <tr key={room.id}>
                      <td className="text-nowrap">
                        <strong>{room.room_number}</strong>
                        <div className="small text-muted">{room.room_type_name}</div>
                      </td>
                      {tapeData.dateCols.map((date) => {
                        const hit = tapeData.reservations.find(
                          (res) =>
                            res.room_id === room.id &&
                            date >= res.check_in_date &&
                            date < res.check_out_date
                        );
                        return (
                          <td key={date} className="text-center p-1">
                            {hit ? (
                              <span
                                className="badge bg-dark"
                                title={`${hit.guest_name} · ${hit.confirmation_code}`}
                              >
                                •
                              </span>
                            ) : (
                              <span className="text-muted">·</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </PremiumCard>
      ) : null}

      <ConfirmDialog
        open={Boolean(cancelTarget)}
        title="Cancel reservation"
        message={
          cancelTarget
            ? `Cancel reservation ${cancelTarget.confirmation_code} for ${cancelTarget.first_name} ${cancelTarget.last_name}? This cannot be undone.`
            : 'Cancel this reservation?'
        }
        confirmLabel="Cancel reservation"
        cancelLabel="Keep reservation"
        danger
        busy={cancelling}
        onConfirm={() => void confirmCancelReservation()}
        onCancel={() => {
          if (!cancelling) setCancelTarget(null);
        }}
      />
    </PremiumPage>
  );
}
