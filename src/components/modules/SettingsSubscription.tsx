'use client';

import { useCallback, useEffect, useState } from 'react';
import { useToast } from '@/components/ui/ToastProvider';
import { useConfirm } from '@/components/ui/ConfirmProvider';
import { PremiumCard, LoadingState, StatusBadge } from '@/components/ui/premium';
import { fetchApi } from '@/lib/client/fetch-api';
import { formatDisplayDate } from '@/lib/dates/format-display-date';

type Plan = {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  monthly_price: number;
  currency: string;
  max_properties: number | null;
};

type Subscription = {
  company_status: string;
  subscription_status: string | null;
  plan_id: number | null;
  plan_name: string | null;
  monthly_price: number | null;
  currency: string | null;
  billing_interval: string | null;
  trial_ends_at: string | null;
  current_period_end: string | null;
  countdown: {
    shortLabel: string;
    detailLabel: string;
    daysRemaining: number;
    tone: 'success' | 'warning' | 'danger';
  } | null;
};

type SubscriptionData = {
  subscription: Subscription | null;
  plans: Plan[];
};

function formatMoney(amount: number, currency: string) {
  return `${currency} ${Number(amount).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default function SettingsSubscription() {
  const toast = useToast();
  const confirm = useConfirm();
  const [loading, setLoading] = useState(true);
  const [upgradingId, setUpgradingId] = useState<number | null>(null);
  const [data, setData] = useState<SubscriptionData | null>(null);
  const [paystackReady, setPaystackReady] = useState(false);
  const [platformPaystack, setPlatformPaystack] = useState<{ enabled: boolean; publicKey: string } | null>(
    null
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [res, payRes] = await Promise.all([
        fetchApi<SubscriptionData>('/api/settings/subscription'),
        fetchApi<{ enabled: boolean; publicKey: string }>('/api/subscription/paystack/initialize'),
      ]);
      if (!res.success) {
        toast.error('Failed to load subscription', res.message);
        return;
      }
      setData(res.data ?? null);
      if (payRes.success && payRes.data) setPlatformPaystack(payRes.data);
    } catch {
      toast.error('Failed to load subscription');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.PaystackPop) {
      setPaystackReady(true);
      return;
    }
    const existing = document.querySelector('script[data-paystack-inline]');
    if (existing) {
      existing.addEventListener('load', () => setPaystackReady(true));
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://js.paystack.co/v1/inline.js';
    script.async = true;
    script.dataset.paystackInline = 'true';
    script.onload = () => setPaystackReady(true);
    document.body.appendChild(script);
  }, []);

  async function handleUpgrade(plan: Plan) {
    if (!data?.subscription) return;
    if (data.subscription.plan_id === plan.id) return;

    if (!platformPaystack?.enabled) {
      toast.warning(
        'Paystack not configured',
        'Ask the platform admin to add Paystack keys under Platform Admin → Settings.'
      );
      return;
    }
    if (!paystackReady || !window.PaystackPop) {
      toast.error('Paystack is still loading', 'Please wait a moment and try again.');
      return;
    }

    const isUpgrade = (data.subscription.monthly_price ?? 0) < plan.monthly_price;
    const actionLabel = isUpgrade ? 'Pay & upgrade' : 'Pay & switch plan';
    const ok = await confirm({
      title: actionLabel,
      message: `Pay ${formatMoney(plan.monthly_price, plan.currency)} for ${plan.name} (monthly)? Your plan activates after successful payment.`,
      confirmLabel: actionLabel,
    });
    if (!ok) return;

    setUpgradingId(plan.id);
    try {
      const initRes = await fetchApi<{
        reference: string;
        public_key: string;
        amount: number;
        email: string;
        currency: string;
      }>('/api/subscription/paystack/initialize', {
        method: 'POST',
        body: JSON.stringify({ plan_id: plan.id }),
      });
      if (!initRes.success || !initRes.data) {
        toast.error('Payment failed to start', initRes.message);
        setUpgradingId(null);
        return;
      }

      const { reference, public_key, amount, email, currency } = initRes.data;
      window.PaystackPop.setup({
        key: public_key,
        email,
        amount: Math.round(amount * 100),
        ref: reference,
        currency: currency || 'GHS',
        onClose: () => setUpgradingId(null),
        callback: (response) => {
          void (async () => {
            try {
              const confirmRes = await fetchApi('/api/subscription/paystack/initialize', {
                method: 'POST',
                body: JSON.stringify({ action: 'confirm', reference: response.reference }),
              });
              if (!confirmRes.success) {
                toast.error('Payment received but activation failed', confirmRes.message);
                return;
              }
              toast.success('Subscription activated', `You are now on ${plan.name}.`);
              await load();
            } catch {
              toast.error('Could not confirm subscription payment');
            } finally {
              setUpgradingId(null);
            }
          })();
        },
      }).openIframe();
    } catch {
      toast.error('Payment failed to start');
      setUpgradingId(null);
    }
  }

  if (loading) {
    return (
      <PremiumCard>
        <LoadingState label="Loading subscription…" />
      </PremiumCard>
    );
  }

  const subscription = data?.subscription;
  const plans = data?.plans ?? [];

  return (
    <div className="d-flex flex-column gap-3">
      <PremiumCard title="Current subscription">
        {!subscription ? (
          <p className="text-muted mb-0">No subscription found for this hotel.</p>
        ) : (
          <div className="d-flex flex-wrap align-items-start justify-content-between gap-3">
            <div>
              <div className="d-flex align-items-center gap-2 mb-1">
                <h3 className="h5 mb-0">{subscription.plan_name || 'No plan'}</h3>
                <StatusBadge status={subscription.subscription_status || subscription.company_status} />
                {subscription.billing_interval ? (
                  <span className="badge text-bg-light border text-capitalize">
                    Billed {subscription.billing_interval}
                  </span>
                ) : null}
              </div>
              <p className="mb-1">
                {formatMoney(Number(subscription.monthly_price ?? 0), subscription.currency || 'GHS')} / month
              </p>
              <p className="small text-muted mb-0">
                {subscription.countdown?.detailLabel || 'Your monthly subscription is active.'}
                {subscription.trial_ends_at ? (
                  <span> · trial ends {formatDisplayDate(subscription.trial_ends_at)}</span>
                ) : null}
                {subscription.current_period_end ? (
                  <span> · renews {formatDisplayDate(subscription.current_period_end)}</span>
                ) : null}
              </p>
            </div>
          </div>
        )}
      </PremiumCard>

      <PremiumCard title="Monthly plans">
        <p className="small text-muted mb-3">
          All plans are billed monthly via Paystack. Upgrades take effect after payment succeeds.
          {!platformPaystack?.enabled ? (
            <span className="text-danger d-block mt-1">
              Platform Paystack is not configured yet. Platform Admin → Settings.
            </span>
          ) : null}
        </p>
        <div className="row g-3">
          {plans.map((plan) => {
            const isCurrent = subscription?.plan_id === plan.id;
            return (
              <div key={plan.id} className="col-md-4">
                <div className={`border rounded-3 p-3 h-100 ${isCurrent ? 'border-primary' : ''}`}>
                  <div className="d-flex justify-content-between align-items-start mb-2">
                    <h4 className="h6 mb-0">{plan.name}</h4>
                    {isCurrent ? <span className="badge text-bg-primary">Current</span> : null}
                  </div>
                  <p className="fw-semibold mb-1">
                    {formatMoney(plan.monthly_price, plan.currency)} / month
                  </p>
                  <p className="small text-muted mb-3">{plan.description || '—'}</p>
                  {!isCurrent ? (
                    <button
                      type="button"
                      className="btn btn-premium btn-sm"
                      disabled={upgradingId === plan.id || !platformPaystack?.enabled}
                      onClick={() => void handleUpgrade(plan)}
                    >
                      {upgradingId === plan.id ? 'Opening Paystack…' : 'Pay & upgrade'}
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </PremiumCard>
    </div>
  );
}
