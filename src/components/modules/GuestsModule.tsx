'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useToast } from '@/components/ui/ToastProvider';
import { useConfirm } from '@/components/ui/ConfirmProvider';
import {
  PremiumPage,
  PageHeader,
  PremiumCard,
  LoadingState,
  EmptyState,
} from '@/components/ui/premium';
import TablePagination, { paginateSlice } from '@/components/ui/TablePagination';
import { fetchApi } from '@/lib/client/fetch-api';
import { formatDisplayDate } from '@/lib/dates/format-display-date';

const PAGE_SIZE = 10;

type Guest = {
  id: number;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  nationality?: string | null;
  notes?: string | null;
  is_vip: number;
  is_blacklisted: number;
  stay_count: number;
  created_at?: string;
};

type GuestForm = {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  nationality: string;
  notes: string;
  is_vip: boolean;
  is_blacklisted: boolean;
};

const emptyForm: GuestForm = {
  first_name: '',
  last_name: '',
  email: '',
  phone: '',
  nationality: '',
  notes: '',
  is_vip: false,
  is_blacklisted: false,
};

function guestToForm(guest: Guest): GuestForm {
  return {
    first_name: guest.first_name,
    last_name: guest.last_name,
    email: guest.email || '',
    phone: guest.phone || '',
    nationality: guest.nationality || '',
    notes: guest.notes || '',
    is_vip: Boolean(guest.is_vip),
    is_blacklisted: Boolean(guest.is_blacklisted),
  };
}

export default function GuestsModule() {
  const toast = useToast();
  const confirm = useConfirm();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [guests, setGuests] = useState<Guest[]>([]);
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<GuestForm>(emptyForm);
  const [viewGuest, setViewGuest] = useState<Guest | null>(null);
  const [stayHistory, setStayHistory] = useState<
    Array<{
      confirmation_code: string;
      status: string;
      check_in_date: string;
      check_out_date: string;
      total_amount: number;
      room_type_name: string | null;
      room_number: string | null;
    }>
  >([]);
  const [editGuest, setEditGuest] = useState<Guest | null>(null);

  const loadGuests = useCallback(
    async (q = search) => {
      setLoading(true);
      try {
        const res = await fetchApi<Guest[]>(`/api/guests?search=${encodeURIComponent(q)}`);
        if (!res.success) {
          toast.error('Failed to load guests', res.message);
          return;
        }
        setGuests(res.data ?? []);
        setPage(1);
      } catch {
        toast.error('Failed to load guests');
      } finally {
        setLoading(false);
      }
    },
    [search, toast]
  );

  useEffect(() => {
    void loadGuests();
  }, [loadGuests]);

  useEffect(() => {
    if (!viewGuest) {
      setStayHistory([]);
      return;
    }
    void fetchApi<typeof stayHistory>(`/api/guests?id=${viewGuest.id}&history=1`).then((res) => {
      if (res.success && res.data) setStayHistory(res.data);
    });
  }, [viewGuest]);

  const guestsPaged = useMemo(() => paginateSlice(guests, page, PAGE_SIZE), [guests, page]);

  async function handleSearch(e: FormEvent) {
    e.preventDefault();
    await loadGuests(search);
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetchApi<{ id: number }>('/api/guests', {
        method: 'POST',
        body: JSON.stringify({
          first_name: form.first_name,
          last_name: form.last_name,
          email: form.email || undefined,
          phone: form.phone || undefined,
          nationality: form.nationality || undefined,
          notes: form.notes || undefined,
          is_vip: form.is_vip,
        }),
      });
      if (!res.success) {
        toast.error('Failed to add guest', res.message);
        return;
      }
      toast.success('Guest added');
      setForm(emptyForm);
      setShowForm(false);
      await loadGuests();
    } catch {
      toast.error('Failed to add guest');
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate(e: FormEvent) {
    e.preventDefault();
    if (!editGuest) return;
    setSaving(true);
    try {
      const res = await fetchApi('/api/guests', {
        method: 'PATCH',
        body: JSON.stringify({
          id: editGuest.id,
          first_name: form.first_name,
          last_name: form.last_name,
          email: form.email,
          phone: form.phone,
          nationality: form.nationality,
          notes: form.notes,
          is_vip: form.is_vip,
          is_blacklisted: form.is_blacklisted,
        }),
      });
      if (!res.success) {
        toast.error('Failed to update guest', res.message);
        return;
      }
      toast.success('Guest updated');
      setEditGuest(null);
      setForm(emptyForm);
      await loadGuests();
    } catch {
      toast.error('Failed to update guest');
    } finally {
      setSaving(false);
    }
  }

  async function openView(guest: Guest) {
    try {
      const res = await fetchApi<Guest>(`/api/guests?id=${guest.id}`);
      if (!res.success || !res.data) {
        toast.error('Failed to load guest', res.message);
        return;
      }
      setViewGuest(res.data);
    } catch {
      toast.error('Failed to load guest');
    }
  }

  function openEdit(guest: Guest) {
    setEditGuest(guest);
    setForm(guestToForm(guest));
    setShowForm(false);
  }

  async function handleDelete(guest: Guest) {
    const name = `${guest.first_name} ${guest.last_name}`;
    const ok = await confirm({
      title: 'Delete guest',
      message: `Delete guest "${name}"? This cannot be undone.`,
      confirmLabel: 'Delete guest',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      const res = await fetchApi(`/api/guests?id=${guest.id}`, { method: 'DELETE' });
      if (!res.success) {
        toast.error('Delete failed', res.message);
        return;
      }
      toast.success('Guest deleted');
      if (viewGuest?.id === guest.id) setViewGuest(null);
      if (editGuest?.id === guest.id) setEditGuest(null);
      await loadGuests();
    } catch {
      toast.error('Delete failed');
    }
  }

  return (
    <PremiumPage>
      <PageHeader
        title="Guests"
        subtitle="Guest profiles, VIP flags, and blacklist management."
        icon="ti-users"
        actions={
          <button
            type="button"
            className="btn btn-premium"
            onClick={() => {
              setShowForm(!showForm);
              setEditGuest(null);
              setForm(emptyForm);
            }}
          >
            {showForm ? 'Cancel' : 'Add Guest'}
          </button>
        }
      />

      {showForm ? (
        <PremiumCard title="New Guest">
          <form className="premium-form" onSubmit={handleCreate}>
            <GuestFormFields form={form} setForm={setForm} />
            <div className="mt-3">
              <button type="submit" className="btn btn-premium" disabled={saving}>
                {saving ? 'Saving…' : 'Save Guest'}
              </button>
            </div>
          </form>
        </PremiumCard>
      ) : null}

      <form className="premium-form mb-3" onSubmit={handleSearch}>
        <div className="input-group">
          <input
            className="form-control"
            placeholder="Search by name, email, or phone…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button type="submit" className="btn btn-premium-outline">
            Search
          </button>
        </div>
      </form>

      <PremiumCard title="Guest Directory" flush>
        {loading ? (
          <LoadingState label="Loading guests…" />
        ) : guests.length === 0 ? (
          <EmptyState message="No guests found." icon="ti-users" />
        ) : (
          <>
            <div className="table-responsive">
              <table className="table premium-table mb-0">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Phone</th>
                    <th>Stays</th>
                    <th>Flags</th>
                    <th className="text-end">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {guestsPaged.items.map((g) => (
                    <tr key={g.id}>
                      <td className="fw-medium">
                        {g.first_name} {g.last_name}
                        {g.is_vip ? (
                          <span className="premium-badge premium-badge--warning ms-2">VIP</span>
                        ) : null}
                        {g.is_blacklisted ? (
                          <span className="premium-badge premium-badge--danger ms-2">Blacklisted</span>
                        ) : null}
                      </td>
                      <td>{g.email || '—'}</td>
                      <td>{g.phone || '—'}</td>
                      <td>{g.stay_count}</td>
                      <td>
                        {g.is_vip ? 'VIP' : '—'}
                        {g.is_blacklisted ? ' / Blacklisted' : ''}
                      </td>
                      <td className="text-end">
                        <div className="btn-group btn-group-sm">
                          <button
                            type="button"
                            className="btn btn-outline-secondary"
                            onClick={() => void openView(g)}
                          >
                            View
                          </button>
                          <button
                            type="button"
                            className="btn btn-outline-secondary"
                            onClick={() => openEdit(g)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="btn btn-outline-danger"
                            onClick={() => void handleDelete(g)}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <TablePagination page={page} pageSize={PAGE_SIZE} total={guests.length} onPageChange={setPage} />
          </>
        )}
      </PremiumCard>

      {viewGuest ? (
        <>
          <div className="modal fade show d-block" tabIndex={-1} role="dialog" aria-modal="true">
            <div className="modal-dialog modal-dialog-centered">
              <div className="modal-content">
                <div className="modal-header">
                  <h5 className="modal-title">Guest profile</h5>
                  <button type="button" className="btn-close" aria-label="Close" onClick={() => setViewGuest(null)} />
                </div>
                <div className="modal-body">
                  <h4 className="mb-3">
                    {viewGuest.first_name} {viewGuest.last_name}
                    {viewGuest.is_vip ? (
                      <span className="premium-badge premium-badge--warning ms-2">VIP</span>
                    ) : null}
                    {viewGuest.is_blacklisted ? (
                      <span className="premium-badge premium-badge--danger ms-2">Blacklisted</span>
                    ) : null}
                  </h4>
                  <dl className="row mb-0 small">
                    <dt className="col-sm-4">Email</dt>
                    <dd className="col-sm-8">{viewGuest.email || '—'}</dd>
                    <dt className="col-sm-4">Phone</dt>
                    <dd className="col-sm-8">{viewGuest.phone || '—'}</dd>
                    <dt className="col-sm-4">Nationality</dt>
                    <dd className="col-sm-8">{viewGuest.nationality || '—'}</dd>
                    <dt className="col-sm-4">Total stays</dt>
                    <dd className="col-sm-8">{viewGuest.stay_count}</dd>
                    <dt className="col-sm-4">Notes</dt>
                    <dd className="col-sm-8">{viewGuest.notes || '—'}</dd>
                    {viewGuest.created_at ? (
                      <>
                        <dt className="col-sm-4">Registered</dt>
                        <dd className="col-sm-8">
                          {formatDisplayDate(viewGuest.created_at)}
                        </dd>
                      </>
                    ) : null}
                  </dl>
                  {stayHistory.length > 0 ? (
                    <div className="mt-4">
                      <h6>Stay history</h6>
                      <div className="table-responsive">
                        <table className="table table-sm mb-0 premium-table">
                          <thead>
                            <tr>
                              <th>Code</th>
                              <th>Dates</th>
                              <th>Room</th>
                              <th>Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {stayHistory.map((stay) => (
                              <tr key={stay.confirmation_code}>
                                <td><code>{stay.confirmation_code}</code></td>
                                <td>{formatDisplayDate(stay.check_in_date)} → {formatDisplayDate(stay.check_out_date)}</td>
                                <td>{stay.room_type_name || '—'}{stay.room_number ? ` · ${stay.room_number}` : ''}</td>
                                <td>{stay.status.replace(/_/g, ' ')}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : null}
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-outline-secondary" onClick={() => setViewGuest(null)}>
                    Close
                  </button>
                  <button
                    type="button"
                    className="btn btn-premium"
                    onClick={() => {
                      openEdit(viewGuest);
                      setViewGuest(null);
                    }}
                  >
                    Edit guest
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div className="modal-backdrop fade show" onClick={() => setViewGuest(null)} aria-hidden="true" />
        </>
      ) : null}

      {editGuest ? (
        <>
          <div className="modal fade show d-block" tabIndex={-1} role="dialog" aria-modal="true">
            <div className="modal-dialog modal-dialog-centered modal-lg">
              <div className="modal-content">
                <div className="modal-header">
                  <h5 className="modal-title">Edit guest</h5>
                  <button
                    type="button"
                    className="btn-close"
                    aria-label="Close"
                    onClick={() => {
                      setEditGuest(null);
                      setForm(emptyForm);
                    }}
                  />
                </div>
                <form onSubmit={handleUpdate}>
                  <div className="modal-body">
                    <GuestFormFields form={form} setForm={setForm} includeFlags />
                  </div>
                  <div className="modal-footer">
                    <button
                      type="button"
                      className="btn btn-outline-secondary"
                      onClick={() => {
                        setEditGuest(null);
                        setForm(emptyForm);
                      }}
                    >
                      Cancel
                    </button>
                    <button type="submit" className="btn btn-premium" disabled={saving}>
                      {saving ? 'Saving…' : 'Save changes'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
          <div
            className="modal-backdrop fade show"
            onClick={() => {
              setEditGuest(null);
              setForm(emptyForm);
            }}
            aria-hidden="true"
          />
        </>
      ) : null}
    </PremiumPage>
  );
}

function GuestFormFields({
  form,
  setForm,
  includeFlags = false,
}: {
  form: GuestForm;
  setForm: (form: GuestForm) => void;
  includeFlags?: boolean;
}) {
  return (
    <div className="row g-3">
      <div className="col-md-6">
        <label className="form-label">First Name</label>
        <input
          className="form-control"
          value={form.first_name}
          onChange={(e) => setForm({ ...form, first_name: e.target.value })}
          required
        />
      </div>
      <div className="col-md-6">
        <label className="form-label">Last Name</label>
        <input
          className="form-control"
          value={form.last_name}
          onChange={(e) => setForm({ ...form, last_name: e.target.value })}
          required
        />
      </div>
      <div className="col-md-6">
        <label className="form-label">Email</label>
        <input
          type="email"
          className="form-control"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
        />
      </div>
      <div className="col-md-6">
        <label className="form-label">Phone</label>
        <input
          className="form-control"
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
        />
      </div>
      <div className="col-md-6">
        <label className="form-label">Nationality</label>
        <input
          className="form-control"
          value={form.nationality}
          onChange={(e) => setForm({ ...form, nationality: e.target.value })}
        />
      </div>
      <div className="col-12">
        <label className="form-label">Notes</label>
        <textarea
          className="form-control"
          rows={2}
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
        />
      </div>
      <div className="col-12">
        <div className="form-check">
          <input
            className="form-check-input"
            type="checkbox"
            id="guest-form-vip"
            checked={form.is_vip}
            onChange={(e) => setForm({ ...form, is_vip: e.target.checked })}
          />
          <label className="form-check-label" htmlFor="guest-form-vip">
            VIP Guest
          </label>
        </div>
      </div>
      {includeFlags ? (
        <div className="col-12">
          <div className="form-check">
            <input
              className="form-check-input"
              type="checkbox"
              id="guest-form-blacklist"
              checked={form.is_blacklisted}
              onChange={(e) => setForm({ ...form, is_blacklisted: e.target.checked })}
            />
            <label className="form-check-label" htmlFor="guest-form-blacklist">
              Blacklisted
            </label>
          </div>
        </div>
      ) : null}
    </div>
  );
}
