'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useToast } from '@/components/ui/ToastProvider';
import { PremiumPage, PageHeader, PremiumCard, LoadingState } from '@/components/ui/premium';
import { fetchApi } from '@/lib/client/fetch-api';

type PaystackSettings = {
  paystack_enabled: boolean;
  paystack_mode: 'test' | 'live';
  paystack_public_key: string;
  paystack_secret_configured: boolean;
  paystack_secret_masked: string;
  paystack_webhook_configured: boolean;
  paystack_webhook_masked: string;
  env_fallback_active: boolean;
};

function ConfigBadge({ configured }: { configured: boolean }) {
  return (
    <span className={`premium-badge ${configured ? 'premium-badge--success' : 'premium-badge--muted'}`}>
      {configured ? 'Configured' : 'Not configured'}
    </span>
  );
}

export default function PlatformPaystackSettings() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState<PaystackSettings | null>(null);
  const [form, setForm] = useState({
    paystack_enabled: false,
    paystack_mode: 'test',
    paystack_public_key: '',
    paystack_secret_key: '',
    paystack_webhook_secret: '',
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchApi<PaystackSettings>('/api/platform/settings/paystack');
      if (!res.success) {
        toast.error('Failed to load Paystack settings', res.message);
        return;
      }
      const d = res.data;
      if (d) {
        setData(d);
        setForm({
          paystack_enabled: d.paystack_enabled,
          paystack_mode: d.paystack_mode,
          paystack_public_key: d.paystack_public_key,
          paystack_secret_key: '',
          paystack_webhook_secret: '',
        });
      }
    } catch {
      toast.error('Failed to load Paystack settings');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetchApi<PaystackSettings>('/api/platform/settings/paystack', {
        method: 'PUT',
        body: JSON.stringify(form),
      });
      if (!res.success) {
        toast.error('Could not save', res.message);
        return;
      }
      toast.success('Saved', res.message || 'Platform Paystack settings updated.');
      const d = res.data;
      if (d) {
        setData(d);
        setForm((prev) => ({
          ...prev,
          paystack_enabled: d.paystack_enabled,
          paystack_mode: d.paystack_mode,
          paystack_public_key: d.paystack_public_key,
          paystack_secret_key: '',
          paystack_webhook_secret: '',
        }));
      }
    } catch {
      toast.error('Could not save Paystack settings');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <PremiumPage>
        <PageHeader title="Settings" subtitle="Platform Paystack for tenant subscription billing" />
        <LoadingState label="Loading settings…" />
      </PremiumPage>
    );
  }

  return (
    <PremiumPage>
      <PageHeader
        title="Settings"
        subtitle="Paste Paystack keys so tenant subscription payments settle to your platform account."
      />

      <PremiumCard title="Paystack (SaaS subscriptions)">
        <form className="premium-form" onSubmit={handleSave}>
          <div className="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-3">
            <p className="small text-muted mb-0">
              These keys are for hotel plan upgrades and renewals — not guest folio payments (those stay under each
              hotel&apos;s Integrations).
            </p>
            <ConfigBadge configured={Boolean(data?.paystack_secret_configured && data?.paystack_public_key)} />
          </div>

          {data?.env_fallback_active ? (
            <div className="alert alert-info border-0 small py-2 mb-3">
              Some credentials are currently coming from server env vars. Saving here stores them in the database and
              takes priority over env.
            </div>
          ) : null}

          <div className="form-check form-switch mb-3">
            <input
              className="form-check-input"
              type="checkbox"
              id="platform_paystack_enabled"
              checked={form.paystack_enabled}
              onChange={(e) => setForm({ ...form, paystack_enabled: e.target.checked })}
            />
            <label className="form-check-label fw-semibold" htmlFor="platform_paystack_enabled">
              Enable platform Paystack
            </label>
          </div>

          <div className="row g-3">
            <div className="col-md-4">
              <label className="form-label">Environment</label>
              <select
                className="form-select"
                value={form.paystack_mode}
                onChange={(e) => setForm({ ...form, paystack_mode: e.target.value })}
              >
                <option value="test">Test</option>
                <option value="live">Live</option>
              </select>
            </div>
            <div className="col-md-8">
              <label className="form-label">Public key</label>
              <input
                className="form-control font-monospace"
                value={form.paystack_public_key}
                onChange={(e) => setForm({ ...form, paystack_public_key: e.target.value })}
                placeholder="pk_test_… or pk_live_…"
              />
            </div>
            <div className="col-md-6">
              <label className="form-label">Secret key</label>
              <input
                type="password"
                className="form-control font-monospace"
                value={form.paystack_secret_key}
                onChange={(e) => setForm({ ...form, paystack_secret_key: e.target.value })}
                placeholder={
                  data?.paystack_secret_configured ? 'Leave blank to keep current key' : 'sk_test_… or sk_live_…'
                }
              />
              {data?.paystack_secret_configured ? (
                <div className="form-text">Saved: {data.paystack_secret_masked}</div>
              ) : null}
            </div>
            <div className="col-md-6">
              <label className="form-label">Webhook secret</label>
              <input
                type="password"
                className="form-control font-monospace"
                value={form.paystack_webhook_secret}
                onChange={(e) => setForm({ ...form, paystack_webhook_secret: e.target.value })}
                placeholder={
                  data?.paystack_webhook_configured
                    ? 'Leave blank to keep current secret'
                    : 'From Paystack dashboard'
                }
              />
              {data?.paystack_webhook_configured ? (
                <div className="form-text">Saved: {data.paystack_webhook_masked}</div>
              ) : null}
            </div>
          </div>

          <p className="small text-muted mt-3 mb-3">
            Register this webhook URL in Paystack for subscription confirmations:{' '}
            <code>/api/payments/paystack/webhook</code>. Keys from{' '}
            <a href="https://dashboard.paystack.com/#/settings/developer" target="_blank" rel="noopener noreferrer">
              Paystack developer settings
            </a>
            .
          </p>

          <button type="submit" className="btn btn-premium" disabled={saving}>
            {saving ? 'Saving…' : 'Save Paystack settings'}
          </button>
        </form>
      </PremiumCard>
    </PremiumPage>
  );
}
