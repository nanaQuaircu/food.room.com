'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { fetchApi } from '@/lib/client/fetch-api';
import { PremiumCard, PremiumPage, PageHeader, LoadingState, EmptyState, StatusBadge } from '@/components/ui/premium';
import { useToast } from '@/components/ui/ToastProvider';

type MaintenanceLog = {
  id: number;
  room_id: number | null;
  room_number: string | null;
  location: string;
  item_category: string;
  priority_level: string;
  action_required: string;
  reported_date: string;
  cash_disbursed: number;
  action_taken: string | null;
  cash_disbursed_on: string | null;
  estimated_cost: number | null;
  current_status: string;
  date_fixed: string | null;
  remarks: string | null;
  reporter_name: string | null;
  assignee_name: string | null;
  assigned_to: number | null;
};

type Room = { id: number; room_number: string; status: string };
type Staff = { id: number; name: string; role: string };
type MaintenanceData = { logs: MaintenanceLog[]; rooms: Room[]; staff: Staff[] };

const emptyForm = {
  room_id: '',
  location: '',
  item_category: '',
  priority_level: 'medium',
  action_required: '',
  reported_date: new Date().toISOString().slice(0, 10),
  cash_disbursed: false,
  action_taken: '',
  cash_disbursed_on: '',
  estimated_cost: '',
  current_status: 'reported',
  date_fixed: '',
  remarks: '',
  assigned_to: '',
};

export default function MaintenanceModule() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState<MaintenanceData | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [statusFilter, setStatusFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchApi<MaintenanceData>('/api/maintenance');
      if (!res.success) {
        toast.error('Failed to load maintenance', res.message);
        return;
      }
      setData(res.data ?? null);
    } catch {
      toast.error('Failed to load maintenance');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const filteredLogs = useMemo(() => {
    const logs = data?.logs ?? [];
    return logs.filter((log) => {
      if (statusFilter !== 'all' && log.current_status !== statusFilter) return false;
      if (priorityFilter !== 'all' && log.priority_level !== priorityFilter) return false;
      return true;
    });
  }, [data?.logs, statusFilter, priorityFilter]);

  const summary = useMemo(() => {
    const logs = data?.logs ?? [];
    return {
      total: logs.length,
      open: logs.filter((l) => ['reported', 'scheduled', 'in_progress', 'pending_vendor'].includes(l.current_status)).length,
      fixed: logs.filter((l) => l.current_status === 'fixed').length,
      critical: logs.filter((l) => l.priority_level === 'critical').length,
    };
  }, [data?.logs]);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetchApi('/api/maintenance', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          room_id: form.room_id ? Number(form.room_id) : undefined,
          estimated_cost: form.estimated_cost ? Number(form.estimated_cost) : undefined,
          assigned_to: form.assigned_to ? Number(form.assigned_to) : undefined,
        }),
      });
      if (!res.success) {
        toast.error('Failed to add maintenance item', res.message);
        return;
      }
      toast.success('Maintenance item added');
      setForm(emptyForm);
      await loadData();
    } catch {
      toast.error('Failed to add maintenance item');
    } finally {
      setSaving(false);
    }
  }

  async function quickUpdate(id: number, patch: Record<string, unknown>) {
    setSaving(true);
    try {
      const res = await fetchApi('/api/maintenance', {
        method: 'PATCH',
        body: JSON.stringify({ id, ...patch }),
      });
      if (!res.success) {
        toast.error('Update failed', res.message);
        return;
      }
      await loadData();
    } catch {
      toast.error('Update failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <PremiumPage>
      <PageHeader
        title="Maintenance Register"
        subtitle="Track room and facility issues, repair costs, cash disbursements, and fix progress."
        actions={
          <button type="button" className="btn btn-premium-outline btn-sm" onClick={() => void loadData()}>
            Refresh
          </button>
        }
      />

      <div className="row g-3 mb-3">
        <div className="col-md-3"><PremiumCard title="Total logged">{summary.total}</PremiumCard></div>
        <div className="col-md-3"><PremiumCard title="Open items">{summary.open}</PremiumCard></div>
        <div className="col-md-3"><PremiumCard title="Fixed">{summary.fixed}</PremiumCard></div>
        <div className="col-md-3"><PremiumCard title="Critical">{summary.critical}</PremiumCard></div>
      </div>

      <div className="row g-3">
        <div className="col-lg-4">
          <PremiumCard title="Add maintenance entry">
            <form className="premium-form" onSubmit={handleCreate}>
              <div className="mb-2">
                <select className="form-select" value={form.room_id} onChange={(e) => setForm({ ...form, room_id: e.target.value })}>
                  <option value="">Link room (optional)</option>
                  {(data?.rooms ?? []).map((room) => (
                    <option key={room.id} value={room.id}>{room.room_number}</option>
                  ))}
                </select>
              </div>
              <div className="mb-2">
                <input className="form-control" placeholder="Location e.g. Room 203 / Kitchen / Lobby" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} required />
              </div>
              <div className="mb-2">
                <input className="form-control" placeholder="Item Category e.g. Air Condition" value={form.item_category} onChange={(e) => setForm({ ...form, item_category: e.target.value })} required />
              </div>
              <div className="row g-2 mb-2">
                <div className="col-6">
                  <select className="form-select" value={form.priority_level} onChange={(e) => setForm({ ...form, priority_level: e.target.value })}>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>
                <div className="col-6">
                  <input type="date" className="form-control" value={form.reported_date} onChange={(e) => setForm({ ...form, reported_date: e.target.value })} required />
                </div>
              </div>
              <div className="mb-2">
                <input className="form-control" placeholder="Action Required e.g. Replace / Maintenance" value={form.action_required} onChange={(e) => setForm({ ...form, action_required: e.target.value })} required />
              </div>
              <div className="mb-2">
                <select className="form-select" value={form.assigned_to} onChange={(e) => setForm({ ...form, assigned_to: e.target.value })}>
                  <option value="">Assign worker (optional)</option>
                  {(data?.staff ?? []).map((s) => (
                    <option key={s.id} value={s.id}>{s.name} ({s.role.replace(/_/g, ' ')})</option>
                  ))}
                </select>
              </div>
              <div className="row g-2 mb-2">
                <div className="col-6">
                  <input type="number" step="0.01" className="form-control" placeholder="Estimated cost" value={form.estimated_cost} onChange={(e) => setForm({ ...form, estimated_cost: e.target.value })} />
                </div>
                <div className="col-6">
                  <select className="form-select" value={form.current_status} onChange={(e) => setForm({ ...form, current_status: e.target.value })}>
                    <option value="reported">Reported</option>
                    <option value="scheduled">Scheduled</option>
                    <option value="in_progress">In progress</option>
                    <option value="pending_vendor">Pending vendor</option>
                    <option value="fixed">Fixed</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
              </div>
              <div className="form-check mb-2">
                <input className="form-check-input" type="checkbox" id="cash_disbursed" checked={form.cash_disbursed} onChange={(e) => setForm({ ...form, cash_disbursed: e.target.checked })} />
                <label className="form-check-label" htmlFor="cash_disbursed">Cash Disbursed</label>
              </div>
              <div className="mb-2">
                <input className="form-control" placeholder="Action taken / supplier response" value={form.action_taken} onChange={(e) => setForm({ ...form, action_taken: e.target.value })} />
              </div>
              <div className="row g-2 mb-2">
                <div className="col-6">
                  <input type="date" className="form-control" value={form.cash_disbursed_on} onChange={(e) => setForm({ ...form, cash_disbursed_on: e.target.value })} />
                </div>
                <div className="col-6">
                  <input type="date" className="form-control" value={form.date_fixed} onChange={(e) => setForm({ ...form, date_fixed: e.target.value })} />
                </div>
              </div>
              <div className="mb-3">
                <textarea className="form-control" rows={3} placeholder="Remarks" value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} />
              </div>
              <button className="btn btn-premium" type="submit" disabled={saving}>Save entry</button>
            </form>
          </PremiumCard>
        </div>

        <div className="col-lg-8">
          <PremiumCard title="Maintenance tracker" flush>
            {loading ? (
              <LoadingState label="Loading maintenance register…" />
            ) : filteredLogs.length === 0 ? (
              <EmptyState message="No maintenance entries yet." icon="ti-tool" />
            ) : (
              <>
                <div className="d-flex gap-2 p-3 border-bottom">
                  <select className="form-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                    <option value="all">All statuses</option>
                    <option value="reported">Reported</option>
                    <option value="scheduled">Scheduled</option>
                    <option value="in_progress">In progress</option>
                    <option value="pending_vendor">Pending vendor</option>
                    <option value="fixed">Fixed</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                  <select className="form-select" value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)}>
                    <option value="all">All priorities</option>
                    <option value="critical">Critical</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </div>
                <div className="table-responsive">
                  <table className="table premium-table mb-0">
                    <thead>
                      <tr>
                        <th>Location</th>
                        <th>Category</th>
                        <th>Priority</th>
                        <th>Action</th>
                        <th>Status</th>
                        <th>Cost</th>
                        <th>Assignee</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {filteredLogs.map((log) => (
                        <tr key={log.id}>
                          <td>
                            <strong>{log.location}</strong>
                            <div className="small text-muted">{log.reported_date}</div>
                          </td>
                          <td>
                            {log.item_category}
                            {log.remarks ? <div className="small text-muted">{log.remarks}</div> : null}
                          </td>
                          <td className="text-capitalize">{log.priority_level}</td>
                          <td>{log.action_required}</td>
                          <td><StatusBadge status={log.current_status} /></td>
                          <td>{log.estimated_cost != null ? `GHS ${Number(log.estimated_cost).toFixed(2)}` : '—'}</td>
                          <td>{log.assignee_name || '—'}</td>
                          <td className="text-end text-nowrap">
                            {log.current_status !== 'fixed' ? (
                              <button className="btn btn-sm btn-outline-secondary me-1" onClick={() => void quickUpdate(log.id, { current_status: 'in_progress' })} disabled={saving}>
                                Start
                              </button>
                            ) : null}
                            {log.current_status !== 'fixed' ? (
                              <button className="btn btn-sm btn-premium" onClick={() => void quickUpdate(log.id, { current_status: 'fixed', date_fixed: new Date().toISOString().slice(0, 10) })} disabled={saving}>
                                Mark fixed
                              </button>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </PremiumCard>
        </div>
      </div>
    </PremiumPage>
  );
}
