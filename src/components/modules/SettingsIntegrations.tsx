'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useToast } from '@/components/ui/ToastProvider';
import { PremiumCard, LoadingState } from '@/components/ui/premium';
import { fetchApi } from '@/lib/client/fetch-api';

type PaystackSettings = {
  paystack_enabled: boolean;
  paystack_mode: 'test' | 'live';
  paystack_public_key: string;
  paystack_secret_configured: boolean;
  paystack_secret_masked: string;
  paystack_webhook_configured: boolean;
  paystack_webhook_masked: string;
};

type SmsSettings = {
  mnotify_enabled: boolean;
  mnotify_sender_id: string;
  mnotify_api_key_configured: boolean;
  mnotify_api_key_masked: string;
};

type EmailSettings = {
  email_enabled: boolean;
  smtp_host: string;
  smtp_port: number;
  smtp_encryption: string;
  smtp_username: string;
  smtp_password_configured: boolean;
  smtp_password_masked: string;
  mail_from_email: string;
  mail_from_name: string;
  reply_to_email: string;
  uses_sikasoft: boolean;
};

type IntegrationData = {
  paystack: PaystackSettings;
  sms: SmsSettings;
  email: EmailSettings;
  hubtel: {
    hubtel_enabled: boolean;
    hubtel_client_id: string;
    hubtel_client_secret_configured: boolean;
    hubtel_client_secret_masked: string;
    hubtel_base_url: string;
    hubtel_pickup_address: string;
    hubtel_pickup_phone: string;
    hubtel_merchant_account: string;
  };
};

function ConfigBadge({ configured }: { configured: boolean }) {
  return (
    <span className={`premium-badge ${configured ? 'premium-badge--success' : 'premium-badge--muted'}`}>
      {configured ? 'Configured' : 'Not configured'}
    </span>
  );
}

export default function SettingsIntegrations() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [data, setData] = useState<IntegrationData | null>(null);

  const [paystackForm, setPaystackForm] = useState({
    paystack_enabled: false,
    paystack_mode: 'test',
    paystack_public_key: '',
    paystack_secret_key: '',
    paystack_webhook_secret: '',
  });

  const [smsForm, setSmsForm] = useState({
    mnotify_enabled: false,
    mnotify_sender_id: '',
    mnotify_api_key: '',
  });

  const [emailForm, setEmailForm] = useState({
    email_enabled: false,
    smtp_host: 'sikasoftonline.net',
    smtp_port: '465',
    smtp_encryption: 'ssl',
    smtp_username: 'support@sikasoftonline.net',
    smtp_password: '',
    mail_from_email: 'support@sikasoftonline.net',
    mail_from_name: '',
    reply_to_email: 'info.owniterp@gmail.com',
  });
  const [hubtelForm, setHubtelForm] = useState({
    hubtel_enabled: false,
    hubtel_client_id: '',
    hubtel_client_secret: '',
    hubtel_base_url: 'https://api.hubtel.com',
    hubtel_pickup_address: '',
    hubtel_pickup_phone: '',
    hubtel_merchant_account: '',
  });

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetchApi<IntegrationData>('/api/settings/integrations');
    if (!res.success) {
      toast.error('Failed to load integrations', res.message);
      setLoading(false);
      return;
    }
    const d = res.data;
    if (d) {
      setData(d);
      setPaystackForm({
        paystack_enabled: d.paystack.paystack_enabled,
        paystack_mode: d.paystack.paystack_mode,
        paystack_public_key: d.paystack.paystack_public_key,
        paystack_secret_key: '',
        paystack_webhook_secret: '',
      });
      setSmsForm({
        mnotify_enabled: d.sms.mnotify_enabled,
        mnotify_sender_id: d.sms.mnotify_sender_id,
        mnotify_api_key: '',
      });
      setEmailForm({
        email_enabled: d.email.email_enabled,
        smtp_host: d.email.smtp_host,
        smtp_port: String(d.email.smtp_port),
        smtp_encryption: d.email.smtp_encryption,
        smtp_username: d.email.smtp_username,
        smtp_password: '',
        mail_from_email: d.email.mail_from_email,
        mail_from_name: d.email.mail_from_name,
        reply_to_email: d.email.reply_to_email,
      });
      setHubtelForm({
        hubtel_enabled: d.hubtel.hubtel_enabled,
        hubtel_client_id: d.hubtel.hubtel_client_id,
        hubtel_client_secret: '',
        hubtel_base_url: d.hubtel.hubtel_base_url,
        hubtel_pickup_address: d.hubtel.hubtel_pickup_address || '',
        hubtel_pickup_phone: d.hubtel.hubtel_pickup_phone || '',
        hubtel_merchant_account: d.hubtel.hubtel_merchant_account || '',
      });
    }
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveSection(section: 'paystack' | 'sms' | 'email' | 'hubtel', payload: Record<string, unknown>) {
    setSaving(section);
    try {
      const res = await fetchApi(`/api/settings/integrations`, {
        method: 'PATCH',
        body: JSON.stringify({ section, ...payload }),
      });
      if (!res.success) {
        toast.error('Save failed', res.message || 'Could not save integration settings.');
        return;
      }
      toast.success('Settings saved', res.message);
      await load();
    } catch {
      toast.error('Save failed', 'Could not reach the server. Check your connection and try again.');
    } finally {
      setSaving(null);
    }
  }

  function validateSmsPayload(): string | null {
    const senderId = smsForm.mnotify_sender_id.trim();
    const apiKey = smsForm.mnotify_api_key.trim();
    const hasSavedKey = Boolean(data?.sms.mnotify_api_key_configured);

    if (!smsForm.mnotify_enabled) return null;

    if (!senderId) {
      return 'Enter your mNotify Sender ID exactly as registered on your mNotify dashboard.';
    }
    if (senderId.length > 50) {
      return 'Sender ID must be at most 50 characters.';
    }
    if (!apiKey && !hasSavedKey) {
      return 'Enter your mNotify API key before enabling SMS.';
    }
    return null;
  }

  async function handlePaystack(e: FormEvent) {
    e.preventDefault();
    await saveSection('paystack', paystackForm);
  }

  async function handleSms(e: FormEvent) {
    e.preventDefault();
    const validationError = validateSmsPayload();
    if (validationError) {
      toast.error('SMS settings incomplete', validationError);
      return;
    }
    await saveSection('sms', smsForm);
  }

  function validateEmailPayload(): string | null {
    const password = emailForm.smtp_password.trim();
    const hasSavedPassword = Boolean(data?.email.smtp_password_configured);

    if (!emailForm.email_enabled) return null;

    if (!emailForm.smtp_host.trim() || !emailForm.smtp_username.trim() || !emailForm.mail_from_email.trim()) {
      return 'SMTP host, username, and from email are required when email is enabled.';
    }
    if (!password && !hasSavedPassword) {
      return 'Enter the SMTP password before enabling email notifications.';
    }
    return null;
  }

  async function handleEmail(e: FormEvent) {
    e.preventDefault();
    const validationError = validateEmailPayload();
    if (validationError) {
      toast.error('Email settings incomplete', validationError);
      return;
    }
    await saveSection('email', {
      ...emailForm,
      smtp_port: Number(emailForm.smtp_port),
    });
  }

  if (loading) {
    return (
      <PremiumCard>
        <LoadingState label="Loading integrations…" />
      </PremiumCard>
    );
  }

  const paystackConfigured =
    data?.paystack.paystack_enabled &&
    data.paystack.paystack_public_key !== '' &&
    data.paystack.paystack_secret_configured;

  const smsConfigured =
    data?.sms.mnotify_enabled &&
    data.sms.mnotify_sender_id !== '' &&
    data.sms.mnotify_api_key_configured;

  const emailConfigured =
    data?.email.email_enabled &&
    data.email.smtp_host !== '' &&
    data.email.smtp_username !== '' &&
    data.email.mail_from_email !== '' &&
    data.email.smtp_password_configured;
  const hubtelConfigured =
    data?.hubtel.hubtel_enabled &&
    data.hubtel.hubtel_client_id !== '' &&
    data.hubtel.hubtel_client_secret_configured;

  return (
    <div className="d-flex flex-column gap-3">
      <PremiumCard title="Paystack payments">
        <form className="premium-form" onSubmit={handlePaystack}>
          <div className="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-3">
            <p className="small text-muted mb-0">
              Accept card and mobile money payments for guest folios and deposits.
            </p>
            <ConfigBadge configured={Boolean(paystackConfigured)} />
          </div>

          <div className="form-check form-switch mb-3">
            <input
              className="form-check-input"
              type="checkbox"
              id="paystack_enabled"
              checked={paystackForm.paystack_enabled}
              onChange={(e) => setPaystackForm({ ...paystackForm, paystack_enabled: e.target.checked })}
            />
            <label className="form-check-label fw-semibold" htmlFor="paystack_enabled">
              Enable Paystack payments
            </label>
          </div>

          <div className="row g-3">
            <div className="col-md-4">
              <label className="form-label">Environment</label>
              <select
                className="form-select"
                value={paystackForm.paystack_mode}
                onChange={(e) => setPaystackForm({ ...paystackForm, paystack_mode: e.target.value })}
              >
                <option value="test">Test</option>
                <option value="live">Live</option>
              </select>
            </div>
            <div className="col-md-8">
              <label className="form-label">Public key</label>
              <input
                className="form-control font-monospace"
                value={paystackForm.paystack_public_key}
                onChange={(e) => setPaystackForm({ ...paystackForm, paystack_public_key: e.target.value })}
                placeholder="pk_test_…"
              />
            </div>
            <div className="col-md-6">
              <label className="form-label">Secret key</label>
              <input
                type="password"
                className="form-control font-monospace"
                value={paystackForm.paystack_secret_key}
                onChange={(e) => setPaystackForm({ ...paystackForm, paystack_secret_key: e.target.value })}
                placeholder={
                  data?.paystack.paystack_secret_configured ? 'Leave blank to keep current key' : 'sk_test_…'
                }
              />
              {data?.paystack.paystack_secret_configured ? (
                <div className="form-text">Saved: {data.paystack.paystack_secret_masked}</div>
              ) : null}
            </div>
            <div className="col-md-6">
              <label className="form-label">Webhook secret (optional)</label>
              <input
                type="password"
                className="form-control font-monospace"
                value={paystackForm.paystack_webhook_secret}
                onChange={(e) => setPaystackForm({ ...paystackForm, paystack_webhook_secret: e.target.value })}
                placeholder={
                  data?.paystack.paystack_webhook_configured
                    ? 'Leave blank to keep current secret'
                    : 'From Paystack dashboard'
                }
              />
              {data?.paystack.paystack_webhook_configured ? (
                <div className="form-text">Saved: {data.paystack.paystack_webhook_masked}</div>
              ) : null}
            </div>
          </div>

          <p className="small text-muted mt-3 mb-3">
            Webhook URL for guest payments (optional): <code>/api/payments/paystack/webhook</code>. SaaS
            subscription renewals use Platform Admin → Settings (or env <code>PAYSTACK_*</code> fallback). Keys from{' '}
            <a href="https://dashboard.paystack.com/#/settings/developer" target="_blank" rel="noopener noreferrer">
              Paystack dashboard
            </a>
          </p>

          <button type="submit" className="btn btn-premium" disabled={saving === 'paystack'}>
            {saving === 'paystack' ? 'Saving…' : 'Save Paystack settings'}
          </button>
        </form>
      </PremiumCard>

      <PremiumCard title="mNotify SMS">
        <form className="premium-form" onSubmit={handleSms}>
          <div className="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-3">
            <p className="small text-muted mb-0">Send booking confirmations and check-in alerts via SMS.</p>
            <ConfigBadge configured={Boolean(smsConfigured)} />
          </div>

          <div className="form-check form-switch mb-3">
            <input
              className="form-check-input"
              type="checkbox"
              id="mnotify_enabled"
              checked={smsForm.mnotify_enabled}
              onChange={(e) => setSmsForm({ ...smsForm, mnotify_enabled: e.target.checked })}
            />
            <label className="form-check-label fw-semibold" htmlFor="mnotify_enabled">
              Enable mNotify SMS
            </label>
          </div>

          {smsForm.mnotify_enabled ? (
            <div className="alert alert-warning border-0 small py-2 mb-3">
              Sender ID and API key are required to enable SMS. Use the same Sender ID as on your mNotify dashboard
              (spaces are allowed if mNotify registered it that way).
            </div>
          ) : null}

          <div className="row g-3">
            <div className="col-md-4">
              <label className="form-label">
                Sender ID{smsForm.mnotify_enabled ? ' *' : ''}
              </label>
              <input
                className="form-control"
                maxLength={50}
                value={smsForm.mnotify_sender_id}
                onChange={(e) => setSmsForm({ ...smsForm, mnotify_sender_id: e.target.value })}
                placeholder="As shown on mNotify"
                required={smsForm.mnotify_enabled}
              />
              <div className="form-text">Must match your registered mNotify sender name.</div>
            </div>
            <div className="col-md-8">
              <label className="form-label">
                API key{smsForm.mnotify_enabled && !data?.sms.mnotify_api_key_configured ? ' *' : ''}
              </label>
              <input
                type="password"
                className="form-control font-monospace"
                value={smsForm.mnotify_api_key}
                onChange={(e) => setSmsForm({ ...smsForm, mnotify_api_key: e.target.value })}
                placeholder={
                  data?.sms.mnotify_api_key_configured ? 'Leave blank to keep current key' : 'From mNotify dashboard'
                }
              />
              {data?.sms.mnotify_api_key_configured ? (
                <div className="form-text">Saved: {data.sms.mnotify_api_key_masked}</div>
              ) : null}
            </div>
          </div>

          <p className="small text-muted mt-3 mb-3">
            Get credentials from{' '}
            <a href="https://apps.mnotify.net/api/api" target="_blank" rel="noopener noreferrer">
              mNotify API dashboard
            </a>
          </p>

          <button type="submit" className="btn btn-premium" disabled={saving === 'sms'}>
            {saving === 'sms' ? 'Saving…' : 'Save SMS settings'}
          </button>
        </form>
      </PremiumCard>

      <PremiumCard title="Email notifications">
        <form className="premium-form" onSubmit={handleEmail}>
          <div className="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-3">
            <p className="small text-muted mb-0">
              SMTP delivery for booking confirmations and guest communications.
            </p>
            <ConfigBadge configured={Boolean(emailConfigured)} />
          </div>

          <div className="form-check form-switch mb-3">
            <input
              className="form-check-input"
              type="checkbox"
              id="email_enabled"
              checked={emailForm.email_enabled}
              onChange={(e) => setEmailForm({ ...emailForm, email_enabled: e.target.checked })}
            />
            <label className="form-check-label fw-semibold" htmlFor="email_enabled">
              Enable email notifications
            </label>
          </div>

          <div className="row g-3">
            <div className="col-md-8">
              <label className="form-label">SMTP host</label>
              <input
                className="form-control font-monospace"
                value={emailForm.smtp_host}
                onChange={(e) => setEmailForm({ ...emailForm, smtp_host: e.target.value })}
              />
            </div>
            <div className="col-md-4">
              <label className="form-label">Port</label>
              <input
                type="number"
                className="form-control"
                value={emailForm.smtp_port}
                onChange={(e) => setEmailForm({ ...emailForm, smtp_port: e.target.value })}
              />
            </div>
            <div className="col-md-4">
              <label className="form-label">Encryption</label>
              <select
                className="form-select"
                value={emailForm.smtp_encryption}
                onChange={(e) => setEmailForm({ ...emailForm, smtp_encryption: e.target.value })}
              >
                <option value="ssl">SSL (465)</option>
                <option value="tls">TLS (587)</option>
                <option value="none">None</option>
              </select>
            </div>
            <div className="col-md-4">
              <label className="form-label">SMTP username</label>
              <input
                className="form-control font-monospace"
                value={emailForm.smtp_username}
                onChange={(e) => setEmailForm({ ...emailForm, smtp_username: e.target.value })}
              />
            </div>
            <div className="col-md-4">
              <label className="form-label">
                SMTP password
                {emailForm.email_enabled && !data?.email.smtp_password_configured ? ' *' : ''}
              </label>
              <input
                type="password"
                className="form-control font-monospace"
                value={emailForm.smtp_password}
                onChange={(e) => setEmailForm({ ...emailForm, smtp_password: e.target.value })}
                placeholder={
                  data?.email.smtp_password_configured ? 'Leave blank to keep current password' : 'SMTP password'
                }
              />
              {data?.email.smtp_password_configured ? (
                <div className="form-text">Saved: {data.email.smtp_password_masked}</div>
              ) : null}
            </div>
            <div className="col-md-6">
              <label className="form-label">From email</label>
              <input
                type="email"
                className="form-control"
                value={emailForm.mail_from_email}
                onChange={(e) => setEmailForm({ ...emailForm, mail_from_email: e.target.value })}
              />
            </div>
            <div className="col-md-6">
              <label className="form-label">From name</label>
              <input
                className="form-control"
                value={emailForm.mail_from_name}
                onChange={(e) => setEmailForm({ ...emailForm, mail_from_name: e.target.value })}
              />
            </div>
            <div className="col-12">
              <label className="form-label">Reply-To email</label>
              <input
                type="email"
                className="form-control"
                value={emailForm.reply_to_email}
                onChange={(e) => setEmailForm({ ...emailForm, reply_to_email: e.target.value })}
              />
            </div>
          </div>

          <button type="submit" className="btn btn-premium mt-3" disabled={saving === 'email'}>
            {saving === 'email' ? 'Saving…' : 'Save email settings'}
          </button>
        </form>
      </PremiumCard>
      <PremiumCard title="Hubtel delivery integration">
        <form
          className="premium-form"
          onSubmit={(e) => {
            e.preventDefault();
            void saveSection('hubtel', hubtelForm);
          }}
        >
          <div className="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-3">
            <p className="small text-muted mb-0">Enable Hubtel for external delivery dispatch.</p>
            <ConfigBadge configured={Boolean(hubtelConfigured)} />
          </div>
          <div className="form-check form-switch mb-3">
            <input
              className="form-check-input"
              type="checkbox"
              id="hubtel_enabled"
              checked={hubtelForm.hubtel_enabled}
              onChange={(e) => setHubtelForm({ ...hubtelForm, hubtel_enabled: e.target.checked })}
            />
            <label className="form-check-label fw-semibold" htmlFor="hubtel_enabled">
              Enable Hubtel
            </label>
          </div>
          <div className="row g-3">
            <div className="col-md-6">
              <label className="form-label">Client ID</label>
              <input
                className="form-control"
                value={hubtelForm.hubtel_client_id}
                onChange={(e) => setHubtelForm({ ...hubtelForm, hubtel_client_id: e.target.value })}
                placeholder="Hubtel client ID"
              />
            </div>
            <div className="col-md-6">
              <label className="form-label">Client Secret</label>
              <input
                type="password"
                className="form-control"
                value={hubtelForm.hubtel_client_secret}
                onChange={(e) => setHubtelForm({ ...hubtelForm, hubtel_client_secret: e.target.value })}
                placeholder={
                  data?.hubtel.hubtel_client_secret_configured
                    ? 'Leave blank to keep current secret'
                    : 'Hubtel client secret'
                }
              />
              {data?.hubtel.hubtel_client_secret_configured ? (
                <div className="form-text">Saved: {data.hubtel.hubtel_client_secret_masked}</div>
              ) : null}
            </div>
            <div className="col-12">
              <label className="form-label">Base URL</label>
              <input
                className="form-control font-monospace"
                value={hubtelForm.hubtel_base_url}
                onChange={(e) => setHubtelForm({ ...hubtelForm, hubtel_base_url: e.target.value })}
              />
            </div>
            <div className="col-md-8">
              <label className="form-label">Kitchen / pickup address</label>
              <input
                className="form-control"
                value={hubtelForm.hubtel_pickup_address}
                onChange={(e) => setHubtelForm({ ...hubtelForm, hubtel_pickup_address: e.target.value })}
                placeholder="Where riders pick up food"
              />
            </div>
            <div className="col-md-4">
              <label className="form-label">Pickup phone</label>
              <input
                className="form-control"
                value={hubtelForm.hubtel_pickup_phone}
                onChange={(e) => setHubtelForm({ ...hubtelForm, hubtel_pickup_phone: e.target.value })}
                placeholder="0XXXXXXXXX"
              />
            </div>
            <div className="col-md-6">
              <label className="form-label">Merchant account (optional)</label>
              <input
                className="form-control"
                value={hubtelForm.hubtel_merchant_account}
                onChange={(e) => setHubtelForm({ ...hubtelForm, hubtel_merchant_account: e.target.value })}
                placeholder="Hubtel merchant / POS account"
              />
            </div>
          </div>
          <p className="small text-muted mt-2 mb-0">
            After Place Order, the system quotes Hubtel, saves the delivery fee, then requests a rider.
            If Hubtel&apos;s live delivery API is unavailable for the account, the order is still created and
            queued for staff dispatch.
          </p>
          <button type="submit" className="btn btn-premium mt-3" disabled={saving === 'hubtel'}>
            {saving === 'hubtel' ? 'Saving…' : 'Save Hubtel settings'}
          </button>
        </form>
      </PremiumCard>
    </div>
  );
}
