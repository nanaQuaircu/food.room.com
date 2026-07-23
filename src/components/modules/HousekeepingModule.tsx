'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useToast } from '@/components/ui/ToastProvider';
import {
  PremiumPage,
  PageHeader,
  PremiumCard,
  PremiumTabs,
  StatCard,
  LoadingState,
  EmptyState,
  StatusBadge,
} from '@/components/ui/premium';
import TablePagination, { paginateSlice } from '@/components/ui/TablePagination';
import { fetchApi, peekApiCache } from '@/lib/client/fetch-api';

const PAGE_SIZE = 10;

type BoardRoom = {
  id: number;
  room_number: string;
  floor: string | null;
  status: string;
  room_type_name: string;
};

type StaffMember = {
  id: number;
  name: string;
  role: string;
};

type Task = {
  id: number;
  room_id: number;
  room_number: string;
  task_type: string;
  status: string;
  notes: string | null;
  assigned_to: number | null;
  assigned_name: string | null;
  created_at: string;
};

type HousekeepingData = {
  tasks: Task[];
  board: BoardRoom[];
  staff: StaffMember[];
  tickets?: Array<{
    id: number;
    room_number: string;
    title: string;
    priority: string;
    status: string;
    assignee_name: string | null;
    description: string | null;
  }>;
};

const STATUS_META: Record<
  string,
  { label: string; tone: string; icon: string }
> = {
  vacant: { label: 'Vacant', tone: 'available', icon: 'ti-circle-check' },
  clean: { label: 'Clean', tone: 'available', icon: 'ti-sparkles' },
  inspected: { label: 'Inspected', tone: 'available', icon: 'ti-checklist' },
  occupied: { label: 'Occupied', tone: 'occupied', icon: 'ti-user' },
  dirty: { label: 'Dirty', tone: 'dirty', icon: 'ti-broom' },
  out_of_order: { label: 'Out of order', tone: 'maintenance', icon: 'ti-tool' },
  out_of_service: { label: 'Out of service', tone: 'maintenance', icon: 'ti-alert-triangle' },
};

function roomStatusMeta(status: string) {
  return (
    STATUS_META[status] || {
      label: status.replace(/_/g, ' '),
      tone: 'other',
      icon: 'ti-door',
    }
  );
}

type TaskFilter = 'active' | 'pending' | 'in_progress' | 'completed';

function initialHousekeepingData() {
  const cached = peekApiCache<HousekeepingData>('/api/housekeeping');
  return cached?.success ? (cached.data ?? null) : null;
}

export default function HousekeepingModule() {
  const toast = useToast();
  const seeded = initialHousekeepingData();
  const [loading, setLoading] = useState(!seeded);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState<HousekeepingData | null>(seeded);
  const [taskFilter, setTaskFilter] = useState<TaskFilter>('active');
  const [tasksPage, setTasksPage] = useState(1);
  const [selectedRoom, setSelectedRoom] = useState<BoardRoom | null>(null);
  const [form, setForm] = useState({ room_id: '', task_type: 'clean', notes: '', assigned_to: '' });
  const [ticketForm, setTicketForm] = useState({
    room_id: '',
    title: '',
    description: '',
    priority: 'medium',
    assigned_to: '',
  });
  const [view, setView] = useState<'board' | 'tickets'>('board');

  const loadData = useCallback(async (opts?: { silent?: boolean; notify?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    try {
      const res = await fetchApi<HousekeepingData>('/api/housekeeping');
      if (!res.success) {
        toast.error('Failed to load housekeeping', res.message);
        return;
      }
      setData(res.data ?? null);
      if (opts?.notify) {
        toast.success('Board refreshed', 'Room status and tasks are up to date.');
      }
    } catch {
      toast.error('Failed to load housekeeping');
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void loadData({ silent: Boolean(seeded) });

    const tick = () => {
      if (document.visibilityState === 'hidden') return;
      void loadData({ silent: true });
    };

    const timer = window.setInterval(tick, 60000);
    const onVis = () => {
      if (document.visibilityState === 'visible') void loadData({ silent: true });
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVis);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seed once; poll thereafter
  }, [loadData]);

  const filteredTasks = useMemo(() => {
    const tasks = data?.tasks ?? [];
    if (taskFilter === 'active') {
      return tasks.filter((t) => t.status === 'pending' || t.status === 'in_progress');
    }
    if (taskFilter === 'completed') {
      return tasks.filter((t) => t.status === 'completed' || t.status === 'cancelled');
    }
    return tasks.filter((t) => t.status === taskFilter);
  }, [data?.tasks, taskFilter]);

  const tasksPaged = useMemo(
    () => paginateSlice(filteredTasks, tasksPage, PAGE_SIZE),
    [filteredTasks, tasksPage]
  );

  const boardCounts = useMemo(() => {
    const board = data?.board ?? [];
    return {
      dirty: board.filter((r) => r.status === 'dirty').length,
      vacant: board.filter((r) => ['vacant', 'clean', 'inspected'].includes(r.status)).length,
      occupied: board.filter((r) => r.status === 'occupied').length,
      ooo: board.filter((r) => ['out_of_order', 'out_of_service'].includes(r.status)).length,
    };
  }, [data?.board]);

  function selectRoom(room: BoardRoom) {
    setSelectedRoom(room);
    const suggestedType =
      room.status === 'dirty'
        ? 'clean'
        : room.status === 'clean' || room.status === 'inspected'
          ? 'inspect'
          : room.status === 'out_of_order'
            ? 'maintenance'
            : 'clean';
    setForm((f) => ({
      ...f,
      room_id: String(room.id),
      task_type: suggestedType,
    }));
    const meta = roomStatusMeta(room.status);
    toast.info(
      `Room ${room.room_number} selected`,
      `${meta.label} · suggested task: ${suggestedType}`
    );
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const room = (data?.board ?? []).find((r) => String(r.id) === form.room_id);
      const assignee = (data?.staff ?? []).find((s) => String(s.id) === form.assigned_to);
      const res = await fetchApi('/api/housekeeping', {
        method: 'POST',
        body: JSON.stringify({
          room_id: Number(form.room_id),
          task_type: form.task_type,
          notes: form.notes || undefined,
          assigned_to: form.assigned_to ? Number(form.assigned_to) : undefined,
        }),
      });
      if (!res.success) {
        toast.error('Failed to create task', res.message);
        return;
      }
      toast.success(
        'Task created',
        `Room ${room?.room_number || form.room_id} · ${form.task_type}${
          assignee ? ` · assigned to ${assignee.name}` : ''
        }`
      );
      setForm({ room_id: '', task_type: 'clean', notes: '', assigned_to: '' });
      setSelectedRoom(null);
      await loadData({ silent: true });
    } catch {
      toast.error('Failed to create task');
    } finally {
      setSaving(false);
    }
  }

  async function updateTask(
    id: number,
    patch: { status?: string; assigned_to?: number | null },
    successMessage: string,
    detail?: string
  ) {
    // Show feedback immediately — Complete/Cancel felt silent while waiting on the API
    toast.success(successMessage, detail);
    try {
      const res = await fetchApi('/api/housekeeping', {
        method: 'PATCH',
        body: JSON.stringify({ id, ...patch }),
      });
      if (!res.success) {
        toast.error('Update failed', res.message || 'Could not update this task.');
        await loadData({ silent: true });
        return;
      }
      await loadData({ silent: true });
    } catch (err) {
      toast.error(
        'Update failed',
        err instanceof Error ? err.message : 'Could not reach the server.'
      );
      await loadData({ silent: true });
    }
  }

  async function setRoomStatus(roomId: number, status: string) {
    const room = (data?.board ?? []).find((r) => r.id === roomId) || selectedRoom;
    try {
      const res = await fetchApi('/api/rooms', {
        method: 'PATCH',
        body: JSON.stringify({ id: roomId, status }),
      });
      if (!res.success) {
        toast.error('Room update failed', res.message);
        return;
      }
      const label = status.replace(/_/g, ' ');
      toast.success(
        `Room ${room?.room_number || roomId} marked ${label}`,
        room?.room_type_name ? `${room.room_type_name}` : undefined
      );
      setSelectedRoom((prev) => (prev && prev.id === roomId ? { ...prev, status } : prev));
      setForm((f) =>
        f.room_id === String(roomId)
          ? {
              ...f,
              task_type:
                status === 'dirty'
                  ? 'clean'
                  : status === 'clean' || status === 'inspected' || status === 'vacant'
                    ? 'inspect'
                    : status === 'out_of_order'
                      ? 'maintenance'
                      : f.task_type,
            }
          : f
      );
      await loadData({ silent: true });
    } catch {
      toast.error('Room update failed');
    }
  }

  if (loading && !data) {
    return (
      <PremiumPage>
        <PremiumCard>
          <LoadingState label="Loading housekeeping…" />
        </PremiumCard>
      </PremiumPage>
    );
  }

  return (
    <PremiumPage>
      <PageHeader
        title="Housekeeping"
        subtitle="Room board, cleaning tasks, and maintenance tickets."
        icon="ti-brush"
        actions={
          <button
            type="button"
            className="btn btn-premium-outline btn-sm"
            onClick={() => void loadData({ notify: true })}
          >
            <i className="ti ti-refresh me-1" />
            Refresh
          </button>
        }
      />

      <PremiumTabs
        tabs={[
          { id: 'board', label: 'Board' },
          { id: 'tickets', label: 'Tickets' },
        ]}
        active={view}
        onChange={(id) => setView(id as typeof view)}
      />

      {view === 'tickets' ? (
        <div className="row g-3 mb-3">
          <div className="col-md-4">
            <PremiumCard title="Open maintenance ticket">
              <form
                className="premium-form"
                onSubmit={async (e) => {
                  e.preventDefault();
                  setSaving(true);
                  try {
                    const res = await fetchApi('/api/housekeeping', {
                      method: 'POST',
                      body: JSON.stringify({
                        type: 'ticket',
                        room_id: Number(ticketForm.room_id),
                        title: ticketForm.title,
                        description: ticketForm.description || undefined,
                        priority: ticketForm.priority,
                        assigned_to: ticketForm.assigned_to
                          ? Number(ticketForm.assigned_to)
                          : undefined,
                      }),
                    });
                    if (!res.success) {
                      toast.error('Ticket failed', res.message);
                      return;
                    }
                    toast.success('Ticket opened', 'Room set to out of order');
                    setTicketForm({
                      room_id: '',
                      title: '',
                      description: '',
                      priority: 'medium',
                      assigned_to: '',
                    });
                    await loadData({ silent: true });
                  } catch {
                    toast.error('Ticket failed');
                  } finally {
                    setSaving(false);
                  }
                }}
              >
                <div className="mb-2">
                  <select
                    className="form-select"
                    value={ticketForm.room_id}
                    onChange={(e) => setTicketForm({ ...ticketForm, room_id: e.target.value })}
                    required
                  >
                    <option value="">Room…</option>
                    {(data?.board ?? []).map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.room_number} ({r.status})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="mb-2">
                  <input
                    className="form-control"
                    placeholder="Title"
                    value={ticketForm.title}
                    onChange={(e) => setTicketForm({ ...ticketForm, title: e.target.value })}
                    required
                  />
                </div>
                <div className="mb-2">
                  <textarea
                    className="form-control"
                    rows={2}
                    placeholder="Description"
                    value={ticketForm.description}
                    onChange={(e) => setTicketForm({ ...ticketForm, description: e.target.value })}
                  />
                </div>
                <div className="mb-2">
                  <select
                    className="form-select"
                    value={ticketForm.priority}
                    onChange={(e) => setTicketForm({ ...ticketForm, priority: e.target.value })}
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
                <div className="mb-3">
                  <select
                    className="form-select"
                    value={ticketForm.assigned_to}
                    onChange={(e) => setTicketForm({ ...ticketForm, assigned_to: e.target.value })}
                  >
                    <option value="">Unassigned</option>
                    {(data?.staff ?? []).map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
                <button className="btn btn-primary" type="submit" disabled={saving}>
                  Open ticket
                </button>
              </form>
            </PremiumCard>
          </div>
          <div className="col-md-8">
            <PremiumCard title="Maintenance tickets" flush>
              {(data?.tickets ?? []).length === 0 ? (
                <EmptyState message="No maintenance tickets." icon="ti-tool" />
              ) : (
                <div className="table-responsive">
                  <table className="table premium-table mb-0">
                    <thead>
                      <tr>
                        <th>Room</th>
                        <th>Title</th>
                        <th>Priority</th>
                        <th>Status</th>
                        <th>Assignee</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {(data?.tickets ?? []).map((t) => (
                        <tr key={t.id}>
                          <td>{t.room_number}</td>
                          <td>
                            {t.title}
                            {t.description ? (
                              <div className="small text-muted">{t.description}</div>
                            ) : null}
                          </td>
                          <td className="text-capitalize">{t.priority}</td>
                          <td>
                            <StatusBadge status={t.status} />
                          </td>
                          <td>{t.assignee_name || '—'}</td>
                          <td className="text-end">
                            {t.status === 'open' || t.status === 'in_progress' ? (
                              <>
                                {t.status === 'open' ? (
                                  <button
                                    type="button"
                                    className="btn btn-sm btn-outline-secondary me-1"
                                    disabled={saving}
                                    onClick={async () => {
                                      setSaving(true);
                                      await fetchApi('/api/housekeeping', {
                                        method: 'PATCH',
                                        body: JSON.stringify({
                                          type: 'ticket',
                                          id: t.id,
                                          status: 'in_progress',
                                        }),
                                      });
                                      setSaving(false);
                                      await loadData({ silent: true });
                                    }}
                                  >
                                    Start
                                  </button>
                                ) : null}
                                <button
                                  type="button"
                                  className="btn btn-sm btn-premium"
                                  disabled={saving}
                                  onClick={async () => {
                                    setSaving(true);
                                    const res = await fetchApi('/api/housekeeping', {
                                      method: 'PATCH',
                                      body: JSON.stringify({
                                        type: 'ticket',
                                        id: t.id,
                                        status: 'resolved',
                                      }),
                                    });
                                    setSaving(false);
                                    if (!res.success) {
                                      toast.error('Resolve failed', res.message);
                                      return;
                                    }
                                    toast.success('Ticket resolved', 'Room restored from OOO');
                                    await loadData({ silent: true });
                                  }}
                                >
                                  Resolve
                                </button>
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
          </div>
        </div>
      ) : null}

      {view === 'board' ? (
      <>
      <div className="row g-3 mb-3 premium-dashboard-row">
        <div className="col-6 col-md-3">
          <StatCard
            label="Dirty rooms"
            value={boardCounts.dirty}
            icon="ti-broom"
            tone="warning"
            featured
          />
        </div>
        <div className="col-6 col-md-3">
          <StatCard label="Available" value={boardCounts.vacant} icon="ti-circle-check" tone="success" />
        </div>
        <div className="col-6 col-md-3">
          <StatCard label="Occupied" value={boardCounts.occupied} icon="ti-user" tone="info" />
        </div>
        <div className="col-6 col-md-3">
          <StatCard label="Out of order" value={boardCounts.ooo} icon="ti-tool" tone="danger" />
        </div>
      </div>

      <PremiumCard
        title="Room Status Board"
        actions={
          <div className="hk-board-legend" aria-hidden="true">
            <span className="hk-board-legend__item hk-board-legend__item--available">Available</span>
            <span className="hk-board-legend__item hk-board-legend__item--occupied">Occupied</span>
            <span className="hk-board-legend__item hk-board-legend__item--dirty">Dirty</span>
            <span className="hk-board-legend__item hk-board-legend__item--maintenance">OOO</span>
          </div>
        }
      >
        <p className="hk-board-hint">
          Tap a room to create a task. Flow: check-out → <strong>dirty</strong> → clean →{' '}
          <strong>inspected / vacant</strong> (ready to sell).
        </p>
        {(data?.board ?? []).length === 0 ? (
          <EmptyState message="No rooms." icon="ti-building" />
        ) : (
          <div className="hk-room-grid">
            {data?.board.map((room, index) => {
              const meta = roomStatusMeta(room.status);
              const selected = selectedRoom?.id === room.id;
              return (
                <button
                  key={room.id}
                  type="button"
                  className={`hk-room-card hk-room-card--${meta.tone}${selected ? ' is-selected' : ''}`}
                  style={{ animationDelay: `${Math.min(index, 18) * 0.03}s` }}
                  onClick={() => selectRoom(room)}
                >
                  <div className="hk-room-card__top">
                    <span className="hk-room-card__number">{room.room_number}</span>
                    <span className={`hk-room-card__badge hk-room-card__badge--${meta.tone}`}>
                      <i className={`ti ${meta.icon}`} />
                      {meta.label}
                    </span>
                  </div>
                  <div className="hk-room-card__type">{room.room_type_name}</div>
                  {room.floor ? (
                    <div className="hk-room-card__meta">Floor {room.floor}</div>
                  ) : (
                    <div className="hk-room-card__meta">Tap to assign task</div>
                  )}
                  <span className="hk-room-card__accent" aria-hidden="true" />
                </button>
              );
            })}
          </div>
        )}
        {selectedRoom ? (
          <div className="hk-room-actions">
            <div className="hk-room-actions__info">
              <span className="hk-room-actions__label">Selected</span>
              <strong>Room {selectedRoom.room_number}</strong>
              <span className="hk-room-actions__type">
                {selectedRoom.room_type_name} · {roomStatusMeta(selectedRoom.status).label}
              </span>
            </div>
            <div className="hk-room-actions__btns">
              {selectedRoom.status !== 'dirty' ? (
                <button
                  type="button"
                  className="btn btn-sm btn-premium-outline"
                  onClick={() => void setRoomStatus(selectedRoom.id, 'dirty')}
                >
                  Mark dirty
                </button>
              ) : null}
              {!['vacant', 'clean', 'inspected'].includes(selectedRoom.status) ? (
                <button
                  type="button"
                  className="btn btn-sm btn-premium"
                  onClick={() => void setRoomStatus(selectedRoom.id, 'vacant')}
                >
                  Mark vacant
                </button>
              ) : null}
              {!['out_of_order', 'out_of_service'].includes(selectedRoom.status) ? (
                <button
                  type="button"
                  className="btn btn-sm btn-outline-danger"
                  onClick={() => void setRoomStatus(selectedRoom.id, 'out_of_order')}
                >
                  Out of order
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-sm btn-premium"
                  onClick={() => void setRoomStatus(selectedRoom.id, 'vacant')}
                >
                  Restore vacant
                </button>
              )}
            </div>
          </div>
        ) : null}
      </PremiumCard>

      <div className="row g-3">
        <div className="col-lg-4">
          <PremiumCard title="Create Task">
            <form className="premium-form" onSubmit={handleCreate}>
              <div className="mb-3">
                <label className="form-label">Room</label>
                <select
                  className="form-select"
                  value={form.room_id}
                  onChange={(e) => setForm({ ...form, room_id: e.target.value })}
                  required
                >
                  <option value="">Select room…</option>
                  {(data?.board ?? []).map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.room_number} — {r.status}
                    </option>
                  ))}
                </select>
              </div>
              <div className="mb-3">
                <label className="form-label">Task Type</label>
                <select
                  className="form-select"
                  value={form.task_type}
                  onChange={(e) => setForm({ ...form, task_type: e.target.value })}
                >
                  <option value="clean">Clean</option>
                  <option value="inspect">Inspect</option>
                  <option value="maintenance">Maintenance</option>
                  <option value="turndown">Turndown</option>
                </select>
              </div>
              <div className="mb-3">
                <label className="form-label">Assign to</label>
                <select
                  className="form-select"
                  value={form.assigned_to}
                  onChange={(e) => setForm({ ...form, assigned_to: e.target.value })}
                >
                  <option value="">Unassigned</option>
                  {(data?.staff ?? []).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="mb-3">
                <label className="form-label">Notes</label>
                <textarea
                  className="form-control"
                  rows={2}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </div>
              <button type="submit" className="btn btn-premium" disabled={saving}>
                {saving ? 'Saving…' : 'Create Task'}
              </button>
            </form>
          </PremiumCard>
        </div>

        <div className="col-lg-8">
          <PremiumCard
            title="Tasks"
            flush
            actions={
              <div className="btn-group btn-group-sm">
                {(
                  [
                    ['active', 'Active'],
                    ['pending', 'Pending'],
                    ['in_progress', 'In progress'],
                    ['completed', 'Done'],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    className={`btn ${taskFilter === id ? 'btn-premium' : 'btn-outline-secondary'}`}
                    onClick={() => {
                      setTaskFilter(id);
                      setTasksPage(1);
                      toast.info(
                        id === 'completed' ? 'Showing completed tasks' : `Showing ${label.toLowerCase()} tasks`
                      );
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            }
          >
            {filteredTasks.length === 0 ? (
              <EmptyState message="No tasks in this view." icon="ti-list-check" />
            ) : (
              <>
                <div className="table-responsive">
                  <table className="table premium-table mb-0">
                    <thead>
                      <tr>
                        <th>Room</th>
                        <th>Type</th>
                        <th>Status</th>
                        <th>Assigned</th>
                        <th>Notes</th>
                        <th className="text-end">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tasksPaged.items.map((t) => (
                        <tr key={t.id}>
                          <td className="fw-medium">{t.room_number}</td>
                          <td className="text-capitalize">{t.task_type}</td>
                          <td>
                            <StatusBadge status={t.status} />
                          </td>
                          <td>
                            {(data?.staff ?? []).length > 0 ? (
                              <select
                                className="form-select form-select-sm"
                                value={t.assigned_to ?? ''}
                                disabled={t.status === 'completed' || t.status === 'cancelled'}
                                onChange={(e) => {
                                  const staffId = e.target.value;
                                  const staffName =
                                    (data?.staff ?? []).find((s) => String(s.id) === staffId)?.name ||
                                    'Unassigned';
                                  void updateTask(
                                    t.id,
                                    {
                                      assigned_to: staffId ? Number(staffId) : null,
                                    },
                                    staffId ? 'Staff assigned' : 'Task unassigned',
                                    `Room ${t.room_number} · ${staffName}`
                                  );
                                }}
                              >
                                <option value="">Unassigned</option>
                                {(data?.staff ?? []).map((s) => (
                                  <option key={s.id} value={s.id}>
                                    {s.name}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              t.assigned_name || '—'
                            )}
                          </td>
                          <td>{t.notes || '—'}</td>
                          <td className="text-end">
                            <div className="btn-group btn-group-sm">
                              {t.status === 'pending' ? (
                                <button
                                  type="button"
                                  className="btn btn-outline-primary"
                                  disabled={!t.assigned_to}
                                  title={
                                    t.assigned_to
                                      ? 'Start this task'
                                      : 'Assign a housekeeper before starting'
                                  }
                                  onClick={() =>
                                    void updateTask(
                                      t.id,
                                      { status: 'in_progress' },
                                      'Task started',
                                      `Room ${t.room_number} · ${t.task_type}`
                                    )
                                  }
                                >
                                  Start
                                </button>
                              ) : null}
                              {t.status !== 'completed' && t.status !== 'cancelled' ? (
                                <>
                                  <button
                                    type="button"
                                    className="btn btn-premium"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      void updateTask(
                                        t.id,
                                        { status: 'completed' },
                                        'Task completed',
                                        `Room ${t.room_number} · ${t.task_type}`
                                      );
                                    }}
                                  >
                                    Complete
                                  </button>
                                  <button
                                    type="button"
                                    className="btn btn-outline-danger"
                                    onClick={() =>
                                      void updateTask(
                                        t.id,
                                        { status: 'cancelled' },
                                        'Task cancelled',
                                        `Room ${t.room_number} · ${t.task_type}`
                                      )
                                    }
                                  >
                                    Cancel
                                  </button>
                                </>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <TablePagination
                  page={tasksPage}
                  pageSize={PAGE_SIZE}
                  total={filteredTasks.length}
                  onPageChange={setTasksPage}
                />
              </>
            )}
          </PremiumCard>
        </div>
      </div>
      </>
      ) : null}
    </PremiumPage>
  );
}
