'use client';

import { FormEvent, useState } from 'react';
import { useToast } from '@/components/ui/ToastProvider';
import { useConfirm } from '@/components/ui/ConfirmProvider';
import PremiumModal from '@/components/ui/PremiumModal';
import { StatusBadge } from '@/components/ui/premium';
import { DEFAULT_PASSWORD } from '@/lib/config';
import { formatDisplayDate } from '@/lib/dates/format-display-date';

export type PlatformHotelRow = {
  id: number;
  name: string;
  slug: string;
  status: string;
  db_name?: string;
  created_at?: string;
};

type Props = {
  hotels: PlatformHotelRow[];
  showDatabase?: boolean;
  showCreated?: boolean;
  onChanged?: () => void;
};

export default function PlatformHotelsTable({
  hotels,
  showDatabase = false,
  showCreated = false,
  onChanged,
}: Props) {
  const toast = useToast();
  const confirm = useConfirm();
  const [busyId, setBusyId] = useState<number | null>(null);
  const [editing, setEditing] = useState<PlatformHotelRow | null>(null);
  const [editForm, setEditForm] = useState({ name: '', slug: '', status: 'trial' });
  const [saving, setSaving] = useState(false);

  function openEdit(hotel: PlatformHotelRow) {
    setEditing(hotel);
    setEditForm({
      name: hotel.name,
      slug: hotel.slug,
      status: hotel.status,
    });
  }

  async function runAction(
    hotel: PlatformHotelRow,
    action: 'suspend' | 'reset_owner_password' | 'delete',
    options: {
      title: string;
      message: string;
      confirmLabel: string;
      tone?: 'default' | 'danger' | 'warning';
    }
  ) {
    const ok = await confirm(options);
    if (!ok) return;

    setBusyId(hotel.id);
    try {
      if (action === 'delete') {
        const res = await fetch(`/api/platform/hotels/${hotel.id}`, { method: 'DELETE' });
        const json = await res.json();
        if (!json.success) {
          toast.error('Delete failed', json.message);
          return;
        }
        toast.success('Hotel deleted', json.message);
      } else {
        const res = await fetch(`/api/platform/hotels/${hotel.id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action }),
        });
        const json = await res.json();
        if (!json.success) {
          toast.error('Action failed', json.message);
          return;
        }
        toast.success(
          action === 'suspend' ? 'Hotel suspended' : 'Password reset',
          json.message
        );
      }
      onChanged?.();
    } catch {
      toast.error('Action failed', 'Unable to reach the platform API.');
    } finally {
      setBusyId(null);
    }
  }

  async function handleSaveEdit(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;

    setSaving(true);
    try {
      const res = await fetch(`/api/platform/hotels/${editing.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      });
      const json = await res.json();
      if (!json.success) {
        toast.error('Update failed', json.message);
        return;
      }
      toast.success('Hotel updated', json.message);
      setEditing(null);
      onChanged?.();
    } catch {
      toast.error('Update failed', 'Unable to reach the platform API.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="table-responsive">
        <table className="table premium-table mb-0">
          <thead>
            <tr>
              <th>{showDatabase ? 'Name' : 'Hotel'}</th>
              <th>Slug</th>
              <th>Status</th>
              {showDatabase ? <th>Database</th> : null}
              {showCreated ? <th>Created</th> : null}
              <th className="text-end">Actions</th>
            </tr>
          </thead>
          <tbody>
            {hotels.map((hotel) => {
              const busy = busyId === hotel.id;
              return (
                <tr key={hotel.id}>
                  <td className={showDatabase ? 'fw-medium' : undefined}>{hotel.name}</td>
                  <td>
                    <code>{hotel.slug}</code>
                  </td>
                  <td>
                    <StatusBadge status={hotel.status} />
                  </td>
                  {showDatabase ? (
                    <td>
                      <code className="small">{hotel.db_name}</code>
                    </td>
                  ) : null}
                  {showCreated ? (
                    <td className="small text-muted">
                      {hotel.created_at ? formatDisplayDate(hotel.created_at) : '—'}
                    </td>
                  ) : null}
                  <td className="text-end">
                    <div className="btn-group btn-group-sm">
                      <button
                        type="button"
                        className="btn btn-outline-secondary"
                        onClick={() => openEdit(hotel)}
                        disabled={busy}
                        title="Edit hotel"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="btn btn-outline-secondary"
                        onClick={() =>
                          void runAction(hotel, 'reset_owner_password', {
                            title: 'Reset owner password',
                            message: `Reset the owner password for ${hotel.name} to ${DEFAULT_PASSWORD}? They must change it on next login.`,
                            confirmLabel: 'Reset password',
                          })
                        }
                        disabled={busy}
                        title="Reset owner password"
                      >
                        Reset
                      </button>
                      {hotel.status !== 'suspended' ? (
                        <button
                          type="button"
                          className="btn btn-outline-warning"
                          onClick={() =>
                            void runAction(hotel, 'suspend', {
                              title: 'Suspend hotel',
                              message: `Suspend ${hotel.name}? Staff will not be able to sign in until the hotel is reactivated.`,
                              confirmLabel: 'Suspend hotel',
                              tone: 'warning',
                            })
                          }
                          disabled={busy}
                          title="Suspend hotel"
                        >
                          Suspend
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="btn btn-outline-danger"
                        onClick={() =>
                          void runAction(hotel, 'delete', {
                            title: 'Delete hotel',
                            message: `Delete ${hotel.name} permanently? This removes the central record and drops database ${hotel.db_name || 'tenant'}.`,
                            confirmLabel: 'Delete hotel',
                            tone: 'danger',
                          })
                        }
                        disabled={busy}
                        title="Delete hotel"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <PremiumModal
        open={Boolean(editing)}
        title={editing ? `Edit ${editing.name}` : 'Edit hotel'}
        onClose={() => setEditing(null)}
        footer={
          <>
            <button
              type="button"
              className="btn btn-outline-secondary btn-sm"
              onClick={() => setEditing(null)}
              disabled={saving}
            >
              Cancel
            </button>
            <button type="submit" form="edit-platform-hotel-form" className="btn btn-premium btn-sm" disabled={saving}>
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </>
        }
      >
        {editing ? (
          <form id="edit-platform-hotel-form" className="premium-form" onSubmit={handleSaveEdit}>
            <div className="mb-3">
              <label className="form-label">Hotel name</label>
              <input
                className="form-control"
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                required
                disabled={saving}
              />
            </div>
            <div className="mb-3">
              <label className="form-label">Slug</label>
              <input
                className="form-control font-monospace"
                value={editForm.slug}
                onChange={(e) => setEditForm({ ...editForm, slug: e.target.value })}
                required
                disabled={saving}
                spellCheck={false}
              />
            </div>
            <div className="mb-3">
              <label className="form-label">Status</label>
              <select
                className="form-select"
                value={editForm.status}
                onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                disabled={saving}
              >
                <option value="trial">Trial</option>
                <option value="active">Active</option>
                <option value="suspended">Suspended</option>
              </select>
            </div>
            {editing.db_name ? (
              <div className="small text-muted">
                Database: <code>{editing.db_name}</code> (cannot be changed after provisioning)
              </div>
            ) : null}
          </form>
        ) : null}
      </PremiumModal>
    </>
  );
}
