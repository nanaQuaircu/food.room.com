import { requireTenant, isTenantContext } from '@/lib/api/tenant-context';
import { apiOk, apiFail } from '@/lib/api/json';
import { getTenantSubscription } from '@/lib/subscription/tenant-subscription';

/** Lightweight subscription summary for navbar countdown (all signed-in staff). */
export async function GET() {
  const ctx = await requireTenant({ allowExpired: true });
  if (!isTenantContext(ctx)) return ctx;

  try {
    const companyId = ctx.session.companyId;
    if (!companyId) return apiOk({ countdown: null, plan_name: null });

    const subscription = await getTenantSubscription(companyId);
    if (!subscription?.countdown) {
      return apiOk({
        countdown: null,
        plan_name: subscription?.plan_name ?? null,
        subscription_status: subscription?.subscription_status ?? null,
      });
    }

    return apiOk({
      countdown: subscription.countdown,
      plan_name: subscription.plan_name,
      subscription_status: subscription.subscription_status,
    });
  } catch (error) {
    console.error('Subscription summary error:', error);
    return apiFail(error instanceof Error ? error.message : 'Failed to load subscription', 500);
  }
}
