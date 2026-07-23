'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Syne, Manrope } from 'next/font/google';
import { GUEST_HERO_IMAGES } from '@/lib/guest/hero-images';

const display = Syne({
  subsets: ['latin'],
  weight: ['600', '700', '800'],
  variable: '--saas-display',
});

const sans = Manrope({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--saas-sans',
});

const appName = process.env.NEXT_PUBLIC_APP_NAME || 'Hotel PMS Pro';

export default function SaaSLandingPage() {
  const router = useRouter();
  const [hotelQuery, setHotelQuery] = useState('');
  const [finding, setFinding] = useState(false);
  const [findError, setFindError] = useState('');
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 36);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  async function findHotel(e: FormEvent) {
    e.preventDefault();
    const name = hotelQuery.trim();
    if (!name) {
      setFindError('Enter a hotel name to continue.');
      return;
    }
    setFinding(true);
    setFindError('');
    try {
      const res = await fetch('/api/hotel/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const json = await res.json();
      if (!json.success || !json.data?.slug) {
        setFindError(json.message || 'No hotel found with that name.');
        return;
      }
      router.push(`/${json.data.slug}`);
    } catch {
      setFindError('Could not reach the hotel registry. Try again.');
    } finally {
      setFinding(false);
    }
  }

  return (
    <div
      className={`saas-landing ${display.variable} ${sans.variable}${scrolled ? ' is-scrolled' : ''}`}
    >
      <header className="saas-landing__nav">
        <Link href="/" className="saas-landing__nav-brand">
          {appName}
        </Link>
        <nav className="saas-landing__nav-links" aria-label="Primary">
          <a href="#find-hotel">Find a hotel</a>
          <Link href="/login" className="saas-landing__nav-login">
            Staff login
          </Link>
        </nav>
      </header>

      <section className="saas-landing__hero">
        <div className="saas-landing__hero-media" aria-hidden>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={GUEST_HERO_IMAGES[2]} alt="" className="saas-landing__hero-img" />
          <div className="saas-landing__hero-veil" />
        </div>

        <div className="saas-landing__hero-copy">
          <p className="saas-landing__product">{appName}</p>
          <h1 className="saas-landing__title">
            Your hotel software.
            <em>Their guest website.</em>
          </h1>
          <p className="saas-landing__lede">
            One platform for front desk, billing, and dining — plus a branded site where guests
            book rooms and order food.
          </p>

          <div className="saas-landing__cta" id="find-hotel">
            <Link href="/login" className="saas-landing__primary">
              Staff login
            </Link>
            <form className="saas-landing__search" onSubmit={(e) => void findHotel(e)}>
              <label className="visually-hidden" htmlFor="saas-hotel-search">
                Find a hotel website
              </label>
              <input
                id="saas-hotel-search"
                type="search"
                placeholder="Search hotel name…"
                value={hotelQuery}
                onChange={(e) => {
                  setHotelQuery(e.target.value);
                  if (findError) setFindError('');
                }}
                autoComplete="organization"
              />
              <button type="submit" disabled={finding}>
                {finding ? '…' : 'Go'}
              </button>
            </form>
          </div>
          {findError ? (
            <p className="saas-landing__msg saas-landing__msg--error" role="alert">
              {findError}
            </p>
          ) : (
            <p className="saas-landing__msg">Guests search here · Managers use Staff login</p>
          )}
        </div>
      </section>

      <section className="saas-landing__split" aria-label="Who it’s for">
        <div className="saas-landing__panel">
          <p className="saas-landing__kicker">Hotel teams</p>
          <h2>Operate the property</h2>
          <p>
            Reservations, check-in, folios, restaurant tickets, warehouse, and staff — one staff
            login.
          </p>
          <Link href="/login">Open staff login →</Link>
        </div>
        <div className="saas-landing__panel saas-landing__panel--alt">
          <p className="saas-landing__kicker">Guests</p>
          <h2>Visit the hotel site</h2>
          <p>
            Every hotel gets its own page to explore rooms, order from the menu, and manage trips.
          </p>
          <a href="#find-hotel">Find a hotel →</a>
        </div>
      </section>

      <footer className="saas-landing__footer">
        <strong>{appName}</strong>
        <Link href="/login">Staff login</Link>
      </footer>
    </div>
  );
}
