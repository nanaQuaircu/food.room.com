import { NextRequest } from 'next/server';
import { getSession } from '@/lib/tenant/session';
import { apiOk, apiFail } from '@/lib/api/json';
import {
  listSubscriptionPlans,
  createSubscriptionPlan,
  updateSubscriptionPlan,
  assignPlanToCompany,
  listCompaniesWithPlans,
} from '@/lib/services/platform-plans';

export async function GET() {
  const session = await getSession();
  if (!session || session.type !== 'platform') {
    return apiFail('Unauthorized', 401);
  }

  const [plans, companies] = await Promise.all([
    listSubscriptionPlans(),
    listCompaniesWithPlans(),
  ]);

  return apiOk({ plans, companies });
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session || session.type !== 'platform') {
    return apiFail('Unauthorized', 401);
  }

  try {
    const body = await request.json();
    const action = body.action;

    if (action === 'create') {
      const name = String(body.name || '').trim();
      const slug = String(body.slug || '').trim();
      const monthly_price = Number(body.monthly_price);

      if (!name || !slug) {
        return apiFail('name and slug are required');
      }
      if (!Number.isFinite(monthly_price) || monthly_price < 0) {
        return apiFail('monthly_price must be a valid number');
      }

      const id = await createSubscriptionPlan({
        name,
        slug,
        monthly_price,
        description: body.description ? String(body.description) : undefined,
        max_properties:
          body.max_properties !== undefined && body.max_properties !== null
            ? Number(body.max_properties)
            : undefined,
      });

      return apiOk({ id }, 'Plan created');
    }

    if (action === 'update') {
      const id = Number(body.id);
      if (!Number.isFinite(id) || id <= 0) {
        return apiFail('id is required');
      }

      const input: Parameters<typeof updateSubscriptionPlan>[1] = {};
      if (body.name !== undefined) input.name = String(body.name).trim();
      if (body.description !== undefined) input.description = String(body.description);
      if (body.monthly_price !== undefined) input.monthly_price = Number(body.monthly_price);
      if (body.is_active !== undefined) input.is_active = Boolean(body.is_active);
      if (body.max_properties !== undefined) {
        input.max_properties =
          body.max_properties === null ? null : Number(body.max_properties);
      }

      await updateSubscriptionPlan(id, input);
      return apiOk({ id }, 'Plan updated');
    }

    if (action === 'assign') {
      const company_id = Number(body.company_id);
      const plan_id = Number(body.plan_id);

      if (!Number.isFinite(company_id) || company_id <= 0) {
        return apiFail('company_id is required');
      }
      if (!Number.isFinite(plan_id) || plan_id <= 0) {
        return apiFail('plan_id is required');
      }

      await assignPlanToCompany(company_id, plan_id);
      return apiOk({ company_id, plan_id }, 'Plan assigned');
    }

    return apiFail('Invalid action. Use create, update, or assign.');
  } catch (error) {
    console.error('Platform plans API error:', error);
    return apiFail(error instanceof Error ? error.message : 'Request failed', 500);
  }
}
