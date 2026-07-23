import type { CSSProperties, ReactNode } from 'react';

type PageHeaderProps = {
  title: string;
  subtitle?: string;
  icon?: string;
  variant?: 'default' | 'platform';
  actions?: ReactNode;
  children?: ReactNode;
};

export function PageHeader({
  title,
  subtitle,
  icon,
  variant = 'default',
  actions,
  children,
}: PageHeaderProps) {
  return (
    <div className="premium-page-header">
      <div className="d-flex gap-3 align-items-start flex-grow-1">
        {icon ? (
          <div
            className={`premium-page-header__icon${variant === 'platform' ? ' premium-page-header__icon--platform' : ''}`}
          >
            <i className={`ti ${icon}`} />
          </div>
        ) : null}
        <div>
          <h1 className="premium-page-header__title">{title}</h1>
          {subtitle ? <p className="premium-page-header__subtitle">{subtitle}</p> : null}
          {children}
        </div>
      </div>
      {actions ? <div className="premium-page-header__actions">{actions}</div> : null}
    </div>
  );
}

export function PremiumPage({ children }: { children: ReactNode }) {
  return <div className="premium-page">{children}</div>;
}

export function PremiumCard({
  title,
  actions,
  children,
  flush,
  fill,
  className = '',
  style,
}: {
  title?: string;
  actions?: ReactNode;
  children: ReactNode;
  flush?: boolean;
  fill?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div className={`premium-card mb-3${fill ? ' premium-card--fill' : ''} ${className}`.trim()} style={style}>
      {title ? (
        <div className="premium-card__header">
          <h2 className="premium-card__title">{title}</h2>
          {actions}
        </div>
      ) : null}
      <div
        className={`${flush ? 'premium-card__body premium-card__body--flush' : 'premium-card__body'}${fill ? ' premium-card__body--grow' : ''}`}
      >
        {children}
      </div>
    </div>
  );
}

type StatTone = 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'violet';

export function StatCard({
  label,
  value,
  icon,
  tone = 'primary',
  suffix,
  trend,
  trendUp,
  caption,
  featured = false,
}: {
  label: string;
  value: string | number;
  icon: string;
  tone?: StatTone;
  /** Small unit next to the value, e.g. "GHS" or "%" */
  suffix?: string;
  /** Trend text, e.g. "12.4%" */
  trend?: string;
  /** When set with trend, styles the pill as up/down */
  trendUp?: boolean;
  /** Muted line under the value when no percentage trend is shown */
  caption?: string;
  /** Highlighted navy card — use at most one primary KPI per row */
  featured?: boolean;
}) {
  const showTrend = Boolean(trend);
  const trendDirection = trendUp === false ? 'down' : 'up';

  return (
    <div
      className={`premium-stat premium-stat--${tone}${featured ? ' premium-stat--featured' : ''} premium-animate-stat`}
    >
      <div className="premium-stat__top">
        <span className="premium-stat__label">{label}</span>
      </div>

      <div className="premium-stat__value-row">
        <span className="premium-stat__value">{value}</span>
        {suffix ? <span className="premium-stat__suffix">{suffix}</span> : null}
      </div>

      {showTrend ? (
        <div
          className={`premium-stat__trend premium-stat__trend--${trendDirection}`}
          aria-label={`${trendDirection === 'up' ? 'Up' : 'Down'} ${trend}`}
        >
          <i className={`ti ${trendDirection === 'up' ? 'ti-arrow-up' : 'ti-arrow-down'}`} aria-hidden="true" />
          <span>{trend}</span>
        </div>
      ) : caption ? (
        <p className="premium-stat__caption mb-0">{caption}</p>
      ) : (
        <div className="premium-stat__trend premium-stat__trend--muted" aria-hidden="true">
          <span>&nbsp;</span>
        </div>
      )}

      <span className="premium-stat__watermark" aria-hidden="true">
        <i className={`ti ${icon}`} />
      </span>
    </div>
  );
}

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="premium-loading">
      <div className="premium-loading__spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

export function EmptyState({
  icon = 'ti-inbox',
  message,
  action,
}: {
  icon?: string;
  message: string;
  action?: ReactNode;
}) {
  return (
    <div className="premium-empty">
      <div className="premium-empty__icon">
        <i className={`ti ${icon}`} />
      </div>
      <p className="mb-0">{message}</p>
      {action ? <div className="premium-empty__action mt-3">{action}</div> : null}
    </div>
  );
}

export function PremiumTabs({
  tabs,
  active,
  onChange,
}: {
  tabs: { id: string; label: string }[];
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="premium-tabs" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          className={`premium-tabs__btn${active === tab.id ? ' is-active' : ''}`}
          onClick={() => onChange(tab.id)}
          aria-selected={active === tab.id}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    confirmed: 'primary',
    pending: 'warning',
    checked_in: 'success',
    checked_out: 'muted',
    cancelled: 'danger',
    active: 'success',
    trial: 'warning',
    suspended: 'danger',
    trialing: 'info',
    open: 'warning',
    closed: 'muted',
    dirty: 'warning',
    vacant: 'success',
    occupied: 'info',
    clean: 'success',
    inspected: 'info',
    out_of_order: 'danger',
    out_of_service: 'danger',
    completed: 'success',
    in_progress: 'info',
    new: 'warning',
    read: 'info',
    archived: 'muted',
  };
  const tone = map[status] || 'muted';
  const label = status.replace(/_/g, ' ');
  return <span className={`premium-badge premium-badge--${tone}`}>{label}</span>;
}
