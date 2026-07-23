'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { useToast } from '@/components/ui/ToastProvider';
import { PLATFORM_MODULES } from '@/lib/module-registry';
import AnimatedPage from '@/components/layout/AnimatedPage';
import UserProfileMenu from '@/components/layout/UserProfileMenu';

export default function PlatformLayout({
  children,
  userName,
}: {
  children: React.ReactNode;
  userName: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const toast = useToast();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  async function logout() {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      toast.info('Signed out', 'You have been logged out of the platform.');
      router.push('/login');
      router.refresh();
    } catch {
      router.push('/login');
    }
  }

  return (
    <>
      <div
        className={`overlay${mobileOpen ? ' show' : ''}`}
        onClick={() => setMobileOpen(false)}
        aria-hidden="true"
      />

      <nav className={`navbar fixed-top topbar px-3 premium-topbar${collapsed ? ' full' : ''}`}>
        <button
          type="button"
          className="d-none d-lg-inline-flex btn btn-light btn-icon btn-sm"
          onClick={() => setCollapsed((v) => !v)}
          aria-label="Toggle sidebar"
        >
          <i className="ti ti-layout-sidebar-left-expand" />
        </button>
        <button
          type="button"
          className="btn btn-light btn-icon btn-sm d-lg-none me-2"
          onClick={() => setMobileOpen(true)}
          aria-label="Open sidebar"
        >
          <i className="ti ti-layout-sidebar-left-expand" />
        </button>
        <div className="ms-auto">
          <ul className="list-unstyled d-flex align-items-center mb-0 gap-1">
            <UserProfileMenu
              userName={userName}
              roleLabel="Platform Admin"
              items={[{ type: 'link', href: '/platform', label: 'Dashboard', icon: 'ti-layout-dashboard' }]}
              onSignOut={logout}
            />
          </ul>
        </div>
      </nav>

      <aside className={`sidebar premium-sidebar${collapsed ? ' collapsed' : ''}${mobileOpen ? ' mobile-show' : ''}`}>
        <div className="logo-area">
          <Link href="/platform" className="d-inline-flex align-items-center text-decoration-none">
            <Image src="/assets/images/logo-icon.svg" alt="" width={24} height={24} />
            <span className="logo-text ms-2 text-truncate" style={{ maxWidth: 170, color: '#262626', fontWeight: 600 }}>
              Platform Admin
            </span>
          </Link>
        </div>
        <ul className="nav flex-column">
          <li className="px-4 py-2">
            <small className="nav-text text-secondary">Platform</small>
          </li>
          {PLATFORM_MODULES.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className={`nav-link d-flex align-items-center gap-2${pathname === item.href ? ' active' : ''}`}
                onClick={() => setMobileOpen(false)}
                title={item.status === 'coming-soon' ? `Team ${item.team} · Loop ${item.loop}` : undefined}
              >
                <i className={`ti ${item.icon}`} />
                <span className="nav-text flex-grow-1">{item.title === 'Platform Dashboard' ? 'Dashboard' : item.title}</span>
                {item.status === 'coming-soon' ? (
                  <span className="badge rounded-pill text-bg-light border text-muted" style={{ fontSize: '0.65rem' }}>
                    L{item.loop}
                  </span>
                ) : null}
              </Link>
            </li>
          ))}
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

      <main className={`content premium-main premium-content-bg py-10${collapsed ? ' full' : ''}`}>
        <div className="container-fluid">
          <AnimatedPage pageKey={pathname}>{children}</AnimatedPage>
        </div>
      </main>
    </>
  );
}
