import { getTenantSubscription } from '@/lib/subscription/tenant-subscription';

export type TenantAccessResult =
  | { ok: true }
  | { ok: false; reason: 'not_found' | 'suspended' | 'expired'; message: string };

/**
 * Hard gate for staff tenant access when subscription/trial is unusable.
 * Settings + subscription APIs remain reachable so hotels can renew.
 */
export async function assertTenantAccess(companyId: number): Promise<TenantAccessResult> {
  const sub = await getTenantSubscription(companyId);
  if (!sub) {
    return {
      ok: false,
      reason: 'not_found',
      message: 'Hotel account was not found.',
    };
  }

  if (sub.company_status === 'suspended') {
    return {
      ok: false,
      reason: 'suspended',
      message: 'This hotel account is suspended. Contact platform support.',
    };
  }

  const tone = sub.countdown?.tone;
  const days = sub.countdown?.daysRemaining;
  const expired =
    tone === 'danger' &&
    typeof days === 'number' &&
    days < 0 &&
    (sub.subscription_status === 'trialing' ||
      sub.company_status === 'trial' ||
      sub.subscription_status === 'past_due' ||
      (sub.subscription_status === 'active' && Boolean(sub.current_period_end)));

  if (expired || sub.subscription_status === 'past_due') {
    return {
      ok: false,
      reason: 'expired',
      message:
        sub.countdown?.detailLabel ||
        'Your subscription has expired. Upgrade under Settings to continue.',
    };
  }

  return { ok: true };
}

export { isSubscriptionBypassPath } from '@/lib/subscription/bypass-paths';
