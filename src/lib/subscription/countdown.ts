export const DEFAULT_TRIAL_DAYS = 30;

export function daysUntilDate(dateValue: string | Date | null | undefined): number | null {
  if (!dateValue) return null;
  const end = new Date(typeof dateValue === 'string' ? `${dateValue.slice(0, 10)}T23:59:59` : dateValue);
  if (Number.isNaN(end.getTime())) return null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  return Math.ceil((end.getTime() - now.getTime()) / 86_400_000);
}

export type SubscriptionCountdown = {
  daysRemaining: number;
  targetDate: string;
  shortLabel: string;
  detailLabel: string;
  tone: 'success' | 'warning' | 'danger';
};

export function buildSubscriptionCountdown(input: {
  subscription_status: string | null;
  company_status?: string | null;
  trial_ends_at: string | null;
  current_period_end: string | null;
}): SubscriptionCountdown | null {
  const status =
    input.subscription_status === 'trialing' || input.company_status === 'trial'
      ? 'trialing'
      : input.subscription_status;

  if (status === 'trialing' && input.trial_ends_at) {
    const daysRemaining = daysUntilDate(input.trial_ends_at);
    if (daysRemaining === null) return null;

    if (daysRemaining < 0) {
      return {
        daysRemaining,
        targetDate: input.trial_ends_at,
        shortLabel: 'Trial expired',
        detailLabel: 'Your trial has ended. Upgrade to keep using the platform.',
        tone: 'danger',
      };
    }

    if (daysRemaining === 0) {
      return {
        daysRemaining,
        targetDate: input.trial_ends_at,
        shortLabel: 'Trial ends today',
        detailLabel: 'Your trial ends today. Choose a plan to continue.',
        tone: 'warning',
      };
    }

    return {
      daysRemaining,
      targetDate: input.trial_ends_at,
      shortLabel: `Monthly · ${daysRemaining}d left`,
      detailLabel: `${daysRemaining} day${daysRemaining === 1 ? '' : 's'} left in your monthly trial`,
      tone: daysRemaining <= 3 ? 'warning' : 'success',
    };
  }

  if (status === 'active' && input.current_period_end) {
    const daysRemaining = daysUntilDate(input.current_period_end);
    if (daysRemaining === null) return null;

    if (daysRemaining < 0) {
      return {
        daysRemaining,
        targetDate: input.current_period_end,
        shortLabel: 'Renewal overdue',
        detailLabel: 'Your subscription renewal date has passed.',
        tone: 'danger',
      };
    }

    return {
      daysRemaining,
      targetDate: input.current_period_end,
      shortLabel: `Monthly · renews in ${daysRemaining}d`,
      detailLabel: `Monthly plan renews in ${daysRemaining} day${daysRemaining === 1 ? '' : 's'}`,
      tone: daysRemaining <= 7 ? 'warning' : 'success',
    };
  }

  if (status === 'past_due') {
    return {
      daysRemaining: 0,
      targetDate: input.current_period_end || input.trial_ends_at || '',
      shortLabel: 'Payment overdue',
      detailLabel: 'Your subscription payment is overdue.',
      tone: 'danger',
    };
  }

  return null;
}
