'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { fetchApi } from '@/lib/client/fetch-api';
import { formatGuestMoney } from '@/lib/guest/format-money';
import { formatDisplayDate, toIsoDateKey } from '@/lib/dates/format-display-date';

type Booking = {
  confirmation_code: string;
  status: string;
  check_in_date: string;
  check_out_date: string;
  total_amount: number;
  room_type_name: string | null;
  room_number: string | null;
  guest_first_name: string;
  guest_last_name: string;
  adults?: number;
  children?: number;
};

function statusLabel(status: string) {
  return status.replace(/_/g, ' ');
}

function nightsBetween(checkIn: string, checkOut: string): number {
  const a = toIsoDateKey(checkIn);
  const b = toIsoDateKey(checkOut);
  if (!a || !b) return 0;
  const start = new Date(`${a}T12:00:00`);
  const end = new Date(`${b}T12:00:00`);
  const diff = Math.round((end.getTime() - start.getTime()) / 86400000);
  return Math.max(0, diff);
}

export default function GuestConfirmationModule({ slug }: { slug: string }) {
  const params = useSearchParams();
  const code = params.get('code')?.trim() || '';
  const [booking, setBooking] = useState<Booking | null>(null);
  const [currency, setCurrency] = useState('GHS');
  const [hotelName, setHotelName] = useState('Hotel');

  useEffect(() => {
    if (!code) return;
    try {
      sessionStorage.setItem(`guest-last-booking:${slug}`, code);
    } catch {
      /* ignore */
    }
  }, [slug, code]);

  useEffect(() => {
    if (!code) return;
    void (async () => {
      const [bookingRes, profileRes] = await Promise.all([
        fetchApi<Booking>(`/api/public/${slug}/bookings?code=${encodeURIComponent(code)}`, {
          skipCache: true,
        }),
        fetchApi<{ currency: string; name?: string }>(`/api/public/${slug}`),
      ]);
      if (bookingRes.success && bookingRes.data) setBooking(bookingRes.data);
      if (profileRes.success && profileRes.data?.currency) setCurrency(profileRes.data.currency);
      if (profileRes.success && profileRes.data?.name) setHotelName(profileRes.data.name);
    })();
  }, [slug, code]);

  const nights = useMemo(
    () => (booking ? nightsBetween(booking.check_in_date, booking.check_out_date) : 0),
    [booking]
  );

  if (!code) {
    return (
      <div className="guest-confirm">
        <div className="guest-confirm__inner">
          <p className="guest-confirm__empty">Missing confirmation code.</p>
          <Link href={`/${slug}/rooms`} className="guest-confirm__btn guest-confirm__btn--primary">
            Browse rooms
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="guest-confirm">
      <div className="guest-confirm__glow" aria-hidden />
      <motion.div
        className="guest-confirm__inner"
        initial={{ opacity: 0, y: 28 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: 'easeOut' }}
      >
        <motion.div
          className="guest-confirm__badge"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.08, duration: 0.4 }}
        >
          <span className="guest-confirm__check" aria-hidden>
            ✓
          </span>
          Confirmed
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.14, duration: 0.5 }}
        >
          Your room is booked
        </motion.h1>
        <motion.p
          className="guest-confirm__lead"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.45 }}
        >
          Thank you for choosing {hotelName}. Save your confirmation code — you can find this stay under
          My Trips or look it up anytime with the code below.
        </motion.p>

        {booking ? (
          <motion.article
            className="guest-confirm__card"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.28, duration: 0.5 }}
          >
            <div className="guest-confirm__code-block">
              <span className="guest-confirm__label">Confirmation code</span>
              <p className="guest-confirm__code">{booking.confirmation_code}</p>
            </div>

            <div className="guest-confirm__stay">
              <div>
                <span className="guest-confirm__label">Check-in</span>
                <strong>{formatDisplayDate(booking.check_in_date)}</strong>
              </div>
              <span className="guest-confirm__stay-arrow" aria-hidden>
                →
              </span>
              <div>
                <span className="guest-confirm__label">Check-out</span>
                <strong>{formatDisplayDate(booking.check_out_date)}</strong>
              </div>
              {nights > 0 ? (
                <div className="guest-confirm__nights">
                  <span className="guest-confirm__label">Nights</span>
                  <strong>
                    {nights} night{nights === 1 ? '' : 's'}
                  </strong>
                </div>
              ) : null}
            </div>

            <dl className="guest-confirm__grid">
              <div>
                <dt>Guest</dt>
                <dd>
                  {booking.guest_first_name} {booking.guest_last_name}
                </dd>
              </div>
              <div>
                <dt>Room type</dt>
                <dd>{booking.room_type_name || 'Room'}</dd>
              </div>
              {booking.room_number ? (
                <div>
                  <dt>Room</dt>
                  <dd>Room {booking.room_number}</dd>
                </div>
              ) : null}
              <div>
                <dt>Guests</dt>
                <dd>
                  {booking.adults ?? 1} adult{(booking.adults ?? 1) === 1 ? '' : 's'}
                  {(booking.children ?? 0) > 0
                    ? ` · ${booking.children} child${booking.children === 1 ? '' : 'ren'}`
                    : ''}
                </dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd className="guest-confirm__status">{statusLabel(booking.status)}</dd>
              </div>
              <div>
                <dt>Stay total</dt>
                <dd className="guest-confirm__total">
                  {formatGuestMoney(Number(booking.total_amount), currency)}
                </dd>
              </div>
            </dl>

            <p className="guest-confirm__pay-note">
              If you chose pay at hotel, settle at front desk on arrival. If you paid online, your payment is
              linked to this confirmation code.
            </p>
          </motion.article>
        ) : (
          <p className="guest-confirm__loading">Loading confirmation…</p>
        )}

        <motion.div
          className="guest-confirm__actions"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.4 }}
        >
          <Link href={`/${slug}/trips`} className="guest-confirm__btn guest-confirm__btn--primary">
            View My Trips
          </Link>
          <Link href={`/${slug}/rooms`} className="guest-confirm__btn guest-confirm__btn--ghost">
            Browse rooms
          </Link>
        </motion.div>
      </motion.div>
    </div>
  );
}
