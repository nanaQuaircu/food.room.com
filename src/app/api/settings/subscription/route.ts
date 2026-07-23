import { NextRequest } from 'next/server';
import { requireTenant, isTenantContext, requireTenantRoles } from '@/lib/api/tenant-context';
import { SETTINGS_ROLES } from '@/lib/roles';
import { apiOk, apiFail } from '@/lib/api/json';
import {
  getTenantSubscription,
  listActiveSubscriptionPlans,
  upgradeTenantSubscription,
} from '@/lib/subscription/tenant-subscription';

export async function GET() {
  const ctx = await requireTenant({ allowExpired: true });
  if (!isTenantContext(ctx)) return ctx;
  const denied = requireTenantRoles(ctx, SETTINGS_ROLES);
  if (denied) return denied;

  try {
    const companyId = ctx.session.companyId;
    if (!companyId) return apiFail('Company not found', 400);

    const [subscription, plans] = await Promise.all([
      getTenantSubscription(companyId),
      listActiveSubscriptionPlans(),
    ]);

    return apiOk({ subscription, plans });
  } catch (error) {
    console.error('Subscription settings GET error:', error);
    return apiFail(error instanceof Error ? error.message : 'Failed to load subscription', 500);
  }
}

export async function POST(request: NextRequest) {
  const ctx = await requireTenant({ allowExpired: true });
  if (!isTenantContext(ctx)) return ctx;
  const denied = requireTenantRoles(ctx, SETTINGS_ROLES);
  if (denied) return denied;

  try {
    const companyId = ctx.session.companyId;
    if (!companyId) return apiFail('Company not found', 400);

    const body = await request.json();
    const planId = Number(body.plan_id);
    if (!Number.isFinite(planId) || planId <= 0) {
      return apiFail('plan_id is required');
    }

    const subscription = await upgradeTenantSubscription(companyId, planId);
    return apiOk({ subscription }, 'Subscription plan updated.');
  } catch (error) {
    console.error('Subscription settings POST error:', error);
    return apiFail(error instanceof Error ? error.message : 'Upgrade failed', 400);
  }
}
