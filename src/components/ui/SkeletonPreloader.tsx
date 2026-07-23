'use client';

type Props = {
  /** Full-viewport overlay (login / client navigations) vs in-flow Suspense slot */
  overlay?: boolean;
  label?: string;
};

export default function SkeletonPreloader({
  overlay = false,
  label = 'Loading your workspace…',
}: Props) {
  return (
    <div
      className={`skeleton-preloader${overlay ? ' skeleton-preloader--overlay' : ''}`}
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={label}
    >
      <div className="skeleton-preloader__shell">
        <aside className="skeleton-preloader__sidebar" aria-hidden="true">
          <div className="skeleton-preloader__logo">
            <div className="skeleton-bone skeleton-bone--logo" />
            <div className="skeleton-bone skeleton-bone--text-md" />
          </div>
          <div className="skeleton-preloader__nav">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="skeleton-preloader__nav-item">
                <div className="skeleton-bone skeleton-bone--icon" />
                <div className="skeleton-bone skeleton-bone--text-sm" style={{ width: `${58 + (i % 3) * 12}%` }} />
              </div>
            ))}
          </div>
        </aside>

        <div className="skeleton-preloader__main">
          <div className="skeleton-preloader__topbar" aria-hidden="true">
            <div className="skeleton-bone skeleton-bone--icon" />
            <div className="skeleton-preloader__topbar-end">
              <div className="skeleton-bone skeleton-bone--icon skeleton-bone--round" />
              <div className="skeleton-bone skeleton-bone--avatar" />
            </div>
          </div>

          <div className="skeleton-preloader__content">
            <div className="skeleton-preloader__header" aria-hidden="true">
              <div className="skeleton-bone skeleton-bone--icon-lg" />
              <div className="skeleton-preloader__header-text">
                <div className="skeleton-bone skeleton-bone--title" />
                <div className="skeleton-bone skeleton-bone--subtitle" />
              </div>
            </div>

            <div className="skeleton-preloader__stats" aria-hidden="true">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="skeleton-preloader__stat">
                  <div className="skeleton-bone skeleton-bone--icon skeleton-bone--round" />
                  <div className="skeleton-bone skeleton-bone--text-xs" />
                  <div className="skeleton-bone skeleton-bone--stat" />
                </div>
              ))}
            </div>

            <div className="skeleton-preloader__grid" aria-hidden="true">
              <div className="skeleton-preloader__card skeleton-preloader__card--lg">
                <div className="skeleton-bone skeleton-bone--text-md" />
                <div className="skeleton-bone skeleton-bone--block" />
                <div className="skeleton-bone skeleton-bone--block skeleton-bone--short" />
              </div>
              <div className="skeleton-preloader__card">
                <div className="skeleton-bone skeleton-bone--text-md" />
                <div className="skeleton-bone skeleton-bone--block" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="skeleton-preloader__brand">
        <div className="skeleton-preloader__spinner" aria-hidden="true" />
        <span>{label}</span>
      </div>
    </div>
  );
}
