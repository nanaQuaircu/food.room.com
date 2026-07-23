'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { fetchApi } from '@/lib/client/fetch-api';
import { formatGuestMoney } from '@/lib/guest/format-money';
import { formatDisplayDate, toIsoDateKey } from '@/lib/dates/format-display-date';
import GuestPageHero from '@/components/guest/GuestPageHero';

const fadeInUp = {
  initial: { opacity: 0, y: 24 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.45, ease: 'easeOut' as const } },
};
const stagger = { animate: { transition: { staggerChildren: 0.08 } } };

const INITIAL_VISIBLE = 5;

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: 'Pending', color: '#b45309', bg: '#fffbeb' },
  confirmed: { label: 'Confirmed', color: '#9a3412', bg: '#fff7ed' },
  checked_in: { label: 'Checked in', color: '#1d4ed8', bg: '#eff6ff' },
  checked_out: { label: 'Checked out', color: '#475569', bg: '#f1f5f9' },
  cancelled: { label: 'Cancelled', color: '#b91c1c', bg: '#fef2f2' },
  no_show: { label: 'No show', color: '#7f1d1d', bg: '#fef2f2' },
};

type Trip = {
  id: number;
  confirmation_code: string;
  status: string;
  check_in_date: string;
  check_out_date: string;
  total_amount: number;
  room_type_id: number | null;
  room_type_name: string | null;
  room_number?: string | null;
};

type LookupBooking = {
  id: number;
  confirmation_code: string;
  status: string;
  check_in_date: string;
  check_out_date: string;
  total_amount: number;
  room_type_id: number | null;
  room_type_name: string | null;
  room_number: string | null;
  guest_first_name: string;
  guest_last_name: string;
};

function dateInputValue(value: string) {
  return toIsoDateKey(value) || value.slice(0, 10);
}

export default function GuestTripsModule({ slug }: { slug: string }) {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [authRequired, setAuthRequired] = useState(false);
  const [lookupCode, setLookupCode] = useState('');
  const [lookup, setLookup] = useState<LookupBooking | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [lookupBusy, setLookupBusy] = useState(false);
  const [currency, setCurrency] = useState('GHS');
  const [showAllTrips, setShowAllTrips] = useState(false);

  const visibleTrips = showAllTrips ? trips : trips.slice(0, INITIAL_VISIBLE);
  const hasMoreTrips = trips.length > INITIAL_VISIBLE;

  const load = useCallback(async () => {
    setLoading(true);
    const [tripsRes, profileRes] = await Promise.all([
      fetchApi<Trip[]>(`/api/public/${slug}/trips`, { skipCache: true }),
      fetchApi<{ currency: string }>(`/api/public/${slug}`),
    ]);
    if (profileRes.success && profileRes.data?.currency) setCurrency(profileRes.data.currency);

    if (!tripsRes.success && tripsRes.message?.toLowerCase().includes('sign in')) {
      setAuthRequired(true);
      setTrips([]);
    } else if (tripsRes.success && tripsRes.data) {
      setTrips(tripsRes.data);
      setAuthRequired(false);
    }
    setLoading(false);
  }, [slug]);

  useEffect(() => {
    void load();
    try {
      const saved = sessionStorage.getItem(`guest-last-booking:${slug}`);
      if (saved) setLookupCode(saved);
    } catch {
      /* ignore */
    }
  }, [load, slug]);

  async function handleLookup(e: FormEvent) {
    e.preventDefault();
    const code = lookupCode.trim();
    if (!code) return;
    setLookupBusy(true);
    setLookupError(null);
    setLookup(null);
    try {
      const res = await fetchApi<LookupBooking>(
        `/api/public/${slug}/bookings?code=${encodeURIComponent(code)}`,
        { skipCache: true }
      );
      if (res.success && res.data) {
        setLookup(res.data);
        try {
          sessionStorage.setItem(`guest-last-booking:${slug}`, code);
        } catch {
          /* ignore */
        }
      } else {
        setLookupError(res.message || 'No booking found for that code.');
      }
    } catch {
      setLookupError('Could not look up that booking.');
    } finally {
      setLookupBusy(false);
    }
  }

  function TripCard({ trip }: { trip: Trip | LookupBooking }) {
    const [action, setAction] = useState<'none' | 'checkin' | 'modify' | 'review' | 'cancel'>('none');
    const [busy, setBusy] = useState(false);

    const [arrivalTime, setArrivalTime] = useState('14:00');
    const [file, setFile] = useState<File | null>(null);

    const [modCheckIn, setModCheckIn] = useState(dateInputValue(trip.check_in_date));
    const [modCheckOut, setModCheckOut] = useState(dateInputValue(trip.check_out_date));

    const [rating, setRating] = useState(5);
    const [comment, setComment] = useState('');

    const [cancelPreview, setCancelPreview] = useState<{
      refundable: number;
      penalty: number;
      policy_label: string;
    } | null>(null);
    const [message, setMessage] = useState('');

    const roomTypeId =
      'room_type_id' in trip && trip.room_type_id ? Number(trip.room_type_id) : 0;
    const meta = STATUS_META[trip.status] || {
      label: trip.status.replace(/_/g, ' '),
      color: '#475569',
      bg: '#f1f5f9',
    };
    const roomLine = [
      trip.room_type_name || 'Stay',
      'room_number' in trip && trip.room_number ? `Room ${trip.room_number}` : null,
    ]
      .filter(Boolean)
      .join(' · ');

    async function openCancelPreview() {
      setBusy(true);
      setMessage('');
      const res = await fetchApi<{ refundable: number; penalty: number; policy_label: string }>(
        `/api/public/${slug}/bookings`,
        {
          method: 'PATCH',
          body: JSON.stringify({ action: 'cancel_preview', reservation_id: trip.id }),
        }
      );
      setBusy(false);
      if (res.success && res.data) {
        setCancelPreview(res.data);
        setAction('cancel');
      } else {
        setMessage(res.message || 'Could not load cancellation policy.');
      }
    }

    async function handleCancel() {
      setBusy(true);
      setMessage('');
      try {
        const res = await fetchApi(`/api/public/${slug}/bookings?reservation_id=${trip.id}`, {
          method: 'DELETE',
        });
        if (res.success) {
          setMessage('Booking cancelled.');
          setAction('none');
          setTimeout(() => window.location.reload(), 1200);
        } else {
          setMessage(res.message || 'Cancellation failed.');
        }
      } catch {
        setMessage('Cancellation failed.');
      } finally {
        setBusy(false);
      }
    }

    async function handleCheckin(e: FormEvent) {
      e.preventDefault();
      if (!file) {
        setMessage('Please upload your ID document.');
        return;
      }
      setBusy(true);
      setMessage('');
      try {
        let idUrl = '';
        const fd = new FormData();
        fd.append('file', file);
        const uploadRes = await fetchApi<{ url: string }>(`/api/public/${slug}/upload`, {
          method: 'POST',
          body: fd,
          headers: {},
        });
        if (uploadRes.success && uploadRes.data) {
          idUrl = uploadRes.data.url;
        } else {
          setMessage(uploadRes.message || 'ID upload failed.');
          setBusy(false);
          return;
        }

        const res = await fetchApi(`/api/public/${slug}/bookings`, {
          method: 'PUT',
          body: JSON.stringify({
            reservation_id: trip.id,
            arrival_time: arrivalTime,
            id_document_url: idUrl,
          }),
        });

        if (res.success) {
          setMessage(
            'Digital check-in pre-arrival complete! We will notify you when your room is ready.'
          );
          setAction('none');
        } else {
          setMessage(res.message || 'Check-in failed');
        }
      } catch {
        setMessage('Check-in failed');
      } finally {
        setBusy(false);
      }
    }

    async function handleModify(e: FormEvent) {
      e.preventDefault();
      setBusy(true);
      setMessage('');
      try {
        const res = await fetchApi(`/api/public/${slug}/bookings`, {
          method: 'PATCH',
          body: JSON.stringify({
            reservation_id: trip.id,
            check_in_date: modCheckIn,
            check_out_date: modCheckOut,
            room_type_id: roomTypeId,
          }),
        });
        if (res.success) {
          setMessage('Modification successful! Refreshing...');
          setTimeout(() => window.location.reload(), 1500);
        } else {
          setMessage(res.message || 'Modification failed.');
        }
      } catch {
        setMessage('Modification failed.');
      } finally {
        setBusy(false);
      }
    }

    async function handleReview(e: FormEvent) {
      e.preventDefault();
      setBusy(true);
      setMessage('');
      try {
        const res = await fetchApi(`/api/public/${slug}/reviews`, {
          method: 'POST',
          body: JSON.stringify({
            reservation_id: trip.id,
            room_type_id: roomTypeId,
            rating,
            comment,
          }),
        });
        if (res.success) {
          setMessage('Review submitted. Thank you for your feedback!');
          setAction('none');
        } else {
          setMessage(res.message || 'Review submission failed.');
        }
      } catch {
        setMessage('Review submission failed.');
      } finally {
        setBusy(false);
      }
    }

    return (
      <motion.article
        className="guest-panel guest-trip-card"
        variants={fadeInUp}
        style={{ padding: '1.15rem 1.25rem', overflow: 'hidden' }}
      >
        <div className="d-flex flex-wrap justify-content-between gap-2 align-items-start mb-2">
          <div>
            <div className="d-flex flex-wrap align-items-center gap-2 mb-1">
              <strong style={{ fontSize: '1.05rem', letterSpacing: '0.04em' }}>
                {trip.confirmation_code}
              </strong>
              <span
                style={{
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  color: meta.color,
                  background: meta.bg,
                  borderRadius: 999,
                  padding: '0.2rem 0.65rem',
                }}
              >
                {meta.label}
              </span>
            </div>
            <p className="mb-1" style={{ fontSize: '0.95rem', fontWeight: 600, color: '#222' }}>
              {roomLine}
            </p>
            <p className="mb-0 guest-muted" style={{ fontSize: '0.85rem' }}>
              {formatDisplayDate(trip.check_in_date)} → {formatDisplayDate(trip.check_out_date)}
            </p>
          </div>
          <div className="text-end">
            <div style={{ fontWeight: 700, fontSize: '1.1rem', color: '#cb8670' }}>
              {formatGuestMoney(Number(trip.total_amount), currency)}
            </div>
          </div>
        </div>

        <div className="d-flex flex-wrap gap-2">
          {trip.status === 'confirmed' || trip.status === 'pending' ? (
            <>
              <button
                type="button"
                className="btn btn-sm"
                style={{
                  background: action === 'checkin' ? '#fff' : '#1e1714',
                  color: action === 'checkin' ? '#1e1714' : '#fff',
                  border: '1px solid #1e1714',
                  borderRadius: 8,
                  fontWeight: 600,
                }}
                onClick={() => setAction(action === 'checkin' ? 'none' : 'checkin')}
              >
                Digital check-in
              </button>
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary"
                style={{ borderRadius: 8, fontWeight: 600 }}
                onClick={() => setAction(action === 'modify' ? 'none' : 'modify')}
              >
                Modify dates
              </button>
              <button
                type="button"
                className="btn btn-sm btn-outline-danger"
                style={{ borderRadius: 8, fontWeight: 600 }}
                onClick={() => void openCancelPreview()}
              >
                Cancel booking
              </button>
            </>
          ) : null}
          {trip.status === 'checked_out' ? (
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary"
              style={{ borderRadius: 8, fontWeight: 600 }}
              onClick={() => setAction(action === 'review' ? 'none' : 'review')}
            >
              Leave feedback
            </button>
          ) : null}
        </div>

        {message && action === 'none' ? (
          <p className="text-success small mt-2 mb-0">{message}</p>
        ) : null}

        <AnimatePresence>
          {action === 'checkin' && (
            <motion.div
              key="checkin"
              className="mt-3 p-3 bg-light rounded border"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3 }}
              style={{ overflow: 'hidden' }}
            >
              <h6 className="mb-2">Digital check-in &amp; arrival</h6>
              <p className="small text-muted mb-3">
                Upload your ID document beforehand to skip the front desk queue.
              </p>
              <form onSubmit={handleCheckin}>
                <div className="mb-2">
                  <label className="form-label small">Estimated arrival time</label>
                  <input
                    type="time"
                    className="form-control form-control-sm"
                    value={arrivalTime}
                    onChange={(e) => setArrivalTime(e.target.value)}
                    required
                  />
                </div>
                <div className="mb-3">
                  <label className="form-label small">
                    ID document (passport / driver&apos;s license)
                  </label>
                  <input
                    type="file"
                    className="form-control form-control-sm"
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                    accept="image/*,.pdf"
                    required
                  />
                </div>
                <div className="d-flex gap-2">
                  <button type="submit" className="btn palatin-btn btn-sm" disabled={busy}>
                    {busy ? 'Saving…' : 'Submit'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-link btn-sm text-muted"
                    onClick={() => setAction('none')}
                  >
                    Cancel
                  </button>
                </div>
                {message ? <p className="text-danger small mt-2 mb-0">{message}</p> : null}
              </form>
            </motion.div>
          )}
          {action === 'modify' && (
            <motion.div
              key="modify"
              className="mt-3 p-3 bg-light rounded border"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3 }}
              style={{ overflow: 'hidden' }}
            >
              <h6 className="mb-2">Modify booking dates</h6>
              <p className="small text-muted mb-3">
                Changes are subject to availability and rate differences.
              </p>
              <form onSubmit={handleModify}>
                <div className="row g-2 mb-3">
                  <div className="col-6">
                    <label className="form-label small">Check-in</label>
                    <input
                      type="date"
                      className="form-control form-control-sm"
                      value={modCheckIn}
                      onChange={(e) => setModCheckIn(e.target.value)}
                      required
                    />
                  </div>
                  <div className="col-6">
                    <label className="form-label small">Check-out</label>
                    <input
                      type="date"
                      className="form-control form-control-sm"
                      value={modCheckOut}
                      onChange={(e) => setModCheckOut(e.target.value)}
                      required
                    />
                  </div>
                </div>
                <div className="d-flex gap-2">
                  <button type="submit" className="btn palatin-btn btn-sm" disabled={busy}>
                    {busy ? 'Modifying…' : 'Confirm modification'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-link btn-sm text-muted"
                    onClick={() => setAction('none')}
                  >
                    Cancel
                  </button>
                </div>
                {message ? <p className="text-danger small mt-2 mb-0">{message}</p> : null}
              </form>
            </motion.div>
          )}
          {action === 'cancel' && cancelPreview && (
            <motion.div
              key="cancel"
              className="mt-3 p-3 bg-light rounded border"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3 }}
              style={{ overflow: 'hidden' }}
            >
              <h6 className="mb-2">Cancel booking</h6>
              <p className="small text-muted mb-2">{cancelPreview.policy_label}</p>
              <p className="small mb-3">
                Refund: {formatGuestMoney(cancelPreview.refundable, currency)}
                {cancelPreview.penalty > 0
                  ? ` · Penalty: ${formatGuestMoney(cancelPreview.penalty, currency)}`
                  : ''}
              </p>
              <div className="d-flex gap-2">
                <button
                  type="button"
                  className="btn btn-danger btn-sm"
                  disabled={busy}
                  onClick={() => void handleCancel()}
                >
                  {busy ? 'Cancelling…' : 'Confirm cancellation'}
                </button>
                <button
                  type="button"
                  className="btn btn-link btn-sm text-muted"
                  onClick={() => setAction('none')}
                >
                  Keep booking
                </button>
              </div>
              {message ? <p className="text-danger small mt-2 mb-0">{message}</p> : null}
            </motion.div>
          )}
          {action === 'review' && (
            <motion.div
              key="review"
              className="mt-3 p-3 bg-light rounded border"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3 }}
              style={{ overflow: 'hidden' }}
            >
              <h6 className="mb-2">How was your stay?</h6>
              <form onSubmit={handleReview}>
                <div className="mb-2">
                  <label className="form-label small">Rating (1–5)</label>
                  <select
                    className="form-select form-select-sm"
                    value={rating}
                    onChange={(e) => setRating(Number(e.target.value))}
                  >
                    <option value="5">5 - Excellent</option>
                    <option value="4">4 - Good</option>
                    <option value="3">3 - Average</option>
                    <option value="2">2 - Poor</option>
                    <option value="1">1 - Terrible</option>
                  </select>
                </div>
                <div className="mb-3">
                  <label className="form-label small">Feedback</label>
                  <textarea
                    className="form-control form-control-sm"
                    rows={3}
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    required
                    placeholder="Any issues we should look into?"
                  />
                </div>
                <div className="d-flex gap-2">
                  <button type="submit" className="btn palatin-btn btn-sm" disabled={busy}>
                    {busy ? 'Submitting…' : 'Submit feedback'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-link btn-sm text-muted"
                    onClick={() => setAction('none')}
                  >
                    Cancel
                  </button>
                </div>
                {message ? <p className="text-danger small mt-2 mb-0">{message}</p> : null}
              </form>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.article>
    );
  }

  return (
    <>
      <GuestPageHero title="My Bookings" subtitle="Your stays, confirmation codes, and booking lookup." />
      <motion.div
        className="guest-page guest-page--wide"
        initial="initial"
        animate="animate"
        variants={stagger}
      >
        <motion.form
          onSubmit={handleLookup}
          className="guest-panel mb-4"
          variants={fadeInUp}
          style={{ padding: '1.15rem 1.25rem' }}
        >
          <h5 className="mb-2" style={{ fontSize: '1rem' }}>
            Find a booking
          </h5>
          <div className="d-flex flex-column flex-sm-row gap-2">
            <input
              className="form-control"
              placeholder="Confirmation code"
              value={lookupCode}
              onChange={(e) => setLookupCode(e.target.value.toUpperCase())}
              required
            />
            <button type="submit" className="btn palatin-btn" disabled={lookupBusy}>
              {lookupBusy ? 'Searching…' : 'Look up'}
            </button>
          </div>
          {lookupError ? <p className="text-danger small mt-2 mb-0">{lookupError}</p> : null}
        </motion.form>

        <AnimatePresence>
          {lookup && (
            <motion.div
              key="lookup-result"
              className="mb-4"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.35 }}
            >
              <h5 className="mb-3" style={{ fontSize: '1rem' }}>
                Booking found
              </h5>
              <div className="d-flex flex-column gap-3">
                <TripCard trip={lookup} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <motion.div
          className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-4"
          variants={fadeInUp}
        >
          <p className="guest-muted mb-0" style={{ fontSize: '0.92rem' }}>
            {authRequired
              ? 'Sign in to see bookings linked to your account.'
              : loading
                ? 'Loading bookings…'
                : trips.length === 0
                  ? 'No bookings yet.'
                  : `${trips.length} booking${trips.length === 1 ? '' : 's'}`}
          </p>
          <Link href={`/${slug}/rooms`} className="btn palatin-btn btn-sm">
            Book a room
          </Link>
        </motion.div>

        {authRequired ? (
          <motion.div className="guest-panel text-center py-5" variants={fadeInUp}>
            <h3 className="mb-2" style={{ fontSize: '1.25rem' }}>
              Sign in required
            </h3>
            <p className="guest-muted mb-4">
              Sign in to list every stay linked to your guest account, or look up a confirmation
              code above.
            </p>
            <Link href={`/${slug}/account`} className="btn palatin-btn">
              Sign in
            </Link>
          </motion.div>
        ) : loading ? (
          <p className="guest-loading">Loading bookings…</p>
        ) : trips.length === 0 ? (
          <motion.div className="guest-panel text-center py-5" variants={fadeInUp}>
            <p className="mb-3" style={{ color: '#555' }}>
              When you book a room, it will show up here with your confirmation code.
            </p>
            <Link href={`/${slug}/rooms`} className="btn palatin-btn">
              Browse rooms
            </Link>
          </motion.div>
        ) : (
          <div className="d-flex flex-column gap-3">
            {visibleTrips.map((trip) => (
              <TripCard key={trip.id} trip={trip} />
            ))}
            {hasMoreTrips ? (
              <div className="text-center pt-2">
                <button
                  type="button"
                  className="btn palatin-btn"
                  onClick={() => setShowAllTrips((v) => !v)}
                  style={{ minWidth: 160 }}
                >
                  {showAllTrips
                    ? 'Show less'
                    : `View more (${trips.length - INITIAL_VISIBLE} more)`}
                </button>
              </div>
            ) : null}
          </div>
        )}
      </motion.div>
    </>
  );
}
