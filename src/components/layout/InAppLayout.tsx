'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useToast } from '@/components/ui/ToastProvider';
import UserAvatar from '@/components/ui/UserAvatar';
import { TENANT_MODULES, TENANT_NAV_GROUPS, TENANT_NAV_TOP_IDS } from '@/lib/module-registry';
import { filterModulesForRole, getHomePathForRole, hasAnyRole, DASHBOARD_ROLES, SETTINGS_ROLES } from '@/lib/roles';
import AccountSettingsModal from '@/components/account/AccountSettingsModal';
import AnimatedPage from '@/components/layout/AnimatedPage';
import NavbarSubscriptionBadge from '@/components/subscription/NavbarSubscriptionBadge';
import UserProfileMenu from '@/components/layout/UserProfileMenu';

type AppNotification = {
  id: number;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
};

function relativeTime(value: string) {
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return '';
  const mins = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function notificationVariant(type: string): 'success' | 'info' | 'warning' | 'danger' | 'primary' {
  if (type === 'payment' || type === 'reservation') return 'success';
  if (type === 'refund' || type === 'waitlist') return 'warning';
  if (type === 'maintenance' || type === 'night_audit') return 'info';
  return 'primary';
}

export default function InAppLayout({
  children,
  hotelName,
  hotelLogoUrl,
  userName,
  userAvatarUrl,
  userRole,
  subscriptionLocked = null,
}: {
  children: React.ReactNode;
  hotelName: string;
  hotelLogoUrl?: string | null;
  userName: string;
  userAvatarUrl?: string | null;
  userRole?: string;
  subscriptionLocked?: string | null;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const toast = useToast();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const loadNotifications = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications');
      const json = await res.json();
      if (json.success && json.data) {
        setNotifications(json.data.items ?? []);
        setUnreadCount(Number(json.data.unread ?? 0));
      }
    } catch {
      /* ignore bell errors */
    }
  }, []);

  const markAllRead = useCallback(async () => {
    try {
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ all: true }),
      });
      setUnreadCount(0);
      setNotifications((prev) =>
        prev.map((item) => (item.read_at ? item : { ...item, read_at: new Date().toISOString() }))
      );
    } catch {
      /* ignore */
    }
  }, []);

  // Opening any staff page clears the badge so counts start at zero.
  useEffect(() => {
    void (async () => {
      await markAllRead();
      await loadNotifications();
    })();
    const timer = window.setInterval(() => void loadNotifications(), 60_000);
    return () => window.clearInterval(timer);
  }, [pathname, markAllRead, loadNotifications]);

  async function logout() {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      toast.info('Signed out', 'You have been logged out successfully.');
      router.push('/login');
      router.refresh();
    } catch {
      router.push('/login');
    }
  }

  function closeMobile() {
    setMobileOpen(false);
  }

  const navModules = filterModulesForRole(TENANT_MODULES, userRole);
  const homePath = getHomePathForRole(userRole);
  const canAccessDashboard = hasAnyRole(userRole, DASHBOARD_ROLES);
  const canAccessSettingsPage = hasAnyRole(userRole, SETTINGS_ROLES);

  const moduleById = useMemo(() => {
    const map = new Map(navModules.map((m) => [m.id, m]));
    return map;
  }, [navModules]);

  const topLinks = useMemo(
    () => TENANT_NAV_TOP_IDS.map((id) => moduleById.get(id)).filter(Boolean),
    [moduleById]
  );

  const navGroups = useMemo(
    () =>
      TENANT_NAV_GROUPS.map((group) => ({
        ...group,
        items: group.moduleIds.map((id) => moduleById.get(id)).filter(Boolean),
      })).filter((g) => g.items.length > 0),
    [moduleById]
  );

  const activeGroupId = useMemo(() => {
    for (const group of navGroups) {
      if (group.items.some((m) => m && (pathname === m.href || pathname.startsWith(`${m.href}/`)))) {
        return group.id;
      }
    }
    return null;
  }, [navGroups, pathname]);

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!activeGroupId) return;
    setOpenGroups((prev) => (prev[activeGroupId] ? prev : { ...prev, [activeGroupId]: true }));
  }, [activeGroupId]);

  function toggleGroup(id: string) {
    setOpenGroups((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function isLinkActive(href: string) {
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <>
      <div
        id="overlay"
        className={`overlay${mobileOpen ? ' show' : ''}`}
        onClick={closeMobile}
        aria-hidden="true"
      />

      <nav id="topbar" className={`navbar fixed-top topbar px-3 premium-topbar${collapsed ? ' full' : ''}`}>
        <button
          id="toggleBtn"
          type="button"
          className="d-none d-lg-inline-flex btn btn-light btn-icon btn-sm"
          onClick={() => setCollapsed((v) => !v)}
          aria-label="Toggle sidebar"
        >
          <i className="ti ti-layout-sidebar-left-expand" />
        </button>

        <button
          id="mobileBtn"
          type="button"
          className="btn btn-light btn-icon btn-sm d-lg-none me-2"
          onClick={() => setMobileOpen(true)}
          aria-label="Open sidebar"
        >
          <i className="ti ti-layout-sidebar-left-expand" />
        </button>

        <div className="ms-auto">
          <ul className="list-unstyled d-flex align-items-center mb-0 gap-1">
            <NavbarSubscriptionBadge canUpgrade={canAccessSettingsPage} />
            <li>
              <a
                className="position-relative btn-icon btn-sm btn-light btn rounded-circle"
                data-bs-toggle="dropdown"
                aria-expanded="false"
                href="#"
                role="button"
                onClick={() => {
                  if (unreadCount > 0) void markAllRead();
                }}
              >
                <i className="ti ti-bell" />
                {unreadCount > 0 ? (
                  <span className="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-danger mt-2 ms-n2">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                ) : null}
              </a>
              <div className="dropdown-menu dropdown-menu-end dropdown-menu-md p-0">
                <ul className="list-unstyled p-0 m-0">
                  {notifications.length === 0 ? (
                    <li className="p-3 text-center text-muted small">No notifications yet.</li>
                  ) : (
                    notifications.slice(0, 8).map((item) => (
                      <li key={item.id} className={`p-3 border-bottom${item.read_at ? '' : ' bg-light'}`}>
                        <div className="d-flex gap-3">
                          <UserAvatar
                            name={item.title}
                            size="sm"
                            variant={notificationVariant(item.type)}
                          />
                          <div className="flex-grow-1 small">
                            {item.link ? (
                              <Link href={item.link} className="text-decoration-none text-dark">
                                <p className="mb-0 fw-semibold">{item.title}</p>
                              </Link>
                            ) : (
                              <p className="mb-0 fw-semibold">{item.title}</p>
                            )}
                            {item.body ? <p className="mb-1">{item.body}</p> : null}
                            <div className="text-secondary">{relativeTime(item.created_at)}</div>
                          </div>
                        </div>
                      </li>
                    ))
                  )}
                  <li className="px-4 py-3 text-center">
                    <button type="button" className="btn btn-link btn-sm p-0" onClick={() => void markAllRead()}>
                      Mark all as read
                    </button>
                  </li>
                </ul>
              </div>
            </li>

            <UserProfileMenu
              userName={userName}
              userAvatarUrl={userAvatarUrl}
              userRole={userRole}
              items={[
                ...(canAccessDashboard
                  ? [{ type: 'link' as const, href: '/dashboard', label: 'Dashboard', icon: 'ti-layout-dashboard' }]
                  : []),
                {
                  type: 'button' as const,
                  label: 'Account settings',
                  icon: 'ti-user-circle',
                  onClick: () => setAccountOpen(true),
                },
                ...(canAccessSettingsPage
                  ? [{ type: 'link' as const, href: '/settings', label: 'Hotel settings', icon: 'ti-building-cog' }]
                  : []),
              ]}
              onSignOut={logout}
            />
          </ul>
        </div>
      </nav>

      <aside
        id="sidebar"
        className={`sidebar premium-sidebar${collapsed ? ' collapsed' : ''}${mobileOpen ? ' mobile-show' : ''}`}
      >
        <div className="logo-area">
          <Link href={homePath} className="d-inline-flex align-items-center text-decoration-none gap-2">
            {hotelLogoUrl ? (
              <img
                src={hotelLogoUrl}
                alt=""
                width={44}
                height={44}
                className="premium-sidebar-logo"
                style={{ objectFit: 'contain' }}
              />
            ) : (
              <Image src="/assets/images/logo-icon.svg" alt="" width={44} height={44} priority />
            )}
            <span className="logo-text text-truncate">{hotelName}</span>
          </Link>
        </div>

        <ul className="nav flex-column premium-sidebar-nav">
          <li className="px-4 py-2">
            <small className="nav-text text-secondary">Main</small>
          </li>
          {topLinks.map((item) =>
            item ? (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`nav-link d-flex align-items-center gap-2${isLinkActive(item.href) ? ' active' : ''}`}
                  onClick={closeMobile}
                >
                  <i className={`ti ${item.icon}`} />
                  <span className="nav-text flex-grow-1">{item.title}</span>
                </Link>
              </li>
            ) : null
          )}

          {navGroups.map((group) => {
            const isOpen = Boolean(openGroups[group.id]) || collapsed;
            const groupActive = activeGroupId === group.id;
            return (
              <li key={group.id} className="premium-nav-group">
                <button
                  type="button"
                  className={`nav-link premium-nav-group__toggle d-flex align-items-center gap-2 w-100 border-0 text-start${
                    groupActive ? ' is-active-group' : ''
                  }`}
                  onClick={() => toggleGroup(group.id)}
                  aria-expanded={isOpen}
                  title={group.label}
                >
                  <i className={`ti ${group.icon}`} />
                  <span className="nav-text flex-grow-1">{group.label}</span>
                  <i
                    className={`ti ti-chevron-down premium-nav-group__chevron nav-text${isOpen ? ' is-open' : ''}`}
                    aria-hidden
                  />
                </button>
                <div
                  className={`premium-nav-group__panel${isOpen ? ' is-open' : ''}`}
                  aria-hidden={!isOpen}
                >
                  <ul className="nav flex-column premium-nav-group__items">
                    {group.items.map((item) =>
                      item ? (
                        <li key={item.href}>
                          <Link
                            href={item.href}
                            tabIndex={isOpen ? undefined : -1}
                            className={`nav-link premium-nav-group__link d-flex align-items-center gap-2${
                              isLinkActive(item.href) ? ' active' : ''
                            }`}
                            onClick={closeMobile}
                            title={
                              item.status === 'coming-soon'
                                ? `Team ${item.team} · Loop ${item.loop}`
                                : item.title
                            }
                          >
                            <i className={`ti ${item.icon}`} />
                            <span className="nav-text flex-grow-1">{item.title}</span>
                            {item.status === 'coming-soon' ? (
                              <span
                                className="badge rounded-pill text-bg-light border text-muted"
                                style={{ fontSize: '0.65rem' }}
                              >
                                L{item.loop}
                              </span>
                            ) : null}
                          </Link>
                        </li>
                      ) : null
                    )}
                  </ul>
                </div>
              </li>
            );
          })}

          <li className="px-4 pt-4 pb-2">
            <small className="nav-text text-secondary">Account</small>
          </li>
          <li>
            <button type="button" className="nav-link border-0 bg-transparent w-100 text-start" onClick={logout}>
              <i className="ti ti-logout" />
              <span className="nav-text">Sign out</span>
            </button>
          </li>
        </ul>
      </aside>

      <main id="content" className={`content premium-main premium-content-bg py-10${collapsed ? ' full' : ''}`}>
        {subscriptionLocked ? (
          <div
            className="alert alert-warning mx-3 mb-0"
            role="alert"
            style={{ borderRadius: 12 }}
          >
            <strong>Account locked.</strong> {subscriptionLocked}{' '}
            <Link href="/settings?tab=subscription" className="alert-link">
              Renew subscription
            </Link>
          </div>
        ) : null}
        <div className="container-fluid">
          <AnimatedPage pageKey={pathname}>{children}</AnimatedPage>
        </div>
      </main>

      <AccountSettingsModal open={accountOpen} onClose={() => setAccountOpen(false)} />
    </>
  );
}
