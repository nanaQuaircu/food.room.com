import { createHmac, timingSafeEqual } from 'crypto';
import { executeCentral, queryCentral } from '@/lib/db/central';
import { paystackInitialize, paystackVerify } from '@/lib/payments/paystack-service';
import { resolvePlatformPaystackCredentials } from '@/lib/platform/platform-settings';
import { getTenantSubscription } from '@/lib/subscription/tenant-subscription';

export async function getPlatformPaystackCredentials() {
  return resolvePlatformPaystackCredentials();
}

export async function verifyPaystackWebhookSignature(rawBody: string, signature: string | null) {
  const { webhookSecret } = await getPlatformPaystackCredentials();
  if (!webhookSecret || !signature) return false;
  const hash = createHmac('sha512', webhookSecret).update(rawBody).digest('hex');
  try {
    return timingSafeEqual(Buffer.from(hash), Buffer.from(signature));
  } catch {
    return false;
  }
}

export async function initializeSubscriptionPayment(input: {
  companyId: number;
  planId: number;
  email: string;
}) {
  const creds = await getPlatformPaystackCredentials();
  if (!creds.enabled) {
    throw new Error(
      'Platform Paystack is not configured. Add keys under Platform Admin → Settings (or set PAYSTACK_* env vars).'
    );
  }

  const plans = await queryCentral<
    Array<{ id: number; name: string; monthly_price: number; currency: string }>
  >(
    `SELECT id, name, monthly_price, currency FROM subscription_plans
     WHERE id = :planId AND is_active = 1 LIMIT 1`,
    { planId: input.planId }
  );
  const plan = plans[0];
  if (!plan) throw new Error('Selected plan is not available.');

  const current = await getTenantSubscription(input.companyId);
  if (!current) throw new Error('Subscription not found.');
  if (current.plan_id === plan.id && current.subscription_status === 'active') {
    throw new Error('You are already on this plan.');
  }

  const amount = Number(plan.monthly_price);
  if (amount <= 0) throw new Error('Plan price is invalid.');

  const reference = `SUB${input.companyId}P${plan.id}-${Date.now().toString(36).toUpperCase()}`;

  await executeCentral(
    `INSERT INTO subscription_payment_intents
      (company_id, plan_id, reference, amount, currency, status, metadata_json)
     VALUES
      (:companyId, :planId, :reference, :amount, :currency, 'pending', :metadata)`,
    {
      companyId: input.companyId,
      planId: plan.id,
      reference,
      amount,
      currency: plan.currency || 'GHS',
      metadata: JSON.stringify({ plan_name: plan.name, email: input.email }),
    }
  );

  const init = await paystackInitialize(creds.secretKey, {
    email: input.email,
    amount,
    reference,
    metadata: {
      company_id: input.companyId,
      plan_id: plan.id,
      purpose: 'saas_subscription',
    },
  });

  return {
    reference: init.reference,
    access_code: init.access_code,
    authorization_url: init.authorization_url,
    public_key: creds.publicKey,
    amount,
    currency: plan.currency || 'GHS',
    plan_name: plan.name,
    email: input.email,
  };
}

export async function activateSubscriptionFromPayment(reference: string) {
  const intents = await queryCentral<
    Array<{
      id: number;
      company_id: number;
      plan_id: number;
      amount: number;
      currency: string;
      status: string;
    }>
  >(
    `SELECT id, company_id, plan_id, amount, currency, status
     FROM subscription_payment_intents WHERE reference = :reference LIMIT 1`,
    { reference }
  );
  const intent = intents[0];
  if (!intent) return { handled: false as const, reason: 'intent_not_found' };
  if (intent.status === 'success') return { handled: true as const, already: true };

  const creds = await getPlatformPaystackCredentials();
  if (!creds.secretKey) throw new Error('Platform Paystack secret missing.');

  const verified = await paystackVerify(creds.secretKey, reference);
  if (Math.abs(verified.amount - Number(intent.amount)) > 0.01) {
    throw new Error('Paid amount does not match subscription intent.');
  }

  await executeCentral(
    `UPDATE subscription_payment_intents
     SET status = 'success', paystack_reference = :ref, paid_at = CURRENT_TIMESTAMP
     WHERE id = :id AND status <> 'success'`,
    { id: intent.id, ref: verified.reference }
  );

  await executeCentral(
    `UPDATE company_subscriptions cs
     INNER JOIN subscription_plans sp ON sp.id = :planId
     SET cs.plan_id = sp.id,
         cs.monthly_price = sp.monthly_price,
         cs.currency = sp.currency,
         cs.billing_interval = 'monthly',
         cs.subscription_status = 'active',
         cs.trial_ends_at = NULL,
         cs.current_period_end = DATE_ADD(CURDATE(), INTERVAL 1 MONTH),
         cs.last_payment_reference = :reference
     WHERE cs.company_id = :companyId`,
    { companyId: intent.company_id, planId: intent.plan_id, reference: verified.reference }
  );

  await executeCentral(`UPDATE companies SET status = 'active' WHERE id = :companyId`, {
    companyId: intent.company_id,
  });

  return { handled: true as const, already: false, companyId: intent.company_id, planId: intent.plan_id };
}
