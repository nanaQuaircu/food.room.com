'use client';

import { FormEvent, useState } from 'react';
import { useToast } from '@/components/ui/ToastProvider';
import { PremiumCard } from '@/components/ui/premium';
import { DEFAULT_PASSWORD } from '@/lib/config';
import {
  normalizeDatabaseName,
  suggestDatabaseNameFromHotelName,
} from '@/lib/tenant/database-name';

type Props = {
  onSuccess?: () => void;
  onCancel?: () => void;
  showCancel?: boolean;
};

const emptyForm = {
  name: '',
  db_name: '',
  owner_name: '',
  owner_email: '',
  status: 'trial',
};

export default function ProvisionHotelForm({ onSuccess, onCancel, showCancel }: Props) {
  const toast = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [dbNameTouched, setDbNameTouched] = useState(false);
  const [form, setForm] = useState(emptyForm);

  function handleNameChange(name: string) {
    setForm((prev) => ({
      ...prev,
      name,
      db_name: dbNameTouched ? prev.db_name : suggestDatabaseNameFromHotelName(name),
    }));
  }

  function handleDbNameChange(dbName: string) {
    setDbNameTouched(true);
    setForm((prev) => ({ ...prev, db_name: dbName }));
  }

  function handleDbNameBlur() {
    setForm((prev) => ({
      ...prev,
      db_name: prev.db_name ? normalizeDatabaseName(prev.db_name) : prev.db_name,
    }));
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payload = {
        ...form,
        db_name: normalizeDatabaseName(form.db_name),
      };
      const res = await fetch('/api/platform/hotels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!json.success) {
        toast.error('Provisioning failed', json.message);
        return;
      }
      toast.success('Hotel provisioned', json.message);
      setForm(emptyForm);
      setDbNameTouched(false);
      onSuccess?.();
    } catch {
      toast.error('Provisioning failed', 'Unable to reach the platform API.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <PremiumCard title="Provision new hotel">
      <p className="small text-muted">
        Owner receives default password <strong>{DEFAULT_PASSWORD}</strong> and must change it on first login.
      </p>
      <form className="premium-form" onSubmit={handleCreate}>
        <div className="row g-3">
          <div className="col-md-6">
            <label className="form-label">Hotel name</label>
            <input
              className="form-control"
              value={form.name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="Grand Plaza Hotel"
              required
              disabled={submitting}
            />
          </div>
          <div className="col-md-6">
            <label className="form-label">Database name</label>
            <input
              className="form-control font-monospace"
              value={form.db_name}
              onChange={(e) => handleDbNameChange(e.target.value)}
              onBlur={handleDbNameBlur}
              placeholder="hotel_grand_plaza_hotel"
              required
              disabled={submitting}
              spellCheck={false}
              autoComplete="off"
            />
            <div className="form-text">
              Stored in the central registry and used as the MySQL database name for this hotel.
            </div>
          </div>
          <div className="col-md-6">
            <label className="form-label">Status</label>
            <select
              className="form-select"
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
              disabled={submitting}
            >
              <option value="trial">Trial</option>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
            </select>
          </div>
          <div className="col-md-6">
            <label className="form-label">Owner name</label>
            <input
              className="form-control"
              value={form.owner_name}
              onChange={(e) => setForm({ ...form, owner_name: e.target.value })}
              required
              disabled={submitting}
            />
          </div>
          <div className="col-md-6">
            <label className="form-label">Owner email</label>
            <input
              type="email"
              className="form-control"
              value={form.owner_email}
              onChange={(e) => setForm({ ...form, owner_email: e.target.value })}
              required
              disabled={submitting}
            />
          </div>
          <div className="col-12 d-flex gap-2">
            <button type="submit" className="btn btn-premium" disabled={submitting}>
              {submitting ? 'Creating hotel…' : 'Create hotel & database'}
            </button>
            {showCancel ? (
              <button
                type="button"
                className="btn btn-premium-outline"
                onClick={onCancel}
                disabled={submitting}
              >
                Cancel
              </button>
            ) : null}
          </div>
        </div>
      </form>
    </PremiumCard>
  );
}
