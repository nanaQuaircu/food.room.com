'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useToast } from '@/components/ui/ToastProvider';
import { useConfirm } from '@/components/ui/ConfirmProvider';
import {
  PremiumPage,
  PageHeader,
  PremiumCard,
  LoadingState,
  EmptyState,
  StatusBadge,
} from '@/components/ui/premium';
import PremiumModal from '@/components/ui/PremiumModal';
import { fetchApi } from '@/lib/client/fetch-api';
import { DEFAULT_PASSWORD } from '@/lib/config';

type StaffUser = {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  is_active: number;
  must_change_password: number;
  last_login_at: string | null;
};

const ROLES = [
  'admin',
  'manager',
  'front_desk',
  'housekeeping',
  'finance',
  'cook',
  'chef',
  'kitchen_supervisor',
  'security',
  'driver',
] as const;

const emptyForm = { name: '', email: '', phone: '', role: 'front_desk' };

export default function StaffModule() {
  const toast = useToast();
  const confirm = useConfirm();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState<StaffUser | null>(null);
  const [editForm, setEditForm] = useState({
    name: '',
    email: '',
    phone: '',
    role: 'front_desk',
    is_active: true,
  });

  const loadStaff = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchApi<StaffUser[]>('/api/settings/users');
      if (!res.success) {
        toast.error('Failed to load staff', res.message);
        return;
      }
      setStaff(res.data ?? []);
    } catch {
      toast.error('Failed to load staff');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void loadStaff();
  }, [loadStaff]);

  function openEdit(user: StaffUser) {
    setEditing(user);
    setEditForm({
      name: user.name,
      email: user.email,
      phone: user.phone || '',
      role: user.role === 'owner' ? 'owner' : user.role,
      is_active: Boolean(user.is_active),
    });
  }

  function closeEdit() {
    setEditing(null);
  }

  async function handleAddStaff(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetchApi<{ id: number }>('/api/settings/users', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      if (!res.success) {
        toast.error('Failed to add staff', res.message);
        return;
      }
      toast.success('Staff user created', res.message);
      setForm(emptyForm);
      await loadStaff();
    } catch {
      toast.error('Failed to add staff');
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdateStaff(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setSaving(true);
    try {
      const res = await fetchApi('/api/settings/users', {
        method: 'PATCH',
        body: JSON.stringify({
          id: editing.id,
          action: 'update',
          name: editForm.name,
          email: editForm.email,
          phone: editForm.phone,
          role: editForm.role,
          is_active: editForm.is_active,
        }),
      });
      if (!res.success) {
        toast.error('Failed to update staff', res.message);
        return;
      }
      toast.success('Staff updated', res.message);
      closeEdit();
      await loadStaff();
    } catch {
      toast.error('Failed to update staff');
    } finally {
      setSaving(false);
    }
  }

  async function handleResetPassword(userId: number, name: string) {
    const ok = await confirm({
      title: 'Reset password',
      message: `Reset password for ${name} to the default (${DEFAULT_PASSWORD})? They must change it on next login.`,
      confirmLabel: 'Reset password',
      tone: 'warning',
    });
    if (!ok) return;
    try {
      const res = await fetchApi('/api/settings/users', {
        method: 'PATCH',
        body: JSON.stringify({ id: userId, action: 'reset_password' }),
      });
      if (!res.success) {
        toast.error('Reset failed', res.message);
        return;
      }
      toast.success('Password reset', res.message);
      await loadStaff();
    } catch {
      toast.error('Reset failed');
    }
  }

  return (
    <PremiumPage>
      <PageHeader
        title="Staff"
        subtitle="Add team members. They sign in with their email and the default password, then must set a new password."
        icon="ti-users"
      />

      <div className="row g-3 staff-layout">
        <div className="col-12 col-lg-3 staff-layout__add">
          <PremiumCard title="Add staff member">
            <p className="small text-muted mb-3">
              Default password: <strong>{DEFAULT_PASSWORD}</strong> (must be changed on first login).
              Staff must connect the hotel name on the login page before signing in.
            </p>
            <form className="premium-form" onSubmit={handleAddStaff}>
              <div className="mb-3">
                <label className="form-label">Full name</label>
                <input
                  className="form-control"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                />
              </div>
              <div className="mb-3">
                <label className="form-label">Email</label>
                <input
                  type="email"
                  className="form-control"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  required
                />
              </div>
              <div className="mb-3">
                <label className="form-label">Phone (SMS alerts)</label>
                <input
                  className="form-control"
                  placeholder="+233…"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </div>
              <div className="mb-3">
                <label className="form-label">Role</label>
                <select
                  className="form-select"
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r.replace(/_/g, ' ')}
                    </option>
                  ))}
                </select>
              </div>
              <button type="submit" className="btn btn-premium w-100" disabled={saving}>
                {saving ? 'Creating…' : 'Add staff'}
              </button>
            </form>
          </PremiumCard>
        </div>

        <div className="col-12 col-lg-9 staff-layout__list">
          <PremiumCard title="Team directory" flush>
            {loading ? (
              <LoadingState label="Loading staff…" />
            ) : staff.length === 0 ? (
              <EmptyState message="No staff members yet." icon="ti-users" />
            ) : (
              <div className="table-responsive">
                <table className="table premium-table mb-0">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Phone</th>
                      <th>Role</th>
                      <th>Status</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {staff.map((u) => (
                      <tr key={u.id}>
                        <td className="fw-medium">{u.name}</td>
                        <td>{u.email}</td>
                        <td>{u.phone || '—'}</td>
                        <td>
                          <span className="premium-badge premium-badge--muted text-capitalize">
                            {u.role.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td>
                          {u.is_active ? (
                            <StatusBadge status="active" />
                          ) : (
                            <span className="premium-badge premium-badge--muted">Inactive</span>
                          )}
                          {u.must_change_password ? (
                            <span className="premium-badge premium-badge--warning ms-1">Pending login</span>
                          ) : null}
                        </td>
                        <td>
                          <div className="d-flex flex-wrap gap-2 justify-content-end">
                            <button
                              type="button"
                              className="btn btn-sm btn-premium"
                              onClick={() => openEdit(u)}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="btn btn-sm btn-premium-outline"
                              onClick={() => void handleResetPassword(u.id, u.name)}
                            >
                              Reset password
                            </button>
                          </div>
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

      <PremiumModal
        open={Boolean(editing)}
        title={editing ? `Edit ${editing.name}` : 'Edit staff'}
        onClose={closeEdit}
        footer={
          <>
            <button type="button" className="btn btn-outline-secondary btn-sm" onClick={closeEdit}>
              Cancel
            </button>
            <button
              type="submit"
              form="edit-staff-form"
              className="btn btn-premium btn-sm"
              disabled={saving}
            >
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </>
        }
      >
        {editing ? (
          <form id="edit-staff-form" className="premium-form" onSubmit={handleUpdateStaff}>
            <div className="mb-3">
              <label className="form-label">Full name</label>
              <input
                className="form-control"
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                required
              />
            </div>
            <div className="mb-3">
              <label className="form-label">Email</label>
              <input
                type="email"
                className="form-control"
                value={editForm.email}
                onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                required
              />
            </div>
            <div className="mb-3">
              <label className="form-label">Phone (SMS alerts)</label>
              <input
                className="form-control"
                placeholder="+233…"
                value={editForm.phone}
                onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
              />
            </div>
            <div className="mb-3">
              <label className="form-label">Role</label>
              {editing.role === 'owner' ? (
                <>
                  <input className="form-control" value="Owner" readOnly />
                  <div className="form-text">Owner role cannot be changed here.</div>
                </>
              ) : (
                <select
                  className="form-select"
                  value={editForm.role}
                  onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r.replace(/_/g, ' ')}
                    </option>
                  ))}
                </select>
              )}
            </div>
            {editing.role !== 'owner' ? (
              <div className="form-check">
                <input
                  className="form-check-input"
                  type="checkbox"
                  id="staff-active"
                  checked={editForm.is_active}
                  onChange={(e) => setEditForm({ ...editForm, is_active: e.target.checked })}
                />
                <label className="form-check-label" htmlFor="staff-active">
                  Active (can sign in)
                </label>
              </div>
            ) : null}
          </form>
        ) : null}
      </PremiumModal>
    </PremiumPage>
  );
}
