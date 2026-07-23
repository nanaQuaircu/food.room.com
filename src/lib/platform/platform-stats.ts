import { queryCentral } from '@/lib/db/central';
import type { Company } from '@/lib/db/types';
import { formatDisplayDate } from '@/lib/dates/format-display-date';
import { listPlatformHotelsDetailed } from '@/lib/platform/platform-hotels';

export type PlatformDashboardStats = {
  total: number;
  active: number;
  trial: number;
  suspended: number;
  payingTenants: number;
  mrr: { amount: number; currency: string };
  trialExpiryCount: number;
  recent: Array<{
    id: number;
    name: string;
    slug: string;
    status: string;
    db_name: string;
    created_at: string;
  }>;
  subscriptions: Array<{
    id: number;
    name: string;
    status: string;
    subscription_status: string | null;
    plan_name: string | null;
    monthly_price: number | null;
    currency: string | null;
    current_period_end: string | null;
  }>;
  charts: {
    companyStatus: { labels: string[]; values: number[] };
    signups: { labels: string[]; values: number[] };
    plansByTier: { labels: string[]; trialing: number[]; active: number[] };
    subscriptionStatus: { labels: string[]; values: number[] };
  };
};

export async function getPlatformDashboardStats(): Promise<PlatformDashboardStats> {
  const [
    statusCounts,
    recent,
    subscriptions,
    payingRow,
    mrrRow,
    trialExpiryRow,
    signupRows,
    planRows,
    statusRows,
  ] = await Promise.all([
    queryCentral<Array<{ status: string; c: number }>>(
      `SELECT status, COUNT(*) AS c FROM companies GROUP BY status`
    ),
    queryCentral<PlatformDashboardStats['recent']>(
      `SELECT id, name, slug, status, db_name, created_at
       FROM companies ORDER BY created_at DESC LIMIT 8`
    ),
    queryCentral<PlatformDashboardStats['subscriptions']>(
      `SELECT c.id, c.name, c.status, cs.subscription_status, sp.name AS plan_name,
              cs.monthly_price, cs.currency, cs.current_period_end
       FROM companies c
       LEFT JOIN company_subscriptions cs ON cs.company_id = c.id
       LEFT JOIN subscription_plans sp ON sp.id = cs.plan_id
       ORDER BY c.name`
    ),
    queryCentral<Array<{ c: number }>>(
      `SELECT COUNT(*) AS c FROM company_subscriptions WHERE subscription_status = 'active' AND plan_id IS NOT NULL`
    ),
    queryCentral<Array<{ amount: number; currency: string }>>(
      `SELECT COALESCE(SUM(cs.monthly_price), 0) AS amount,
              COALESCE(MAX(cs.currency), 'GHS') AS currency
       FROM company_subscriptions cs
       WHERE cs.subscription_status IN ('active', 'trialing')`
    ),
    queryCentral<Array<{ c: number }>>(
      `SELECT COUNT(*) AS c FROM company_subscriptions
       WHERE subscription_status = 'trialing'
         AND trial_ends_at IS NOT NULL
         AND trial_ends_at <= DATE_ADD(CURDATE(), INTERVAL 14 DAY)`
    ),
    queryCentral<Array<{ ym: string; c: number }>>(
      `SELECT DATE_FORMAT(created_at, '%Y-%m') AS ym, COUNT(*) AS c
       FROM companies
       WHERE created_at >= DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 5 MONTH), '%Y-%m-01')
       GROUP BY DATE_FORMAT(created_at, '%Y-%m')
       ORDER BY ym`
    ),
    queryCentral<Array<{ name: string; trialing: number; active: number }>>(
      `SELECT sp.name,
              COALESCE(SUM(CASE WHEN cs.subscription_status = 'trialing' THEN 1 ELSE 0 END), 0) AS trialing,
              COALESCE(SUM(CASE WHEN cs.subscription_status = 'active' THEN 1 ELSE 0 END), 0) AS active
       FROM subscription_plans sp
       LEFT JOIN company_subscriptions cs ON cs.plan_id = sp.id
       GROUP BY sp.id, sp.name
       ORDER BY sp.sort_order, sp.name`
    ),
    queryCentral<Array<{ subscription_status: string; c: number }>>(
      `SELECT subscription_status, COUNT(*) AS c
       FROM company_subscriptions
       GROUP BY subscription_status`
    ),
  ]);

  const countByStatus = Object.fromEntries(statusCounts.map((r) => [r.status, Number(r.c)]));
  const active = countByStatus.active ?? 0;
  const trial = countByStatus.trial ?? 0;
  const suspended = countByStatus.suspended ?? 0;
  const total = Object.values(countByStatus).reduce((sum, n) => sum + n, 0);

  const signupsLabels: string[] = [];
  const signupsValues: number[] = [];
  const signupMap = Object.fromEntries(signupRows.map((r) => [r.ym, Number(r.c)]));
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    signupsLabels.push(formatDisplayDate(`${ym}-01`));
    signupsValues.push(signupMap[ym] ?? 0);
  }

  return {
    total,
    active,
    trial,
    suspended,
    payingTenants: Number(payingRow[0]?.c ?? 0),
    mrr: {
      amount: Number(mrrRow[0]?.amount ?? 0),
      currency: mrrRow[0]?.currency ?? 'GHS',
    },
    trialExpiryCount: Number(trialExpiryRow[0]?.c ?? 0),
    recent,
    subscriptions,
    charts: {
      companyStatus: {
        labels: ['Active', 'Trial', 'Suspended'],
        values: [active, trial, suspended],
      },
      signups: { labels: signupsLabels, values: signupsValues },
      plansByTier: {
        labels: planRows.map((p) => p.name),
        trialing: planRows.map((p) => Number(p.trialing)),
        active: planRows.map((p) => Number(p.active)),
      },
      subscriptionStatus: {
        labels: statusRows.map((r) =>
          String(r.subscription_status).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
        ),
        values: statusRows.map((r) => Number(r.c)),
      },
    },
  };
}

export async function listPlatformHotels(): Promise<Company[]> {
  return listPlatformHotelsDetailed() as unknown as Promise<Company[]>;
}
