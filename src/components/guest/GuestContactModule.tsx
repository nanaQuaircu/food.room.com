'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { fetchApi } from '@/lib/client/fetch-api';
import GuestPageHero from '@/components/guest/GuestPageHero';

type HotelProfile = {
  name: string;
  address: string | null;
  phone?: string | null;
  email?: string | null;
};

const fadeInUp = {
  initial: { opacity: 0, y: 24 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.5, ease: 'easeOut' as const } },
};

export default function GuestContactModule({ slug }: { slug: string }) {
  const [profile, setProfile] = useState<HotelProfile | null>(null);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [details, setDetails] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetchApi<HotelProfile>(`/api/public/${slug}`);
    if (res.success && res.data) setProfile(res.data);
  }, [slug]);

  useEffect(() => {
    void load();
  }, [load]);

  const hotelName = profile?.name || 'Hotel';
  const hotelPhone = profile?.phone?.trim() || '';
  const mail = profile?.email?.trim() || '';
  const address = profile?.address?.trim() || '';

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSent(false);
    try {
      const name = `${firstName.trim()} ${lastName.trim()}`.trim();
      const message = phone.trim()
        ? `Phone: ${phone.trim()}\n\n${details.trim()}`
        : details.trim();
      const res = await fetchApi(`/api/public/${slug}/contact`, {
        method: 'POST',
        body: JSON.stringify({
          name,
          email: email.trim(),
          subject: 'Website inquiry',
          message,
        }),
      });
      if (res.success) {
        setSent(true);
        setFirstName('');
        setLastName('');
        setEmail('');
        setPhone('');
        setDetails('');
      } else {
        setError(res.message || 'Could not send message.');
      }
    } catch {
      setError('Could not send message.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <style>{`
        .gc2 {
          --gc-accent: #cb8670;
          --gc-accent-dark: #b56f5a;
          --gc-ink: #111111;
          --gc-muted: #6b6560;
          --gc-line: #e5e2dc;
          --gc-soft: #f5f4f1;
          background: var(--gc-soft);
          color: var(--gc-ink);
          font-family: 'FuturaLT-Book', 'Segoe UI', sans-serif;
          padding: 3.5rem 0 5rem;
        }
        .gc2-inner {
          width: min(1100px, calc(100% - 2rem));
          margin: 0 auto;
        }
        .gc2-intro {
          text-align: center;
          max-width: 40rem;
          margin: 0 auto 2.75rem;
        }
        .gc2-intro h2 {
          margin: 0 0 0.75rem;
          font-size: clamp(1.85rem, 3.2vw, 2.6rem);
          font-weight: 700;
          letter-spacing: -0.02em;
          line-height: 1.15;
        }
        .gc2-intro p {
          margin: 0;
          color: var(--gc-muted);
          font-size: 1.02rem;
          line-height: 1.65;
        }
        .gc2-grid {
          display: grid;
          grid-template-columns: minmax(0, 1.15fr) minmax(0, 0.85fr);
          gap: 2.5rem;
          align-items: start;
        }
        .gc2-form-card h3 {
          margin: 0 0 1.35rem;
          font-size: 1.2rem;
          font-weight: 700;
        }
        .gc2-form {
          display: grid;
          gap: 0.95rem;
        }
        .gc2-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 0.95rem;
        }
        .gc2-field input,
        .gc2-field textarea {
          width: 100%;
          border: 1px solid #d8d4cd;
          background: #fff;
          color: var(--gc-ink);
          padding: 0.9rem 1rem;
          font-size: 0.98rem;
          font-family: inherit;
          border-radius: 0;
          transition: border-color 0.2s ease, box-shadow 0.2s ease;
        }
        .gc2-field input:focus,
        .gc2-field textarea:focus {
          outline: none;
          border-color: var(--gc-accent);
          box-shadow: 0 0 0 3px rgba(203, 134, 112, 0.18);
        }
        .gc2-field textarea {
          min-height: 9rem;
          resize: vertical;
        }
        .gc2-submit {
          width: 100%;
          min-height: 3.1rem;
          border: 0;
          background: var(--gc-accent);
          color: #111;
          font-size: 0.95rem;
          font-weight: 700;
          letter-spacing: 0.02em;
          cursor: pointer;
          transition: background 0.2s ease, transform 0.15s ease;
        }
        .gc2-submit:hover:not(:disabled) { background: var(--gc-accent-dark); color: #fff; }
        .gc2-submit:disabled { opacity: 0.7; cursor: wait; }
        .gc2-note {
          margin: 0.85rem 0 0;
          text-align: center;
          font-size: 0.88rem;
          color: var(--gc-muted);
        }
        .gc2-feedback--ok { color: var(--gc-accent-dark); font-weight: 600; }
        .gc2-feedback--err { color: #b91c1c; margin: 0.5rem 0 0; font-size: 0.9rem; }
        .gc2-aside {
          display: grid;
          gap: 0;
        }
        .gc2-item {
          display: grid;
          grid-template-columns: 2.25rem 1fr;
          gap: 0.85rem;
          padding: 1.25rem 0;
          border-bottom: 1px solid var(--gc-line);
        }
        .gc2-item:first-child { padding-top: 0.15rem; }
        .gc2-item:last-child { border-bottom: 0; }
        .gc2-item__icon {
          width: 2.25rem;
          height: 2.25rem;
          display: grid;
          place-items: center;
          color: var(--gc-ink);
        }
        .gc2-item__icon svg { width: 1.35rem; height: 1.35rem; }
        .gc2-item h4 {
          margin: 0 0 0.35rem;
          font-size: 1rem;
          font-weight: 700;
        }
        .gc2-item p {
          margin: 0;
          color: var(--gc-muted);
          font-size: 0.92rem;
          line-height: 1.55;
        }
        .gc2-item a {
          color: var(--gc-ink);
          font-weight: 600;
          text-decoration: none;
          border-bottom: 1px solid transparent;
        }
        .gc2-item a:hover {
          color: var(--gc-accent-dark);
          border-bottom-color: var(--gc-accent);
        }
        .gc2-item__link {
          display: inline-flex;
          margin-top: 0.45rem;
          font-size: 0.9rem;
          font-weight: 600;
          color: var(--gc-ink);
          text-decoration: none;
        }
        .gc2-item__link:hover { color: var(--gc-accent-dark); }
        @media (max-width: 900px) {
          .gc2-grid { grid-template-columns: 1fr; gap: 2rem; }
          .gc2-row { grid-template-columns: 1fr; }
          .gc2 { padding-top: 2.5rem; }
        }
      `}</style>

      <GuestPageHero
        title="Contact us"
        subtitle={`Have questions or want to discuss a stay? Reach out to ${hotelName}.`}
      />

      <div className="gc2">
        <div className="gc2-inner">
          <motion.div className="gc2-intro" initial="initial" animate="animate" variants={fadeInUp}>
            <h2>Contact us</h2>
            <p>
              Have questions or want to discuss a reservation, dining, or a special request? Reach
              out, and we will help craft the perfect stay.
            </p>
          </motion.div>

          <div className="gc2-grid">
            <motion.div className="gc2-form-card" initial="initial" animate="animate" variants={fadeInUp}>
              <h3>Fill in the form below</h3>
              <AnimatePresence mode="wait">
                {sent ? (
                  <motion.div
                    key="ok"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                  >
                    <p className="gc2-feedback--ok mb-3">
                      Thanks — we received your message and will get back to you soon.
                    </p>
                    <button type="button" className="gc2-submit" onClick={() => setSent(false)}>
                      Send another message
                    </button>
                  </motion.div>
                ) : (
                  <motion.form
                    key="form"
                    className="gc2-form"
                    onSubmit={handleSubmit}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    <div className="gc2-row">
                      <label className="gc2-field">
                        <span className="visually-hidden">First Name</span>
                        <input
                          type="text"
                          value={firstName}
                          onChange={(e) => setFirstName(e.target.value)}
                          placeholder="First Name"
                          autoComplete="given-name"
                          required
                        />
                      </label>
                      <label className="gc2-field">
                        <span className="visually-hidden">Last Name</span>
                        <input
                          type="text"
                          value={lastName}
                          onChange={(e) => setLastName(e.target.value)}
                          placeholder="Last Name"
                          autoComplete="family-name"
                          required
                        />
                      </label>
                    </div>
                    <label className="gc2-field">
                      <span className="visually-hidden">Email</span>
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="Email"
                        autoComplete="email"
                        required
                      />
                    </label>
                    <label className="gc2-field">
                      <span className="visually-hidden">Phone Number</span>
                      <input
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="Phone Number"
                        autoComplete="tel"
                      />
                    </label>
                    <label className="gc2-field">
                      <span className="visually-hidden">Details</span>
                      <textarea
                        value={details}
                        onChange={(e) => setDetails(e.target.value)}
                        placeholder="Details"
                        required
                      />
                    </label>
                    <button type="submit" className="gc2-submit" disabled={busy}>
                      {busy ? 'Sending…' : 'Send Message'}
                    </button>
                    {error ? <p className="gc2-feedback--err">{error}</p> : null}
                    <p className="gc2-note">We&apos;ll get back to you in 1–2 business days.</p>
                  </motion.form>
                )}
              </AnimatePresence>
            </motion.div>

            <motion.aside className="gc2-aside" initial="initial" animate="animate" variants={fadeInUp}>
              <div className="gc2-item">
                <div className="gc2-item__icon" aria-hidden>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <circle cx="12" cy="12" r="9" />
                    <path d="M9.5 9.5a2.5 2.5 0 1 1 3.6 2.2c-.7.4-1.1.9-1.1 1.8V14" strokeLinecap="round" />
                    <circle cx="12" cy="17" r="0.8" fill="currentColor" stroke="none" />
                  </svg>
                </div>
                <div>
                  <h4>Rooms & rates</h4>
                  <p>Browse available rooms and nightly rates before you book.</p>
                  <Link href={`/${slug}/rooms`} className="gc2-item__link">
                    Visit rooms →
                  </Link>
                </div>
              </div>

              <div className="gc2-item">
                <div className="gc2-item__icon" aria-hidden>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M4 6h16v12H4z" />
                    <path d="M4 9h16M9 6v12" strokeLinecap="round" />
                  </svg>
                </div>
                <div>
                  <h4>Booking lookup</h4>
                  <p>Already booked? Look up your confirmation on Trips.</p>
                  <Link href={`/${slug}/trips`} className="gc2-item__link">
                    Look up booking →
                  </Link>
                </div>
              </div>

              <div className="gc2-item">
                <div className="gc2-item__icon" aria-hidden>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M12 21s7-5.4 7-11a7 7 0 1 0-14 0c0 5.6 7 11 7 11z" />
                    <circle cx="12" cy="10" r="2.2" />
                  </svg>
                </div>
                <div>
                  <h4>Visit our hotel</h4>
                  <p>{address || 'Address available on request at the front desk.'}</p>
                </div>
              </div>

              <div className="gc2-item">
                <div className="gc2-item__icon" aria-hidden>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M4 6h16v12H4z" />
                    <path d="m4 7 8 6 8-6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <div>
                  <h4>Contact us by email</h4>
                  <p>
                    Prefer the written word? Drop us an email at{' '}
                    {mail ? <a href={`mailto:${mail}`}>{mail}</a> : 'the front desk email'}
                    {hotelPhone ? (
                      <>
                        {' '}
                        or call{' '}
                        <a href={`tel:${hotelPhone.replace(/\s+/g, '')}`}>{hotelPhone}</a>
                      </>
                    ) : null}
                    .
                  </p>
                </div>
              </div>
            </motion.aside>
          </div>
        </div>
      </div>
    </>
  );
}
