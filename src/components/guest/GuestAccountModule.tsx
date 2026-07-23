'use client';

import { FormEvent, useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { fetchApi } from '@/lib/client/fetch-api';
import { formatGuestMoney } from '@/lib/guest/format-money';
import GuestPageHero from '@/components/guest/GuestPageHero';

const fadeInUp = {
  initial: { opacity: 0, y: 28 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.55, ease: 'easeOut' as const } },
};
const stagger = { animate: { transition: { staggerChildren: 0.1 } } };

export default function GuestAccountModule({ slug }: { slug: string }) {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [currency, setCurrency] = useState('GHS');

  const [mode, setMode] = useState<'login' | 'register' | 'otp'>('login');

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [preferredNotes, setPreferredNotes] = useState('');
  const [credits, setCredits] = useState(0);

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [messageOk, setMessageOk] = useState(false);

  const loadProfile = useCallback(async () => {
    setLoading(true);
    try {
      const [profileRes, hotelRes] = await Promise.all([
        fetchApi<{
          first_name: string;
          last_name: string;
          email: string;
          phone: string;
          account_credits: number;
          preferred_room_notes: string;
        }>(`/api/public/${slug}/profile`),
        fetchApi<{ currency: string }>(`/api/public/${slug}`),
      ]);

      if (hotelRes.success && hotelRes.data) setCurrency(hotelRes.data.currency);

      if (profileRes.success && profileRes.data) {
        setAuthenticated(true);
        setFirstName(profileRes.data.first_name || '');
        setLastName(profileRes.data.last_name || '');
        setEmail(profileRes.data.email || '');
        setPhone(profileRes.data.phone || '');
        setPreferredNotes(profileRes.data.preferred_room_notes || '');
        setCredits(profileRes.data.account_credits || 0);
      } else {
        setAuthenticated(false);
      }
    } catch {
      setAuthenticated(false);
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  function goAfterAuth() {
    const nextParam = new URLSearchParams(window.location.search).get('next');
    if (nextParam) {
      router.push(nextParam);
    } else {
      router.push(`/${slug}/trips`);
    }
    router.refresh();
  }

  async function handleAuthSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage('');
    setMessageOk(false);
    try {
      const res = await fetchApi<{ email: string; name: string; requires_otp?: boolean }>(
        `/api/public/${slug}/auth`,
        {
          method: 'POST',
          body: JSON.stringify({
            action: mode === 'otp' ? 'verify_otp' : mode,
            first_name: firstName,
            last_name: lastName,
            email,
            phone,
            password,
            otp,
          }),
        }
      );
      if (!res.success) {
        setMessage(res.message || 'Failed');
        return;
      }

      if (res.data?.requires_otp) {
        setMode('otp');
        setMessage(res.message || 'Enter the verification code sent to your email.');
        setMessageOk(true);
        setOtp('');
        return;
      }

      goAfterAuth();
    } finally {
      setSaving(false);
    }
  }

  async function handleResendOtp() {
    setSaving(true);
    setMessage('');
    setMessageOk(false);
    try {
      const res = await fetchApi(`/api/public/${slug}/auth`, {
        method: 'POST',
        body: JSON.stringify({ action: 'resend_otp', email }),
      });
      setMessage(res.message || (res.success ? 'Code resent.' : 'Could not resend code.'));
      setMessageOk(Boolean(res.success));
    } finally {
      setSaving(false);
    }
  }

  async function handleProfileUpdate(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage('');
    setMessageOk(false);
    try {
      const res = await fetchApi(`/api/public/${slug}/profile`, {
        method: 'POST',
        body: JSON.stringify({
          first_name: firstName,
          last_name: lastName,
          phone,
          preferred_room_notes: preferredNotes,
        }),
      });
      if (res.success) {
        setMessage('Profile updated successfully.');
        setMessageOk(true);
      } else {
        setMessage(res.message || 'Update failed.');
      }
    } catch {
      setMessage('Update failed.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="guest-page">
        <p className="guest-loading">Loading account...</p>
      </div>
    );
  }

  if (authenticated) {
    return (
      <>
        <GuestPageHero title="Your Profile" subtitle="Manage your personal details and preferences." />
        <motion.div className="guest-page" initial="initial" animate="animate" variants={stagger}>
        <div className="row g-4">
          <div className="col-lg-8">
            <motion.form onSubmit={handleProfileUpdate} className="guest-panel guest-auth-form" variants={fadeInUp}>
              <h5 className="mb-3">Personal Details</h5>
              <div className="guest-auth-fields">
                <div className="guest-auth-fields__row">
                  <div>
                    <label className="form-label small">First Name</label>
                    <input
                      className="form-control"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <label className="form-label small">Last Name</label>
                    <input
                      className="form-control"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      required
                    />
                  </div>
                </div>
                <div>
                  <label className="form-label small">Email (Read-only)</label>
                  <input className="form-control" value={email} disabled />
                </div>
                <div>
                  <label className="form-label small">Phone Number</label>
                  <input className="form-control" value={phone} onChange={(e) => setPhone(e.target.value)} />
                </div>
              </div>

              <h5 className="mb-3 mt-4">Loyalty & Preferences</h5>
              <div className="mb-3">
                <label className="form-label small">Preferred Room Notes / Requirements</label>
                <textarea
                  className="form-control"
                  rows={3}
                  value={preferredNotes}
                  onChange={(e) => setPreferredNotes(e.target.value)}
                  placeholder="e.g. Higher floor, near elevator, extra pillows..."
                />
                <p className="small text-muted mt-1">
                  We will try our best to accommodate these preferences during your stay.
                </p>
              </div>

              {message ? (
                <p className={messageOk ? 'text-success small' : 'text-danger small'}>{message}</p>
              ) : null}

              <motion.button
                type="submit"
                className="btn palatin-btn"
                disabled={saving}
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.96 }}
              >
                {saving ? 'Saving...' : 'Save Profile'}
              </motion.button>
            </motion.form>
          </div>
          <div className="col-lg-4">
            <motion.div
              className="guest-panel mb-4"
              style={{ backgroundColor: '#fdf7f5', borderColor: '#cb8670' }}
              variants={fadeInUp}
              whileHover={{ scale: 1.02 }}
            >
              <h5 className="mb-2" style={{ color: '#cb8670' }}>
                Loyalty Credits
              </h5>
              <motion.h2
                className="mb-1"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.4, duration: 0.5, type: 'spring', stiffness: 120 }}
              >
                {formatGuestMoney(credits, currency)}
              </motion.h2>
              <p className="small text-muted mb-0">
                Use your credits towards room upgrades or spa reservations at checkout.
              </p>
            </motion.div>

            <motion.div className="guest-panel" variants={fadeInUp}>
              <h5 className="mb-2">Quick Actions</h5>
              <div className="d-flex flex-column gap-2 mt-3">
                <motion.button
                  type="button"
                  className="btn btn-outline-secondary text-start w-100"
                  onClick={() => router.push(`/${slug}/trips`)}
                  whileHover={{ x: 4, scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                >
                  <i className="fa fa-suitcase mr-2"></i> View My Trips
                </motion.button>
                <motion.button
                  type="button"
                  className="btn btn-outline-secondary text-start w-100"
                  onClick={() => router.push(`/${slug}/orders`)}
                  whileHover={{ x: 4, scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                >
                  <i className="fa fa-cutlery mr-2"></i> My Orders
                </motion.button>
                <motion.button
                  type="button"
                  className="btn btn-outline-danger text-start w-100"
                  onClick={async () => {
                    await fetchApi(`/api/public/${slug}/auth`, {
                      method: 'POST',
                      body: JSON.stringify({ action: 'logout' }),
                    });
                    window.location.href = `/${slug}`;
                  }}
                  whileHover={{ x: 4, scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                >
                  <i className="fa fa-sign-out mr-2"></i> Sign Out
                </motion.button>
              </div>
            </motion.div>
          </div>
        </div>
      </motion.div>
      </>
    );
  }

  return (
    <>
      <GuestPageHero
        title="Account"
        subtitle={
          mode === 'otp'
            ? 'Enter the verification code we sent to your email.'
            : 'Sign in to manage trips and order history.'
        }
      />
      <motion.div className="guest-page" initial="initial" animate="animate" variants={stagger}>
      {mode !== 'otp' ? (
        <motion.div className="guest-tabs" variants={fadeInUp}>
          {(['login', 'register'] as const).map((m) => (
            <motion.button
              key={m}
              type="button"
              className={`guest-tab${mode === m ? ' active' : ''}`}
              onClick={() => {
                setMode(m);
                setMessage('');
                setMessageOk(false);
              }}
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
            >
              {m === 'login' ? 'Sign in' : 'Register'}
            </motion.button>
          ))}
        </motion.div>
      ) : null}

      <motion.form onSubmit={handleAuthSubmit} className="guest-panel guest-auth-form" variants={fadeInUp}>
        {mode === 'otp' ? (
          <div className="guest-auth-fields">
            <div>
              <label className="form-label small">Email</label>
              <input className="form-control" type="email" value={email} disabled />
            </div>
            <div>
              <label className="form-label small">Verification code</label>
              <input
                className="form-control"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="6-digit code"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                required
                minLength={6}
                maxLength={6}
              />
            </div>
          </div>
        ) : (
          <div className="guest-auth-fields">
            {mode === 'register' ? (
              <>
                <div className="guest-auth-fields__row">
                  <input
                    className="form-control"
                    placeholder="First name"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    required
                  />
                  <input
                    className="form-control"
                    placeholder="Last name"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    required
                  />
                </div>
                <input
                  className="form-control"
                  placeholder="Phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </>
            ) : null}
            <input
              type="email"
              className="form-control"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <input
              type="password"
              className="form-control"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
            />
          </div>
        )}

        {message ? (
          <p className={messageOk ? 'text-success small guest-auth-form__msg' : 'text-danger small guest-auth-form__msg'}>
            {message}
          </p>
        ) : null}

        <motion.button
          type="submit"
          className="btn palatin-btn guest-btn--block"
          disabled={saving}
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.96 }}
        >
          {saving
            ? 'Please wait…'
            : mode === 'login'
              ? 'Sign in'
              : mode === 'otp'
                ? 'Verify & continue'
                : 'Create account'}
        </motion.button>

        {mode === 'otp' ? (
          <div className="guest-auth-form__otp-actions">
            <button type="button" className="btn btn-link p-0" disabled={saving} onClick={() => void handleResendOtp()}>
              Resend code
            </button>
            <button
              type="button"
              className="btn btn-link p-0"
              disabled={saving}
              onClick={() => {
                setMode('login');
                setOtp('');
                setMessage('');
              }}
            >
              Back to sign in
            </button>
          </div>
        ) : null}
      </motion.form>
    </motion.div>
    </>
  );
}
