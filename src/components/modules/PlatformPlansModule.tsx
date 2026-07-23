'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useToast } from '@/components/ui/ToastProvider';
import {
  PremiumPage,
  PageHeader,
  PremiumCard,
  LoadingState,
  EmptyState,
  StatusBadge,
} from '@/components/ui/premium';
import { fetchApi } from '@/lib/client/fetch-api';
import { calcYearlyPrice } from '@/lib/platform/plan-pricing';

type Plan = {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  monthly_price: number;
  yearly_price: number;
  currency: string;
  max_properties: number | null;
  is_active: number;
};

type Company = {
  id: number;
  name: string;
  slug: string;
  status: string;
  plan_id: number | null;
  plan_name: string | null;
  subscription_status: string | null;
  monthly_price: number | null;
  currency: string | null;
};

type PlansData = {
  plans: Plan[];
  companies: Company[];
};

export default function PlatformPlansModule() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState<PlansData | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [assignCompanyId, setAssignCompanyId] = useState('');
  const [assignPlanId, setAssignPlanId] = useState('');
  const [createForm, setCreateForm] = useState({
    name: '',
    slug: '',
    monthly_price: '',
    description: '',
    max_properties: '',
  });
  const [editForm, setEditForm] = useState({
    name: '',
    monthly_price: '',
    is_active: true,
    max_properties: '',
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchApi<PlansData>('/api/platform/plans');
      if (!res.success) {
        toast.error('Failed to load plans', res.message);
        return;
      }
      setData(res.data ?? null);
    } catch {
      toast.error('Failed to load plans');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetchApi('/api/platform/plans', {
        method: 'POST',
        body: JSON.stringify({
          action: 'create',
          name: createForm.name,
          slug: createForm.slug,
          monthly_price: Number(createForm.monthly_price),
          description: createForm.description || undefined,
          max_properties: createForm.max_properties ? Number(createForm.max_properties) : undefined,
        }),
      });
      if (!res.success) {
        toast.error('Failed to create plan', res.message);
        return;
      }
      toast.success('Plan created');
      setCreateForm({ name: '', slug: '', monthly_price: '', description: '', max_properties: '' });
      setShowCreate(false);
      await loadData();
    } catch {
      toast.error('Failed to create plan');
    } finally {
      setSaving(false);
    }
  }

  function startEdit(plan: Plan) {
    setEditingId(plan.id);
    setEditForm({
      name: plan.name,
      monthly_price: String(plan.monthly_price),
      is_active: Boolean(plan.is_active),
      max_properties: plan.max_properties != null ? String(plan.max_properties) : '',
    });
  }

  async function handleUpdate(e: FormEvent) {
    e.preventDefault();
    if (!editingId) return;
    setSaving(true);
    try {
      const res = await fetchApi('/api/platform/plans', {
        method: 'POST',
        body: JSON.stringify({
          action: 'update',
          id: editingId,
          name: editForm.name,
          monthly_price: Number(editForm.monthly_price),
          is_active: editForm.is_active,
          max_properties: editForm.max_properties ? Number(editForm.max_properties) : null,
        }),
      });
      if (!res.success) {
        toast.error('Failed to update plan', res.message);
        return;
      }
      toast.success('Plan updated');
      setEditingId(null);
      await loadData();
    } catch {
      toast.error('Failed to update plan');
    } finally {
      setSaving(false);
    }
  }

  async function handleAssign(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetchApi('/api/platform/plans', {
        method: 'POST',
        body: JSON.stringify({
          action: 'assign',
          company_id: Number(assignCompanyId),
          plan_id: Number(assignPlanId),
        }),
      });
      if (!res.success) {
        toast.error('Failed to assign plan', res.message);
        return;
      }
      toast.success('Plan assigned to company');
      setAssignCompanyId('');
      setAssignPlanId('');
      await loadData();
    } catch {
      toast.error('Failed to assign plan');
    } finally {
      setSaving(false);
    }
  }

  return (
    <PremiumPage>
      <PageHeader
        variant="platform"
        title="Subscription Plans"
        subtitle="Manage SaaS plans and company assignments."
        icon="ti-layers-subtract"
        actions={
          <button type="button" className="btn btn-premium" onClick={() => setShowCreate(!showCreate)}>
            {showCreate ? 'Cancel' : 'Create Plan'}
          </button>
        }
      />

      {showCreate ? (
        <PremiumCard title="New Plan">
          <form className="premium-form" onSubmit={handleCreate}>
            <div className="row g-3">
              <div className="col-md-4">
                <label className="form-label">Name</label>
                <input
                  className="form-control"
                  value={createForm.name}
                  onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                  required
                />
              </div>
              <div className="col-md-4">
                <label className="form-label">Slug</label>
                <input
                  className="form-control"
                  value={createForm.slug}
                  onChange={(e) => setCreateForm({ ...createForm, slug: e.target.value })}
                  required
                />
              </div>
              <div className="col-md-4">
                <label className="form-label">Max Properties</label>
                <input
                  type="number"
                  className="form-control"
                  value={createForm.max_properties}
                  onChange={(e) => setCreateForm({ ...createForm, max_properties: e.target.value })}
                />
              </div>
              <div className="col-md-6">
                <label className="form-label">Monthly Price</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className="form-control"
                  value={createForm.monthly_price}
                  onChange={(e) => setCreateForm({ ...createForm, monthly_price: e.target.value })}
                  required
                />
              </div>
              <div className="col-md-6">
                <label className="form-label">Yearly Price</label>
                <div className="form-control bg-light text-secondary">
                  {createForm.monthly_price
                    ? `GHS ${calcYearlyPrice(Number(createForm.monthly_price)).toFixed(2)} (monthly × 10)`
                    : 'Calculated automatically (monthly × 10)'}
                </div>
              </div>
              <div className="col-12">
                <label className="form-label">Description</label>
                <textarea
                  className="form-control"
                  rows={2}
                  value={createForm.description}
                  onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                />
              </div>
              <div className="col-12">
                <button type="submit" className="btn btn-premium" disabled={saving}>
                  {saving ? 'Saving…' : 'Create Plan'}
                </button>
              </div>
            </div>
          </form>
        </PremiumCard>
      ) : null}

      {editingId ? (
        <PremiumCard title="Edit Plan" className="border-primary">
          <form className="premium-form" onSubmit={handleUpdate}>
            <div className="row g-3">
              <div className="col-md-4">
                <label className="form-label">Name</label>
                <input
                  className="form-control"
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  required
                />
              </div>
              <div className="col-md-4">
                <label className="form-label">Monthly Price</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className="form-control"
                  value={editForm.monthly_price}
                  onChange={(e) => setEditForm({ ...editForm, monthly_price: e.target.value })}
                  required
                />
              </div>
              <div className="col-md-4">
                <label className="form-label">Yearly Price</label>
                <div className="form-control bg-light text-secondary">
                  {editForm.monthly_price
                    ? `GHS ${calcYearlyPrice(Number(editForm.monthly_price)).toFixed(2)} (monthly × 10)`
                    : '—'}
                </div>
              </div>
              <div className="col-md-4">
                <label className="form-label">Max Properties</label>
                <input
                  type="number"
                  className="form-control"
                  value={editForm.max_properties}
                  onChange={(e) => setEditForm({ ...editForm, max_properties: e.target.value })}
                />
              </div>
              <div className="col-md-4 d-flex align-items-end">
                <div className="form-check">
                  <input
                    className="form-check-input"
                    type="checkbox"
                    id="plan-active"
                    checked={editForm.is_active}
                    onChange={(e) => setEditForm({ ...editForm, is_active: e.target.checked })}
                  />
                  <label className="form-check-label" htmlFor="plan-active">
                    Active
                  </label>
                </div>
              </div>
              <div className="col-12">
                <button type="submit" className="btn btn-premium me-2" disabled={saving}>
                  Save Changes
                </button>
                <button type="button" className="btn btn-premium-outline" onClick={() => setEditingId(null)}>
                  Cancel
                </button>
              </div>
            </div>
          </form>
        </PremiumCard>
      ) : null}

      <PremiumCard title="Plans" flush>
        {loading ? (
          <LoadingState label="Loading plans…" />
        ) : (data?.plans ?? []).length === 0 ? (
          <EmptyState message="No plans yet." icon="ti-layers-subtract" />
        ) : (
          <div className="table-responsive">
            <table className="table premium-table mb-0">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Slug</th>
                  <th>Monthly</th>
                  <th>Yearly</th>
                  <th>Max Props</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {data?.plans.map((p) => (
                  <tr key={p.id}>
                    <td className="fw-medium">{p.name}</td>
                    <td>
                      <code>{p.slug}</code>
                    </td>
                    <td>
                      {p.currency} {Number(p.monthly_price).toFixed(2)}
                    </td>
                    <td>
                      {p.currency} {Number(p.yearly_price).toFixed(2)}
                    </td>
                    <td>{p.max_properties ?? '∞'}</td>
                    <td>
                      {p.is_active ? (
                        <StatusBadge status="active" />
                      ) : (
                        <span className="premium-badge premium-badge--muted">Inactive</span>
                      )}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-sm btn-premium-outline"
                        onClick={() => startEdit(p)}
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </PremiumCard>

      <PremiumCard title="Assign Plan to Company">
        <form className="premium-form" onSubmit={handleAssign}>
          <div className="row g-3 align-items-end">
            <div className="col-md-5">
              <label className="form-label">Company</label>
              <select
                className="form-select"
                value={assignCompanyId}
                onChange={(e) => setAssignCompanyId(e.target.value)}
                required
              >
                <option value="">Select company…</option>
                {(data?.companies ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.plan_name ? `(${c.plan_name})` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-md-5">
              <label className="form-label">Plan</label>
              <select
                className="form-select"
                value={assignPlanId}
                onChange={(e) => setAssignPlanId(e.target.value)}
                required
              >
                <option value="">Select plan…</option>
                {(data?.plans ?? []).filter((p) => p.is_active).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-md-2">
              <button type="submit" className="btn btn-premium w-100" disabled={saving}>
                Assign
              </button>
            </div>
          </div>
        </form>
      </PremiumCard>
    </PremiumPage>
  );
}
