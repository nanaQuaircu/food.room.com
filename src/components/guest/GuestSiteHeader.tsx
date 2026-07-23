'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { fetchApi } from '@/lib/client/fetch-api';
import { useGuestCartOptional } from '@/components/guest/GuestCartContext';
import { motion, AnimatePresence } from 'framer-motion';
type Profile = {
  name: string;
  logo_url?: string | null;
};

type GuestSession = {
  userName: string;
  userEmail: string;
} | null;

const NAV = [
  { href: '', label: 'Home', match: 'home' as const },
  { href: '/about', label: 'About Us', match: 'prefix' as const },
  { href: '/rooms', label: 'Rooms', match: 'prefix' as const },
  { href: '/menu', label: 'Restaurant', match: 'prefix' as const },
  { href: '/trips', label: 'My Trips', match: 'prefix' as const },
  { href: '/contact', label: 'Contact', match: 'prefix' as const },
];

/** Palatin header — React sticky + mobile drawer portaled to body. */
export default function GuestSiteHeader({
  slug,
  profile,
  guestSession,
}: {
  slug: string;
  profile: Profile | null;
  guestSession: GuestSession;
}) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [sticky, setSticky] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const cart = useGuestCartOptional();
  const base = `/${slug}`;
  const name = profile?.name || 'Hotel';

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const onScroll = () => setSticky(window.scrollY > 40);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    document.body.classList.toggle('guest-menu-open', menuOpen);
    return () => document.body.classList.remove('guest-menu-open');
  }, [menuOpen]);

  useEffect(() => {
    setMenuOpen(false);
    setDropdownOpen(false);
  }, [pathname]);

  function isActive(item: (typeof NAV)[number]) {
    const href = `${base}${item.href}`;
    if (item.match === 'home') return pathname === base || pathname === `${base}/`;
    return pathname.startsWith(href);
  }

  function closeMenu() {
    setMenuOpen(false);
  }

  async function handleLogout() {
    try {
      const res = await fetchApi(`/api/public/${slug}/auth`, {
        method: 'POST',
        body: JSON.stringify({ action: 'logout' }),
      });
      if (res.success) {
        window.location.reload();
      } else {
        alert(res.message || 'Logout failed.');
      }
    } catch (e) {
      console.error(e);
    }
  }

  const mobileOverlay =
    mounted &&
    createPortal(
      <>
        <div
          id="guestMobileDrawer"
          className={`guest-mobile-drawer${menuOpen ? ' is-open' : ''}`}
          aria-hidden={!menuOpen}
        >
          <button
            type="button"
            className="guest-mobile-drawer__close"
            aria-label="Close menu"
            onClick={closeMenu}
          >
            <span />
            <span />
          </button>
          <nav className="guest-mobile-drawer__nav" aria-label="Mobile">
            <ul>
              {NAV.map((item) => {
                const href = `${base}${item.href}`;
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      className={isActive(item) ? 'active' : undefined}
                      onClick={closeMenu}
                    >
                      {item.label}
                    </Link>
                  </li>
                );
              })}
              {guestSession ? (
                <>
                  <li key="mobile-profile">
                    <Link href={`${base}/account`} onClick={closeMenu}>
                      Profile Dashboard
                    </Link>
                  </li>
                  <li key="mobile-bookings">
                    <Link href={`${base}/trips`} onClick={closeMenu}>
                      My Bookings
                    </Link>
                  </li>
                  <li key="mobile-orders">
                    <Link href={`${base}/orders`} onClick={closeMenu}>
                      My Orders
                    </Link>
                  </li>
                  <li key="mobile-cart">
                    <button
                      type="button"
                      onClick={() => {
                        closeMenu();
                        cart?.openCart();
                      }}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#cb8670',
                        padding: '10px 20px',
                        textAlign: 'left',
                        width: '100%',
                        fontWeight: 600,
                      }}
                    >
                      Cart{cart && cart.cartCount > 0 ? ` (${cart.cartCount})` : ''}
                    </button>
                  </li>
                  <li key="mobile-logout">
                    <button
                      type="button"
                      onClick={() => {
                        closeMenu();
                        void handleLogout();
                      }}
                      style={{
                        background: 'rgba(255,255,255,0.95)',
                        border: '1px solid rgba(255,255,255,0.85)',
                        color: '#b42318',
                        padding: '10px 20px',
                        textAlign: 'center',
                        width: 'calc(100% - 40px)',
                        margin: '8px 20px 4px',
                        fontWeight: 700,
                        borderRadius: 8,
                      }}
                    >
                      Sign Out
                    </button>
                  </li>
                </>
              ) : (
                <>
                  <li key="mobile-cart-guest">
                    <button
                      type="button"
                      onClick={() => {
                        closeMenu();
                        cart?.openCart();
                      }}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#cb8670',
                        padding: '10px 20px',
                        textAlign: 'left',
                        width: '100%',
                        fontWeight: 600,
                      }}
                    >
                      Cart{cart && cart.cartCount > 0 ? ` (${cart.cartCount})` : ''}
                    </button>
                  </li>
                  <li key="mobile-login">
                    <Link href={`${base}/account`} onClick={closeMenu}>
                      Sign In / Register
                    </Link>
                  </li>
                </>
              )}
            </ul>
            <Link href={`${base}/rooms`} className="guest-mobile-drawer__cta" onClick={closeMenu}>
              Make a Reservation
            </Link>
          </nav>
        </div>
        {menuOpen ? (
          <button
            type="button"
            className="guest-mobile-drawer__backdrop"
            aria-label="Close menu"
            onClick={closeMenu}
          />
        ) : null}
      </>,
      document.body
    );

  return (
    <header className="header-area">
      <div className={sticky ? 'is-sticky' : undefined}>
        <div className="palatin-main-menu">
          <div className="classy-nav-container breakpoint-off">
            <div className="container">
              <nav className="classy-navbar justify-content-between" id="palatinNav">
                <Link href={base} className="nav-brand guest-nav-brand" onClick={closeMenu}>
                  {profile?.logo_url ? (
                    <img src={profile.logo_url} alt={name} className="guest-nav-logo" />
                  ) : null}
                  <span className="guest-nav-name">{name}</span>
                </Link>

                <div className="guest-mobile-nav-actions">
                  <button
                    type="button"
                    className="guest-nav-cart guest-nav-cart--mobile"
                    aria-label={cart?.cartCount ? `Cart, ${cart.cartCount} items` : 'Cart'}
                    onClick={() => cart?.openCart()}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                      <path
                        d="M7 7h14l-1.5 9h-11L7 7zm0 0L5.5 4H2"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <circle cx="10" cy="20" r="1.4" fill="currentColor" />
                      <circle cx="17" cy="20" r="1.4" fill="currentColor" />
                    </svg>
                    {cart && cart.cartCount > 0 ? (
                      <span className="guest-nav-cart__badge">{cart.cartCount}</span>
                    ) : null}
                  </button>
                  <button
                    type="button"
                    className="classy-navbar-toggler"
                    aria-label="Toggle menu"
                    aria-expanded={menuOpen}
                    onClick={() => setMenuOpen((v) => !v)}
                  >
                    <span className={`navbarToggler${menuOpen ? ' active' : ''}`}>
                      <span></span>
                      <span></span>
                      <span></span>
                    </span>
                  </button>
                </div>

                <div className="classy-menu guest-desktop-menu">
                  <div className="classynav">
                    <ul>
                      {NAV.map((item) => {
                        const href = `${base}${item.href}`;
                        return (
                          <li key={href} className={isActive(item) ? 'active' : undefined}>
                            <Link href={href}>{item.label}</Link>
                          </li>
                        );
                      })}
                    </ul>
                    
                    <div className="menu-btn d-flex align-items-center gap-3" style={{ position: 'relative', marginLeft: '20px' }}>
                      {guestSession ? (
                        <div className="guest-profile-dropdown-wrapper">
                          <button
                            type="button"
                            className="btn palatin-btn"
                            onClick={() => setDropdownOpen((o) => !o)}
                            style={{
                              background: '#cb8670',
                              color: '#fff',
                              border: 'none',
                              borderRadius: '0',
                              padding: '8px 18px',
                              height: '40px',
                              lineHeight: '24px',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px',
                              fontSize: '0.9rem',
                              fontWeight: 600,
                              cursor: 'pointer'
                            }}
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" className="bi bi-person-fill" viewBox="0 0 16 16">
                              <path d="M3 14s-1 0-1-1 1-4 6-4 6 3 6 4-1 1-1 1zm5-6a3 3 0 1 0 0-6 3 3 0 0 0 0 6"/>
                            </svg>
                            <span>{guestSession.userName.split(' ')[0]}</span>
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="currentColor" className={`bi bi-chevron-down ms-1 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} viewBox="0 0 16 16" style={{ transition: 'transform 0.2s' }}>
                              <path fillRule="evenodd" d="M1.646 4.646a.5.5 0 0 1 .708 0L8 10.293l5.646-5.647a.5.5 0 0 1 .708.708l-6 6a.5.5 0 0 1-.708 0l-6-6a.5.5 0 0 1 0-.708"/>
                            </svg>
                          </button>

                          <AnimatePresence>
{dropdownOpen && (
  <motion.div
    className="guest-profile-dropdown-menu"
    style={{
      position: 'absolute',
      right: 0,
      top: '100%',
      marginTop: '10px',
      background: '#fff',
      boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
      borderRadius: '8px',
      width: '220px',
      zIndex: 1000,
      padding: '10px 0',
      border: '1px solid rgba(0,0,0,0.08)',
    }}
    initial={{ opacity: 0, y: -10 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: -10 }}
    transition={{ duration: 0.2 }}
  >
    <div style={{ padding: '8px 20px', borderBottom: '1px solid #eee', marginBottom: '8px' }}>
      <p style={{ margin: 0, fontWeight: 700, fontSize: '0.9rem', color: '#333', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {guestSession.userName}
      </p>
      <span style={{ fontSize: '0.75rem', color: '#777', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}>
        {guestSession.userEmail}
      </span>
    </div>
    <motion.div whileHover={{ scale: 1.02 }} style={{ overflow: 'hidden' }}>
      <Link
        href={`${base}/account`}
        onClick={() => setDropdownOpen(false)}
        className="guest-profile-dropdown-link"
        style={{ display: 'block', padding: '10px 20px', color: '#111', fontSize: '0.85rem', textDecoration: 'none', fontWeight: 500 }}
      >
        My Profile
      </Link>
    </motion.div>
    <motion.div whileHover={{ scale: 1.02 }} style={{ overflow: 'hidden' }}>
      <Link
        href={`${base}/trips`}
        onClick={() => setDropdownOpen(false)}
        className="guest-profile-dropdown-link"
        style={{ display: 'block', padding: '10px 20px', color: '#111', fontSize: '0.85rem', textDecoration: 'none', fontWeight: 500 }}
      >
        My Bookings
      </Link>
    </motion.div>
    <motion.div whileHover={{ scale: 1.02 }} style={{ overflow: 'hidden' }}>
      <Link
        href={`${base}/orders`}
        onClick={() => setDropdownOpen(false)}
        className="guest-profile-dropdown-link"
        style={{ display: 'block', padding: '10px 20px', color: '#111', fontSize: '0.85rem', textDecoration: 'none', fontWeight: 500 }}
      >
        My Orders
      </Link>
    </motion.div>
    <div style={{ borderTop: '1px solid #eee', marginTop: '8px', paddingTop: '8px' }}>
      <motion.button
        whileHover={{ backgroundColor: '#fff5f5' }}
        type="button"
        onClick={() => void handleLogout()}
        style={{
          display: 'block',
          width: '100%',
          textAlign: 'left',
          padding: '8px 20px',
          color: '#dc3545',
          fontSize: '0.85rem',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          fontWeight: 600,
        }}
      >
        Sign out
      </motion.button>
    </div>
  </motion.div>
)}
</AnimatePresence>
                        </div>
                      ) : (
                        <Link href={`${base}/account`} className="btn palatin-btn" style={{ height: '40px', lineHeight: '24px', padding: '8px 20px' }}>
                          Sign In
                        </Link>
                      )}
                      
                      <Link
                        href={`${base}/rooms`}
                        className="btn palatin-btn guest-book-now-btn"
                        style={{
                          height: '40px',
                          lineHeight: '24px',
                          padding: '8px 22px',
                          marginLeft: '16px',
                          backgroundColor: '#000000',
                          borderColor: '#000000',
                          color: '#ffffff',
                          borderRadius: '0',
                          fontWeight: 700,
                          letterSpacing: '0.5px',
                        }}
                      >
                        Book Now
                      </Link>

                      <button
                        type="button"
                        className="guest-nav-cart"
                        aria-label={cart?.cartCount ? `Cart, ${cart.cartCount} items` : 'Cart'}
                        onClick={() => cart?.openCart()}
                        style={{ marginLeft: '8px' }}
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                          <path
                            d="M7 7h14l-1.5 9h-11L7 7zm0 0L5.5 4H2"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                          <circle cx="10" cy="20" r="1.4" fill="currentColor" />
                          <circle cx="17" cy="20" r="1.4" fill="currentColor" />
                        </svg>
                        {cart && cart.cartCount > 0 ? (
                          <span className="guest-nav-cart__badge">{cart.cartCount}</span>
                        ) : null}
                      </button>
                    </div>

                  </div>
                </div>
              </nav>
            </div>
          </div>
        </div>
      </div>
      {mobileOverlay}
    </header>
  );
}
