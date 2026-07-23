import { queryCentral, executeCentral } from '@/lib/db/central';
import { DEFAULT_TRIAL_DAYS, buildSubscriptionCountdown } from '@/lib/subscription/countdown';

export type TenantSubscriptionPlan = {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  monthly_price: number;
  yearly_price: number;
  currency: string;
  max_properties: number | null;
  sort_order: number;
};

export type TenantSubscriptionView = {
  company_status: string;
  subscription_status: string | null;
  plan_id: number | null;
  plan_name: string | null;
  plan_slug: string | null;
  monthly_price: number | null;
  currency: string | null;
  billing_interval: string | null;
  trial_ends_at: string | null;
  current_period_end: string | null;
  countdown: ReturnType<typeof buildSubscriptionCountdown>;
};

type SubscriptionRow = {
  company_status: string;
  subscription_status: string | null;
  plan_id: number | null;
  plan_name: string | null;
  plan_slug: string | null;
  monthly_price: number | null;
  currency: string | null;
  billing_interval: string | null;
  trial_ends_at: string | null;
  current_period_end: string | null;
  company_created_at: string;
};

export async function listActiveSubscriptionPlans(): Promise<TenantSubscriptionPlan[]> {
  return queryCentral<TenantSubscriptionPlan[]>(
    `SELECT id, name, slug, description, monthly_price, yearly_price, currency, max_properties, sort_order
     FROM subscription_plans
     WHERE is_active = 1
     ORDER BY sort_order, name`
  );
}

export async function getTenantSubscription(companyId: number): Promise<TenantSubscriptionView | null> {
  const rows = await queryCentral<SubscriptionRow[]>(
    `SELECT c.status AS company_status,
            cs.subscription_status,
            cs.plan_id,
            sp.name AS plan_name,
            sp.slug AS plan_slug,
            cs.monthly_price,
            cs.currency,
            cs.billing_interval,
            COALESCE(
              cs.trial_ends_at,
              CASE
                WHEN cs.subscription_status = 'trialing' OR c.status = 'trial'
                  THEN DATE_ADD(DATE(c.created_at), INTERVAL :trialDays DAY)
                ELSE NULL
              END
            ) AS trial_ends_at,
            cs.current_period_end,
            c.created_at AS company_created_at
     FROM companies c
     LEFT JOIN company_subscriptions cs ON cs.company_id = c.id
     LEFT JOIN subscription_plans sp ON sp.id = cs.plan_id
     WHERE c.id = :companyId
     LIMIT 1`,
    { companyId, trialDays: DEFAULT_TRIAL_DAYS }
  );

  const row = rows[0];
  if (!row) return null;

  if (
    (row.subscription_status === 'trialing' || row.company_status === 'trial') &&
    !row.trial_ends_at &&
    row.company_created_at
  ) {
    const fallback = new Date(row.company_created_at);
    fallback.setDate(fallback.getDate() + DEFAULT_TRIAL_DAYS);
    row.trial_ends_at = fallback.toISOString().slice(0, 10);
  }

  if (
    (row.subscription_status === 'active' || row.company_status === 'active') &&
    !row.current_period_end
  ) {
    row.current_period_end = addMonthsFromDate(row.company_created_at, 1);
  }

  const view: TenantSubscriptionView = {
    company_status: row.company_status,
    subscription_status: row.subscription_status,
    plan_id: row.plan_id,
    plan_name: row.plan_name,
    plan_slug: row.plan_slug,
    monthly_price: row.monthly_price !== null ? Number(row.monthly_price) : null,
    currency: row.currency,
    billing_interval: row.billing_interval,
    trial_ends_at: row.trial_ends_at,
    current_period_end: row.current_period_end,
    countdown: null,
  };

  view.countdown = buildSubscriptionCountdown({
    subscription_status: view.subscription_status,
    company_status: view.company_status,
    trial_ends_at:
      view.subscription_status === 'trialing' || view.company_status === 'trial'
        ? view.trial_ends_at
        : null,
    current_period_end: view.current_period_end,
  });
  return view;
}

export async function upgradeTenantSubscription(companyId: number, planId: number) {
  const plans = await queryCentral<Array<{ id: number }>>(
    `SELECT id FROM subscription_plans WHERE id = :planId AND is_active = 1 LIMIT 1`,
    { planId }
  );
  if (!plans[0]) {
    throw new Error('Selected plan is not available.');
  }

  const current = await getTenantSubscription(companyId);
  if (!current) {
    throw new Error('Subscription not found for this hotel.');
  }
  if (current.plan_id === planId) {
    throw new Error('You are already on this plan.');
  }

  const keepTrialing =
    current.subscription_status === 'trialing' || current.company_status === 'trial';

  await executeCentral(
    `UPDATE company_subscriptions cs
     INNER JOIN subscription_plans sp ON sp.id = :planId
     SET cs.plan_id = sp.id,
         cs.monthly_price = sp.monthly_price,
         cs.currency = sp.currency,
         cs.billing_interval = 'monthly',
         cs.subscription_status = CASE
           WHEN :keepTrialing = 1 THEN 'trialing'
           ELSE 'active'
         END,
         cs.trial_ends_at = CASE
           WHEN :keepTrialing = 1 THEN cs.trial_ends_at
           ELSE NULL
         END,
         cs.current_period_end = CASE
           WHEN :keepTrialing = 1 THEN cs.current_period_end
           ELSE COALESCE(cs.current_period_end, DATE_ADD(CURDATE(), INTERVAL 1 MONTH))
         END
     WHERE cs.company_id = :companyId`,
    { companyId, planId, keepTrialing: keepTrialing ? 1 : 0 }
  );

  if (!keepTrialing) {
    await executeCentral(`UPDATE companies SET status = 'active' WHERE id = :companyId`, { companyId });
  }

  return getTenantSubscription(companyId);
}

function addMonthsFromToday(months: number) {
  const date = new Date();
  date.setMonth(date.getMonth() + months);
  return date.toISOString().slice(0, 10);
}

function addMonthsFromDate(value: string, months: number) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return addMonthsFromToday(months);
  }
  date.setMonth(date.getMonth() + months);
  while (date < new Date()) {
    date.setMonth(date.getMonth() + months);
  }
  return date.toISOString().slice(0, 10);
}
