'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { fetchApi } from '@/lib/client/fetch-api';
import { formatGuestMoney } from '@/lib/guest/format-money';
import { formatDisplayDate } from '@/lib/dates/format-display-date';
import { useToast } from '@/components/ui/ToastProvider';
import GuestPageHero from '@/components/guest/GuestPageHero';

const ASSET = '/palatin';
const PLACEHOLDER = `${ASSET}/img/bg-img/1.jpg`;

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDaysIso(iso: string, days: number) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function nightsBetween(checkIn: string, checkOut: string) {
  if (!checkIn || !checkOut) return 0;
  const a = new Date(`${checkIn}T12:00:00`).getTime();
  const b = new Date(`${checkOut}T12:00:00`).getTime();
  const days = Math.round((b - a) / 86400000);
  return days > 0 ? days : 0;
}

type RoomTypeInfo = {
  id: number;
  name: string;
  base_rate: number;
  image_url?: string | null;
  max_occupancy?: number;
};

const fadeInUp = {
  initial: { opacity: 0, y: 30 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.6, ease: 'easeOut' as const } },
};

const stagger = {
  animate: { transition: { staggerChildren: 0.08 } },
};

const viewport = { once: true, margin: '-50px' };

export default function GuestBookModule({ slug }: { slug: string }) {
  const router = useRouter();
  const toast = useToast();
  const params = useSearchParams();
  const roomTypeId = Number(params.get('room_type_id') || 0);
  const roomIdParam = params.get('room_id');
  const roomId = roomIdParam ? Number(roomIdParam) : 0;
  const roomNumber = params.get('room_number')?.trim() || '';

  const [checkIn, setCheckIn] = useState(params.get('check_in') || todayIso());
  const [checkOut, setCheckOut] = useState(params.get('check_out') || addDaysIso(todayIso(), 2));
  const [adults, setAdults] = useState(Math.max(1, Number(params.get('adults') || 2)));
  const [children, setChildren] = useState(Math.max(0, Number(params.get('children') || 0)));
  
  const guestNameParam = params.get('guest_name')?.trim() || '';
  const guestNameParts = guestNameParam ? guestNameParam.split(/\s+/) : [];
  const [firstName, setFirstName] = useState(guestNameParts[0] || '');
  const [lastName, setLastName] = useState(guestNameParts.slice(1).join(' ') || '');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [roomType, setRoomType] = useState<RoomTypeInfo | null>(null);
  const [currency, setCurrency] = useState('GHS');
  const [quote, setQuote] = useState<{
    total_amount?: number;
    nights?: number;
    rate_per_night?: number;
    ok?: boolean;
    message?: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [paystackReady, setPaystackReady] = useState(false);
  /** Safer default: reserve now, settle at property unless guest opts into Paystack. */
  const [paymentChoice, setPaymentChoice] = useState<'hotel' | 'online'>('hotel');
  const [promoCode, setPromoCode] = useState('');
  const [useCredits, setUseCredits] = useState(false);
  const [accountCredits, setAccountCredits] = useState(0);
  const [quoteDetail, setQuoteDetail] = useState<{
    quote?: {
      room_subtotal: number;
      upsells: { total: number };
      taxes: number;
      tax_rate: number;
      security_deposit: number;
      promo_discount: number;
      credits_applied: number;
      due_now: number;
      due_at_hotel: number;
      total_amount: number;
    };
    ok?: boolean;
    message?: string;
    nights?: number;
    rate_per_night?: number;
  } | null>(null);

  // Authentication & Guest Profile Pre-fill
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);

  // Upsell Toggles
  const [breakfast, setBreakfast] = useState(false);
  const [lateCheckout, setLateCheckout] = useState(false);
  const [spa, setSpa] = useState(false);

  useEffect(() => {
    // Check auth and prefill profile
    fetchApi<{ first_name: string; last_name: string; email: string; phone: string }>(`/api/public/${slug}/profile`)
      .then((res) => {
        if (res.success && res.data) {
          setAuthenticated(true);
          setFirstName(res.data.first_name || '');
          setLastName(res.data.last_name || '');
          setEmail(res.data.email || '');
          setPhone(res.data.phone || '');
          setAccountCredits(Number((res.data as { account_credits?: number }).account_credits ?? 0));
        } else {
          setAuthenticated(false);
        }
      })
      .catch(() => setAuthenticated(false))
      .finally(() => setLoadingAuth(false));
  }, [slug]);

  // Soft Holds implementation
  useEffect(() => {
    if (!roomTypeId || !authenticated) return;

    const placeHold = () => {
      fetchApi(`/api/public/${slug}/holds`, {
        method: 'POST',
        body: JSON.stringify({ room_type_id: roomTypeId, room_id: roomId || undefined }),
      }).catch(console.error);
    };

    placeHold();
    const interval = setInterval(placeHold, 2 * 60 * 1000); // refresh every 2 mins

    return () => {
      clearInterval(interval);
      fetchApi(`/api/public/${slug}/holds`, { method: 'DELETE' }).catch(console.error);
    };
  }, [slug, roomTypeId, roomId, authenticated]);

  const nights = useMemo(
    () => quoteDetail?.nights ?? quote?.nights ?? nightsBetween(checkIn, checkOut),
    [quoteDetail?.nights, quote?.nights, checkIn, checkOut]
  );

  const q = quoteDetail?.quote;
  const rate = Number(quoteDetail?.rate_per_night ?? quote?.rate_per_night ?? roomType?.base_rate ?? 0);
  const roomSubtotal = q?.room_subtotal ?? rate * nights;
  const upsellsTotal = q?.upsells.total ?? 0;
  const promoDiscount = q?.promo_discount ?? 0;
  const creditsApplied = q?.credits_applied ?? 0;
  const dueNow = q?.due_now ?? Math.max(0, roomSubtotal + upsellsTotal - promoDiscount - creditsApplied);

  useEffect(() => {
    if (paymentChoice !== 'online') return;
    if (document.getElementById('paystack-js')) {
      setPaystackReady(true);
      return;
    }
    const script = document.createElement('script');
    script.id = 'paystack-js';
    script.src = 'https://js.paystack.co/v1/inline.js';
    script.async = true;
    script.onload = () => setPaystackReady(true);
    script.onerror = () => setPaystackReady(false);
    document.body.appendChild(script);
  }, [paymentChoice]);

  useEffect(() => {
    void fetchApi<{ currency: string }>(`/api/public/${slug}`).then((res) => {
      if (res.success && res.data?.currency) setCurrency(res.data.currency);
    });
    if (!roomTypeId) return;
    void fetchApi<RoomTypeInfo[]>(`/api/public/${slug}/room-types`).then((res) => {
      if (res.success && res.data) {
        setRoomType(res.data.find((r) => r.id === roomTypeId) ?? null);
      }
    });
  }, [slug, roomTypeId]);

  // Server-side quote (aligned with charges)
  useEffect(() => {
    if (!roomTypeId || !checkIn || !checkOut) return;
    const params = new URLSearchParams({
      room_type_id: String(roomTypeId),
      check_in: checkIn,
      check_out: checkOut,
      breakfast: breakfast ? '1' : '0',
      late_checkout: lateCheckout ? '1' : '0',
      spa: spa ? '1' : '0',
    });
    if (roomId) params.set('room_id', String(roomId));
    if (promoCode.trim()) params.set('promo_code', promoCode.trim());
    if (useCredits && accountCredits > 0) params.set('credits', String(accountCredits));

    void fetchApi(`/api/public/${slug}/quote?${params.toString()}`).then((res) => {
      if (res.success && res.data) {
        setQuoteDetail(res.data as typeof quoteDetail);
        setQuote(res.data as typeof quote);
      }
    });
  }, [slug, roomTypeId, roomId, checkIn, checkOut, breakfast, lateCheckout, spa, promoCode, useCredits, accountCredits]);


  const canBook = Boolean(roomTypeId) && quote?.ok !== false && quoteDetail?.ok !== false && nights > 0;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!roomTypeId) return;
    setSaving(true);
    try {
      const res = await fetchApi<{
        id: number;
        confirmation_code: string;
        total_amount: number;
        status?: string;
      }>(`/api/public/${slug}/bookings`, {
        method: 'POST',
        body: JSON.stringify({
          room_type_id: roomTypeId,
          room_id: roomId || undefined,
          check_in_date: checkIn,
          check_out_date: checkOut,
          adults,
          children,
          first_name: firstName,
          last_name: lastName,
          email,
          phone,
          upsells: { breakfast, late_checkout: lateCheckout, spa },
          promo_code: promoCode.trim() || undefined,
          use_credits: useCredits,
          payment_choice: paymentChoice === 'online' ? 'online' : 'hotel',
        }),
      });

      if (!res.success || !res.data) {
        toast.error(res.message || 'Booking failed');
        return;
      }

      const code = res.data.confirmation_code;

      try {
        sessionStorage.setItem(`guest-last-booking:${slug}`, code);
      } catch {
        /* ignore */
      }

      const goConfirm = () => {
        router.push(`/${slug}/book/confirmation?code=${encodeURIComponent(code)}`);
      };

      const finalizePayAtHotel = async () => {
        await fetchApi(`/api/public/${slug}/bookings`, {
          method: 'POST',
          body: JSON.stringify({
            action: 'finalize_pay_at_hotel',
            confirmation_code: code,
            email,
          }),
        });
      };

      if (paymentChoice !== 'online') {
        goConfirm();
        return;
      }

      const payRes = await fetchApi<{
        public_key: string;
        reference: string;
        amount: number;
        currency?: string;
      }>(`/api/public/${slug}/paystack`, {
        method: 'POST',
        body: JSON.stringify({
          confirmation_code: code,
          email,
        }),
      });

      if (!payRes.success || !payRes.data?.public_key) {
        toast.warning(
          'Online payment unavailable',
          payRes.message || 'Your booking is confirmed — you can pay at the hotel.'
        );
        await finalizePayAtHotel();
        goConfirm();
        return;
      }

      if (!paystackReady || !window.PaystackPop) {
        toast.warning('Online payment unavailable', 'Your booking is confirmed — you can pay at the hotel.');
        await finalizePayAtHotel();
        goConfirm();
        return;
      }

      let paymentSucceeded = false;
      const payReference = payRes.data.reference;

      window.PaystackPop.setup({
        key: payRes.data.public_key,
        email,
        amount: Math.round(payRes.data.amount * 100),
        ref: payReference,
        currency: payRes.data.currency || currency,
        onClose: () => {
          window.setTimeout(() => {
            if (paymentSucceeded) return;
            void fetchApi(`/api/public/${slug}/paystack`, {
              method: 'POST',
              body: JSON.stringify({
                action: 'abandon',
                confirmation_code: code,
                reference: payReference,
              }),
            }).then((abandonRes) => {
              if (abandonRes.success && (abandonRes.data as { paid?: boolean } | undefined)?.paid) {
                paymentSucceeded = true;
                goConfirm();
                return;
              }
              toast.info('Payment cancelled', 'Your room hold was released. You can try booking again.');
            });
          }, 800);
        },
        callback: (response) => {
          void fetchApi(`/api/public/${slug}/paystack`, {
            method: 'POST',
            body: JSON.stringify({ action: 'confirm', reference: response.reference }),
          })
            .then((confirmRes) => {
              if (!confirmRes.success) {
                toast.error(confirmRes.message || 'Payment could not be verified.');
                return;
              }
              paymentSucceeded = true;
              goConfirm();
            })
            .catch(() => {
              toast.error('Payment could not be verified.');
            });
        },
      }).openIframe();
    } finally {
      setSaving(false);
    }
  }

  if (loadingAuth) {
    return (
      <div className="guest-page text-center">
        <motion.p
          className="guest-loading"
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 1.5, repeat: Infinity }}
        >
          Verifying authentication status…
        </motion.p>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <motion.div
        className="guest-page text-center"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
      >
        <p className="guest-section__eyebrow">Guest Account Required</p>
        <h1 className="guest-page__title">Sign in to book a room</h1>
        <p className="guest-page__sub mb-4" style={{ maxWidth: '500px', margin: '0 auto 1.5rem' }}>
          To confirm reservations, customize stay settings, and ensure transaction security, you must be signed in first.
        </p>
        <div className="guest-book-auth-actions">
          <Link
            href={`/${slug}/account?next=${encodeURIComponent(typeof window !== 'undefined' ? window.location.pathname + window.location.search : `/${slug}/book`)}`}
            className="guest-book-auth-actions__btn guest-book-auth-actions__btn--primary"
          >
            Sign In / Register
          </Link>
          <button
            type="button"
            className="guest-book-auth-actions__btn guest-book-auth-actions__btn--ghost"
            onClick={() => router.back()}
          >
            Go Back
          </button>
        </div>
      </motion.div>
    );
  }

  const heroImg = roomType?.image_url || PLACEHOLDER;

  return (
    <motion.div
      className="guest-reserve"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
    >
      <GuestPageHero className="guest-reserve__hero">
        <div className="guest-reserve__hero-inner">
          <motion.button
            type="button"
            className="guest-reserve__back"
            onClick={() => router.back()}
            whileHover={{ x: -4 }}
            transition={{ duration: 0.2 }}
          >
            ← Back
          </motion.button>
          <p className="guest-reserve__eyebrow">Reservation</p>
          <h1>Complete booking</h1>
          <p>
            Finalise your stay details. You will receive a confirmation page with your reference code
            when the reservation is placed.
          </p>
        </div>
      </GuestPageHero>

      <div className="guest-reserve__shell">
        <motion.div
          className="guest-reserve__summary-col"
          initial={{ opacity: 0, x: -30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.25, duration: 0.55 }}
        >
          <aside className="guest-reserve__summary">
            <motion.div
              className="guest-reserve__media"
              style={{ backgroundImage: `url(${heroImg})` }}
              whileHover={{ scale: 1.03 }}
              transition={{ duration: 0.3 }}
            />
            <div className="guest-reserve__summary-body">
              <p className="guest-reserve__label">Your selection</p>
              <h2>{roomType?.name || 'Select a room'}</h2>
              {roomNumber ? <p className="guest-reserve__room-no">Room {roomNumber}</p> : null}

              <ul className="guest-reserve__facts">
                <li>
                  <span>Check-in</span>
                  <strong>{formatDisplayDate(checkIn)}</strong>
                </li>
                <li>
                  <span>Check-out</span>
                  <strong>{formatDisplayDate(checkOut)}</strong>
                </li>
                <li>
                  <span>Length of stay</span>
                  <strong>
                    {nights} {nights === 1 ? 'night' : 'nights'}
                  </strong>
                </li>
                <li>
                  <span>Guests</span>
                  <strong>
                    {adults} adult{adults === 1 ? '' : 's'}
                    {children > 0 ? `, ${children} child${children === 1 ? '' : 'ren'}` : ''}
                  </strong>
                </li>
              </ul>

              <div className="guest-reserve__price-block mt-3" style={{ borderTop: '1px solid #eee', paddingTop: '15px' }}>
                <div className="d-flex justify-content-between mb-2">
                  <span>Room ({nights} {nights === 1 ? 'night' : 'nights'})</span>
                  <strong>{formatGuestMoney(roomSubtotal, currency)}</strong>
                </div>

                <AnimatePresence>
                  {upsellsTotal > 0 && (
                    <motion.div
                      className="d-flex justify-content-between mb-2"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      <span>Add-ons</span>
                      <strong>+{formatGuestMoney(upsellsTotal, currency)}</strong>
                    </motion.div>
                  )}
                </AnimatePresence>

                {promoDiscount > 0 ? (
                  <div className="d-flex justify-content-between mb-2 text-success">
                    <span>Promo</span>
                    <strong>-{formatGuestMoney(promoDiscount, currency)}</strong>
                  </div>
                ) : null}

                {creditsApplied > 0 ? (
                  <div className="d-flex justify-content-between mb-2 text-success">
                    <span>Credits</span>
                    <strong>-{formatGuestMoney(creditsApplied, currency)}</strong>
                  </div>
                ) : null}

                <div
                  className="d-flex justify-content-between mt-2 pt-2"
                  style={{ fontSize: '1.15rem', borderTop: '1px solid #eee' }}
                >
                  <span>Total</span>
                  <strong>{formatGuestMoney(dueNow, currency)}</strong>
                </div>
              </div>

              {quote && !quote.ok ? (
                <p className="guest-reserve__alert mt-3">{quote.message || 'Not available for these dates.'}</p>
              ) : (
                <p className="guest-reserve__note mt-3">
                  {paymentChoice === 'online'
                    ? 'Pay online after confirm · Instant confirmation code'
                    : 'Reserve now · Pay at hotel on arrival'}
                </p>
              )}
            </div>
          </aside>
        </motion.div>

        <motion.form
          onSubmit={handleSubmit}
          className="guest-reserve__form"
          initial="initial"
          animate="animate"
          variants={stagger}
        >
          {/* Step 1 */}
          <motion.section className="guest-reserve__section" variants={fadeInUp} viewport={viewport}>
            <header>
              <span>01</span>
              <div>
                <h3>Stay details</h3>
                <p>Choose dates and how many guests will stay.</p>
              </div>
            </header>

            <div className="guest-reserve__grid">
              <label className="guest-reserve__field">
                <span>Check-in</span>
                <input
                  type="date"
                  value={checkIn}
                  onChange={(e) => setCheckIn(e.target.value)}
                  required
                />
              </label>
              <label className="guest-reserve__field">
                <span>Check-out</span>
                <input
                  type="date"
                  value={checkOut}
                  onChange={(e) => setCheckOut(e.target.value)}
                  required
                />
              </label>
            </div>

            <div className="guest-reserve__guests">
              <div className="guest-reserve__counter">
                <div className="guest-reserve__counter-meta">
                  <strong>Adults</strong>
                  <span>Ages 13+</span>
                </div>
                <div className="guest-reserve__counter-controls">
                  <motion.button
                    type="button"
                    aria-label="Fewer adults"
                    onClick={() => setAdults(Math.max(1, adults - 1))}
                    whileTap={{ scale: 0.8 }}
                  >
                    −
                  </motion.button>
                  <span className="guest-reserve__counter-value">{adults}</span>
                  <motion.button
                    type="button"
                    aria-label="More adults"
                    onClick={() => setAdults(adults + 1)}
                    whileTap={{ scale: 0.8 }}
                  >
                    +
                  </motion.button>
                </div>
              </div>
              <div className="guest-reserve__counter">
                <div className="guest-reserve__counter-meta">
                  <strong>Children</strong>
                  <span>Ages 0-12</span>
                </div>
                <div className="guest-reserve__counter-controls">
                  <motion.button
                    type="button"
                    aria-label="Fewer children"
                    onClick={() => setChildren(Math.max(0, children - 1))}
                    whileTap={{ scale: 0.8 }}
                  >
                    −
                  </motion.button>
                  <span className="guest-reserve__counter-value">{children}</span>
                  <motion.button
                    type="button"
                    aria-label="More children"
                    onClick={() => setChildren(children + 1)}
                    whileTap={{ scale: 0.8 }}
                  >
                    +
                  </motion.button>
                </div>
              </div>
            </div>
          </motion.section>

          {/* Premium Upsells Segment */}
          <motion.section className="guest-reserve__section" variants={fadeInUp} viewport={viewport}>
            <header>
              <span>02</span>
              <div>
                <h3>Customize stay &amp; Upsells</h3>
                <p>Enhance your check-in with these premium addons.</p>
              </div>
            </header>
            
            <div className="d-flex flex-column gap-3 mt-3">
              {[
                {
                  id: 'breakfast',
                  checked: breakfast,
                  setter: setBreakfast,
                  title: 'Breakfast Buffet Addon',
                  desc: 'Add fresh English & Local Breakfast Buffet. GHS 30.00 / guest / night.',
                },
                {
                  id: 'lateCheckout',
                  checked: lateCheckout,
                  setter: setLateCheckout,
                  title: 'Late Check-out option',
                  desc: 'Keep access to your room until 4:00 PM on departure day. GHS 50.00 one-off.',
                },
                {
                  id: 'spa',
                  checked: spa,
                  setter: setSpa,
                  title: 'Spa Access deposit',
                  desc: 'Gain reservation slots for Sauna & Spa therapy session. GHS 100.00.',
                },
              ].map(({ id, checked, setter, title, desc }) => (
                <motion.div
                  key={id}
                  className="guest-panel p-3 d-flex align-items-center justify-content-between border rounded"
                  style={{
                    borderColor: checked ? '#cb8670' : '#ddd',
                    backgroundColor: checked ? '#fff7f5' : '#fff',
                    transition: 'border-color 0.25s, background-color 0.25s',
                  }}
                  whileHover={{ scale: 1.01, y: -2 }}
                  transition={{ duration: 0.2 }}
                >
                  <div>
                    <h6 className="mb-1" style={{ fontSize: '0.95rem', fontWeight: 600 }}>{title}</h6>
                    <p className="text-muted mb-0 small">{desc}</p>
                  </div>
                  <div className="form-check form-switch">
                    <input
                      type="checkbox"
                      className="form-check-input"
                      role="switch"
                      checked={checked}
                      onChange={(e) => setter(e.target.checked)}
                      style={{ transform: 'scale(1.3)', cursor: 'pointer' }}
                    />
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.section>

          <motion.section className="guest-reserve__section" variants={fadeInUp} viewport={viewport}>
            <header>
              <span>02b</span>
              <div>
                <h3>Promo &amp; credits</h3>
                <p>Apply a promo code or loyalty credits to your booking.</p>
              </div>
            </header>
            <div className="guest-reserve__grid">
              <label className="guest-reserve__field guest-reserve__field--full">
                <span>Promo code</span>
                <input
                  value={promoCode}
                  onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                  placeholder="Optional"
                />
              </label>
            </div>
            {accountCredits > 0 ? (
              <div className="form-check mt-2">
                <input
                  type="checkbox"
                  className="form-check-input"
                  id="use-credits"
                  checked={useCredits}
                  onChange={(e) => setUseCredits(e.target.checked)}
                />
                <label className="form-check-label" htmlFor="use-credits">
                  Apply loyalty credits ({formatGuestMoney(accountCredits, currency)} available)
                </label>
              </div>
            ) : null}
          </motion.section>

          {/* Step 3 — guest details (was 03) */}
          <motion.section className="guest-reserve__section" variants={fadeInUp} viewport={viewport}>
            <header>
              <span>03</span>
              <div>
                <h3>Guest details</h3>
                <p>Verify details retrieved from your profile.</p>
              </div>
            </header>

            <div className="guest-reserve__grid">
              <label className="guest-reserve__field">
                <span>First name</span>
                <input
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="Ada"
                  required
                  autoComplete="given-name"
                />
              </label>
              <label className="guest-reserve__field">
                <span>Last name</span>
                <input
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Mensah"
                  required
                  autoComplete="family-name"
                />
              </label>
              <label className="guest-reserve__field guest-reserve__field--full">
                <span>Email</span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@email.com"
                  required
                  autoComplete="email"
                  disabled
                />
              </label>
              <label className="guest-reserve__field guest-reserve__field--full">
                <span>Phone</span>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Optional"
                  autoComplete="tel"
                />
              </label>
            </div>
          </motion.section>

          <motion.section className="guest-reserve__section" variants={fadeInUp} viewport={viewport}>
            <header>
              <span>04</span>
              <div>
                <h3>Payment</h3>
                <p>Choose how you want to pay. Your room is reserved either way.</p>
              </div>
            </header>
            <div className="guest-reserve__pay-options" role="radiogroup" aria-label="Payment method">
              <label
                className={`guest-reserve__pay-option${paymentChoice === 'hotel' ? ' is-active' : ''}`}
              >
                <input
                  type="radio"
                  name="booking-payment"
                  checked={paymentChoice === 'hotel'}
                  onChange={() => setPaymentChoice('hotel')}
                />
                <span>
                  <strong>Pay at hotel</strong>
                  <span>Confirm now and settle at front desk on arrival.</span>
                </span>
              </label>
              <label
                className={`guest-reserve__pay-option${paymentChoice === 'online' ? ' is-active' : ''}`}
              >
                <input
                  type="radio"
                  name="booking-payment"
                  checked={paymentChoice === 'online'}
                  onChange={() => setPaymentChoice('online')}
                />
                <span>
                  <strong>Pay online now</strong>
                  <span>Card or mobile money via Paystack after you confirm.</span>
                </span>
              </label>
            </div>
          </motion.section>

          {/* Checkout Area */}
          <motion.div className="guest-reserve__checkout" variants={fadeInUp}>
            <div>
              <span>Total</span>
              <strong>{formatGuestMoney(dueNow, currency)}</strong>
            </div>
            <motion.button
              type="submit"
              disabled={saving || !canBook}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
            >
              {saving
                ? 'Confirming…'
                : paymentChoice === 'online'
                  ? 'Confirm & pay online'
                  : 'Confirm — pay at hotel'}
            </motion.button>
          </motion.div>
        </motion.form>
      </div>
    </motion.div>
  );
}
