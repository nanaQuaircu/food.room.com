import { queryCentral, executeCentral } from '@/lib/db/central';
import { calcYearlyPrice } from '@/lib/platform/plan-pricing';

export { YEARLY_PRICE_MULTIPLIER, calcYearlyPrice } from '@/lib/platform/plan-pricing';

export async function listSubscriptionPlans() {
  return queryCentral(
    `SELECT * FROM subscription_plans ORDER BY sort_order, name`
  );
}

export async function createSubscriptionPlan(input: {
  name: string;
  slug: string;
  description?: string;
  monthly_price: number;
  currency?: string;
  max_properties?: number | null;
}) {
  const yearlyPrice = calcYearlyPrice(input.monthly_price);
  const result = await executeCentral(
    `INSERT INTO subscription_plans (name, slug, description, monthly_price, yearly_price, currency, max_properties)
     VALUES (:name, :slug, :description, :monthlyPrice, :yearlyPrice, :currency, :maxProperties)`,
    {
      name: input.name,
      slug: input.slug,
      description: input.description || null,
      monthlyPrice: input.monthly_price,
      yearlyPrice,
      currency: input.currency || 'GHS',
      maxProperties: input.max_properties ?? null,
    }
  );
  return Number((result as { insertId?: number }).insertId);
}

export async function updateSubscriptionPlan(
  id: number,
  input: Partial<{
    name: string;
    description: string;
    monthly_price: number;
    is_active: boolean;
    max_properties: number | null;
  }>
) {
  const yearlyPrice =
    input.monthly_price !== undefined ? calcYearlyPrice(input.monthly_price) : null;

  await executeCentral(
    `UPDATE subscription_plans SET
       name = COALESCE(:name, name),
       description = COALESCE(:description, description),
       monthly_price = COALESCE(:monthlyPrice, monthly_price),
       yearly_price = COALESCE(:yearlyPrice, yearly_price),
       is_active = COALESCE(:isActive, is_active),
       max_properties = COALESCE(:maxProperties, max_properties)
     WHERE id = :id`,
    {
      id,
      name: input.name ?? null,
      description: input.description ?? null,
      monthlyPrice: input.monthly_price ?? null,
      yearlyPrice,
      isActive: input.is_active !== undefined ? (input.is_active ? 1 : 0) : null,
      maxProperties: input.max_properties ?? null,
    }
  );
}

export async function assignPlanToCompany(companyId: number, planId: number) {
  await executeCentral(
    `INSERT INTO company_subscriptions (company_id, plan_id, subscription_status, monthly_price, currency, billing_interval)
     SELECT :companyId, id, 'active', monthly_price, currency, 'monthly' FROM subscription_plans WHERE id = :planId
     ON DUPLICATE KEY UPDATE
       plan_id = VALUES(plan_id),
       monthly_price = VALUES(monthly_price),
       currency = VALUES(currency),
       billing_interval = 'monthly',
       subscription_status = 'active'`,
    { companyId, planId }
  );
}

export async function listCompaniesWithPlans() {
  return queryCentral(
    `SELECT c.id, c.name, c.slug, c.status, cs.subscription_status, cs.plan_id,
            sp.name AS plan_name, cs.monthly_price, cs.currency, cs.current_period_end
     FROM companies c
     LEFT JOIN company_subscriptions cs ON cs.company_id = c.id
     LEFT JOIN subscription_plans sp ON sp.id = cs.plan_id
     ORDER BY c.name`
  );
}
