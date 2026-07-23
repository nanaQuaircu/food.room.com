'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { fetchApi } from '@/lib/client/fetch-api';
import { useGuestCartOptional } from '@/components/guest/GuestCartContext';
import GuestFoodOrderReceipt from '@/components/guest/GuestFoodOrderReceipt';

export type GuestTrackedOrder = {
  id: number;
  order_type: string;
  delivery_type: string | null;
  delivery_address: string | null;
  delivery_provider: string | null;
  delivery_status: string | null;
  delivery_tracking_ref: string | null;
  delivery_eta_minutes: number | null;
  room_number: string | null;
  status: string;
  payment_status: string;
  payment_method: string | null;
  total_amount: number;
  delivery_fee: number;
  notes: string | null;
  created_at: string;
  lines: Array<{
    item_name: string;
    quantity: number;
    unit_price: number;
    line_total: number;
  }>;
};

const STEPS = [
  { key: 'pending', label: 'Order received', hint: 'Kitchen has your order' },
  { key: 'preparing', label: 'Preparing', hint: 'Chefs are cooking now' },
  { key: 'ready', label: 'Ready', hint: 'Almost with you' },
  { key: 'delivered', label: 'Completed', hint: 'Enjoy your meal' },
] as const;

function stepIndex(status: string) {
  if (status === 'cancelled') return -1;
  const i = STEPS.findIndex((s) => s.key === status);
  return i >= 0 ? i : 0;
}

function statusHeadline(order: GuestTrackedOrder) {
  if (order.status === 'cancelled') return 'Order cancelled';
  if (order.status === 'pending') return 'Order received';
  if (order.status === 'preparing') return 'Kitchen is preparing';
  if (order.status === 'ready') {
    if (order.delivery_type === 'hubtel') return 'Out for delivery';
    if (order.delivery_type === 'room_service' || order.order_type === 'room_service') {
      return 'On the way to your room';
    }
    return 'Ready for pickup';
  }
  if (order.status === 'delivered') return 'Order completed';
  return 'Tracking your order';
}

function formatMoney(amount: number, currency: string) {
  return `${currency} ${Number(amount).toFixed(2)}`;
}

export default function GuestFoodOrderTracker({
  slug,
}: {
  slug: string;
}) {
  const cart = useGuestCartOptional();
  const trackingOrderId = cart?.trackingOrderId ?? null;
  const showTracker = Boolean(cart?.showTracker && trackingOrderId);
  const [order, setOrder] = useState<GuestTrackedOrder | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [livePulse, setLivePulse] = useState(true);
  const [currency, setCurrency] = useState('GHS');
  const [hotelName, setHotelName] = useState('Hotel');
  const [hotelAddress, setHotelAddress] = useState<string | null>(null);
  const [hotelLogoUrl, setHotelLogoUrl] = useState<string | null>(null);

  useEffect(() => {
    void fetchApi<{
      currency?: string;
      name?: string;
      address?: string | null;
      logo_url?: string | null;
    }>(`/api/public/${slug}`).then((res) => {
      if (!res.success || !res.data) return;
      if (res.data.currency) setCurrency(res.data.currency);
      if (res.data.name) setHotelName(res.data.name);
      if (res.data.address != null) setHotelAddress(res.data.address);
      if (res.data.logo_url != null) setHotelLogoUrl(res.data.logo_url);
    });
  }, [slug]);

  const load = useCallback(async () => {
    if (!trackingOrderId) return;
    const res = await fetchApi<GuestTrackedOrder>(
      `/api/public/${slug}/food-orders/${trackingOrderId}`,
      { skipCache: true }
    );
    if (res.success && res.data) {
      setOrder(res.data);
      setError('');
      const done = res.data.status === 'delivered' || res.data.status === 'cancelled';
      setLivePulse(!done);
    } else {
      setError(res.message || 'Could not load order status.');
    }
  }, [slug, trackingOrderId]);

  useEffect(() => {
    if (!trackingOrderId) {
      setOrder(null);
      return;
    }
    // Keep status warm for FAB even when sheet is closed
    void load();
  }, [trackingOrderId, load]);

  useEffect(() => {
    if (!order || showTracker) return;
    if (order.status === 'delivered' || order.status === 'cancelled') {
      cart?.clearTracking();
    }
  }, [order, showTracker, cart]);

  useEffect(() => {
    if (!showTracker || !trackingOrderId) return;
    setLoading(true);
    void load().finally(() => setLoading(false));
  }, [showTracker, trackingOrderId, load]);

  useEffect(() => {
    if (!trackingOrderId || !livePulse) return;
    const id = window.setInterval(() => {
      void load();
    }, showTracker ? 5000 : 12000);
    return () => window.clearInterval(id);
  }, [showTracker, trackingOrderId, livePulse, load]);

  const activeIndex = useMemo(() => (order ? stepIndex(order.status) : 0), [order]);
  const cancelled = order?.status === 'cancelled';
  const isTerminal = order?.status === 'delivered' || order?.status === 'cancelled';

  if (!cart) return null;

  return (
    <>
      <style>{`
        .got-overlay {
          position: fixed;
          inset: 0;
          background: rgba(20,14,10,0.5);
          z-index: 10040;
        }
        .got-portal {
          position: fixed;
          inset: 0;
          z-index: 10050;
          display: flex;
          align-items: flex-end;
          justify-content: center;
          padding: 0;
          pointer-events: none;
        }
        .got-sheet {
          pointer-events: auto;
          width: min(480px, 100%);
          max-height: min(90vh, 720px);
          background: #ffffff;
          border-radius: 22px 22px 0 0;
          display: flex;
          flex-direction: column;
          box-shadow: 0 -16px 50px rgba(0,0,0,0.22);
          margin: 0;
          min-height: 0;
        }
        @media (min-width: 768px) {
          .got-portal {
            align-items: center;
            padding: 24px;
          }
          .got-sheet {
            border-radius: 22px;
            max-height: min(84vh, 680px);
            width: min(460px, calc(100vw - 48px));
            box-shadow: 0 24px 60px rgba(0,0,0,0.28);
          }
        }
        @media (max-width: 767px) {
          .got-portal {
            padding-bottom: calc(4.75rem + env(safe-area-inset-bottom, 0px));
          }
          .got-sheet {
            width: 100%;
            max-height: calc(100dvh - 4.75rem - env(safe-area-inset-bottom, 0px) - 8px);
            border-radius: 18px 18px 0 0;
          }
          .got-title {
            font-size: 1.15rem !important;
          }
          .got-header,
          .got-body {
            padding-left: 16px !important;
            padding-right: 16px !important;
          }
          .got-body {
            padding-bottom: 20px !important;
          }
        }
        @media (max-width: 480px) {
          .got-sheet {
            width: 100%;
          }
        }
        .got-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
          padding: 20px 22px 12px;
          border-bottom: 1px solid #efe6df;
          flex-shrink: 0;
        }
        .got-kicker {
          margin: 0;
          font-size: 0.72rem;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: #9a8174;
          font-weight: 700;
        }
        .got-title {
          margin: 4px 0 0;
          font-size: 1.35rem;
          font-weight: 800;
          color: #1e1714;
        }
        .got-live {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          margin-top: 8px;
          font-size: 0.75rem;
          font-weight: 700;
          color: #16a34a;
        }
        .got-live__dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #16a34a;
          animation: got-pulse 1.2s ease-in-out infinite;
        }
        @keyframes got-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.45; transform: scale(0.85); }
        }
        .got-close {
          border: none;
          background: #f2e8e1;
          width: 36px;
          height: 36px;
          border-radius: 50%;
          cursor: pointer;
          color: #5c4a40;
          font-size: 1rem;
          flex-shrink: 0;
        }
        .got-body {
          overflow: auto;
          padding: 18px 22px 28px;
          min-height: 0;
          flex: 1 1 auto;
          -webkit-overflow-scrolling: touch;
        }
        .got-steps {
          list-style: none;
          margin: 0 0 22px;
          padding: 0;
          display: grid;
          gap: 0;
        }
        .got-step {
          display: grid;
          grid-template-columns: 28px 1fr;
          gap: 12px;
          position: relative;
          padding-bottom: 18px;
        }
        .got-step:last-child { padding-bottom: 0; }
        .got-step__dot {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          border: 2px solid #e0d4cb;
          background: #fff;
          display: grid;
          place-items: center;
          font-size: 0.7rem;
          font-weight: 800;
          color: #9a8174;
          z-index: 1;
          transition: border-color 0.35s ease, background 0.35s ease, color 0.35s ease, box-shadow 0.35s ease;
        }
        .got-step.is-done .got-step__dot,
        .got-step.is-current .got-step__dot {
          border-color: #cb8670;
          background: #cb8670;
          color: #fff;
        }
        .got-step.is-done::before { background: #cb8670; }
        .got-step.is-current .got-step__dot {
          box-shadow: 0 0 0 4px rgba(203,134,112,0.22);
        }
        .got-step__rail {
          position: absolute;
          left: 13px;
          top: 28px;
          bottom: 0;
          width: 2px;
          background: #e8ddd5;
          overflow: hidden;
        }
        .got-step__rail-fill {
          width: 100%;
          height: 100%;
          background: #cb8670;
          transform-origin: top;
        }
        .got-step:last-child .got-step__rail { display: none; }
        .got-step__label { font-weight: 750; color: #1e1714; font-size: 0.95rem; }
        .got-step__hint { color: #8a7468; font-size: 0.8rem; margin-top: 2px; }
        .got-step.is-todo .got-step__label { color: #9a8174; }
        .got-cancelled {
          background: #fff1f1;
          border: 1px solid #f3c1c1;
          color: #b42318;
          border-radius: 14px;
          padding: 14px 16px;
          font-weight: 700;
          margin-bottom: 18px;
        }
        .got-success {
          position: relative;
          overflow: hidden;
          background: linear-gradient(135deg, #ecfdf3 0%, #d1fae5 55%, #bbf7d0 100%);
          border: 1px solid #86efac;
          color: #166534;
          border-radius: 16px;
          padding: 16px 16px 16px 18px;
          margin-bottom: 18px;
          display: grid;
          grid-template-columns: 44px 1fr;
          gap: 12px;
          align-items: center;
        }
        .got-success__icon {
          width: 44px;
          height: 44px;
          border-radius: 50%;
          background: #16a34a;
          color: #fff;
          display: grid;
          place-items: center;
          font-size: 1.25rem;
          font-weight: 800;
          box-shadow: 0 8px 20px rgba(22, 163, 74, 0.28);
        }
        .got-success__title {
          margin: 0;
          font-size: 1rem;
          font-weight: 800;
          color: #14532d;
        }
        .got-success__msg {
          margin: 3px 0 0;
          font-size: 0.82rem;
          font-weight: 600;
          color: #166534;
          opacity: 0.9;
        }
        .got-success__shine {
          position: absolute;
          top: 0;
          left: -40%;
          width: 35%;
          height: 100%;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.55), transparent);
          pointer-events: none;
        }
        .got-meta {
          display: grid;
          gap: 8px;
          background: #fff;
          border: 1px solid #efe6df;
          border-radius: 14px;
          padding: 14px 16px;
          margin-bottom: 16px;
          font-size: 0.86rem;
        }
        .got-meta div {
          display: flex;
          justify-content: space-between;
          gap: 12px;
        }
        .got-meta span { color: #8a7468; }
        .got-meta strong { color: #1e1714; text-align: right; }
        .got-lines {
          display: grid;
          gap: 10px;
          margin: 0;
          padding: 0;
          list-style: none;
        }
        .got-line {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          font-size: 0.88rem;
        }
        .got-line span { color: #5c4a40; }
        .got-line strong { color: #1e1714; }
        .got-fab {
          position: fixed;
          left: 16px;
          bottom: 24px;
          z-index: 1200;
          border: none;
          background: #cb8670;
          color: #fff;
          border-radius: 999px;
          padding: 12px 16px;
          font-weight: 700;
          font-size: 0.85rem;
          box-shadow: 0 12px 28px rgba(203,134,112,0.35);
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 8px;
        }
        @media (max-width: 767px) {
          .got-fab {
            bottom: calc(4.75rem + 14px + env(safe-area-inset-bottom, 0px));
            z-index: 10050;
          }
        }
        .got-fab__dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #fff;
          animation: got-pulse 1.2s ease-in-out infinite;
        }
      `}</style>

      {trackingOrderId && !showTracker && !isTerminal ? (
        <motion.button
          type="button"
          className="got-fab"
          onClick={() => cart.openTracker(trackingOrderId)}
          initial={{ opacity: 0, y: 18, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.96 }}
          transition={{ type: 'spring', stiffness: 380, damping: 22 }}
        >
          <span className="got-fab__dot" aria-hidden />
          Track order #{trackingOrderId}
        </motion.button>
      ) : null}

      <AnimatePresence>
        {showTracker ? (
          <>
            <motion.div
              className="got-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              onClick={() => {
                if (order && (order.status === 'delivered' || order.status === 'cancelled')) {
                  cart.clearTracking();
                } else {
                  cart.closeTracker();
                }
              }}
            />
            <div className="got-portal">
              <motion.div
                className="got-sheet"
                initial={{ opacity: 0, y: 48, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 28, scale: 0.97 }}
                transition={{ type: 'spring', stiffness: 340, damping: 28 }}
                role="dialog"
                aria-modal="true"
                aria-label="Food order tracking"
              >
              <div className="got-header">
                <div>
                  <motion.p
                    className="got-kicker"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.08 }}
                  >
                    Live tracking
                  </motion.p>
                  <div style={{ minHeight: '1.7rem', overflow: 'hidden' }}>
                    <AnimatePresence mode="wait">
                      <motion.h2
                        key={order ? statusHeadline(order) : `Order #${trackingOrderId}`}
                        className="got-title"
                        initial={{ opacity: 0, y: 14 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.28, ease: 'easeOut' }}
                      >
                        {order ? statusHeadline(order) : `Order #${trackingOrderId}`}
                      </motion.h2>
                    </AnimatePresence>
                  </div>
                  <AnimatePresence>
                    {livePulse && !cancelled ? (
                      <motion.div
                        className="got-live"
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                      >
                        <span className="got-live__dot" aria-hidden />
                        Updating live
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                </div>
                <motion.button
                  type="button"
                  className="got-close"
                  aria-label="Close"
                  whileHover={{ rotate: 90, scale: 1.06 }}
                  whileTap={{ scale: 0.92 }}
                  onClick={() => {
                    if (order && (order.status === 'delivered' || order.status === 'cancelled')) {
                      cart.clearTracking();
                    } else {
                      cart.closeTracker();
                    }
                  }}
                >
                  ✕
                </motion.button>
              </div>

              <div className="got-body">
                {loading && !order ? (
                  <motion.p
                    style={{ color: '#8a7468' }}
                    animate={{ opacity: [0.45, 1, 0.45] }}
                    transition={{ duration: 1.2, repeat: Infinity }}
                  >
                    Loading status…
                  </motion.p>
                ) : null}
                {error ? <p style={{ color: '#b42318' }}>{error}</p> : null}

                <AnimatePresence>
                  {cancelled ? (
                    <motion.div
                      className="got-cancelled"
                      initial={{ opacity: 0, scale: 0.96 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0 }}
                    >
                      This order was cancelled. Contact the hotel if you need help.
                    </motion.div>
                  ) : null}
                </AnimatePresence>

                <AnimatePresence>
                  {order?.status === 'delivered' ? (
                    <motion.div
                      className="got-success"
                      role="status"
                      aria-live="polite"
                      initial={{ opacity: 0, y: -16, scale: 0.94 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -8, scale: 0.98 }}
                      transition={{ type: 'spring', stiffness: 380, damping: 22 }}
                    >
                      <motion.span
                        className="got-success__shine"
                        initial={{ x: '-20%' }}
                        animate={{ x: '320%' }}
                        transition={{ duration: 1.1, ease: 'easeInOut', delay: 0.25 }}
                        aria-hidden
                      />
                      <motion.div
                        className="got-success__icon"
                        initial={{ scale: 0, rotate: -40 }}
                        animate={{ scale: 1, rotate: 0 }}
                        transition={{ type: 'spring', stiffness: 520, damping: 16, delay: 0.08 }}
                        aria-hidden
                      >
                        ✓
                      </motion.div>
                      <div>
                        <motion.p
                          className="got-success__title"
                          initial={{ opacity: 0, x: 10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.15, duration: 0.3 }}
                        >
                          Order completed successfully
                        </motion.p>
                        <motion.p
                          className="got-success__msg"
                          initial={{ opacity: 0, x: 10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.22, duration: 0.3 }}
                        >
                          Enjoy your meal — your receipt is ready below.
                        </motion.p>
                      </div>
                    </motion.div>
                  ) : null}
                </AnimatePresence>

                {order?.status === 'delivered' ? (
                  <GuestFoodOrderReceipt
                    order={order}
                    currency={currency}
                    hotelName={hotelName}
                    hotelAddress={hotelAddress}
                    hotelLogoUrl={hotelLogoUrl}
                    compact
                  />
                ) : null}

                {order && !cancelled && order.status !== 'delivered' ? (
                  <motion.ol
                    className="got-steps"
                    initial="hidden"
                    animate="show"
                    variants={{
                      hidden: {},
                      show: { transition: { staggerChildren: 0.1, delayChildren: 0.12 } },
                    }}
                  >
                    {STEPS.map((step, index) => {
                      const isDone = index < activeIndex || order.status === 'delivered';
                      const isCurrent = index === activeIndex && order.status !== 'delivered';
                      const isTodo = index > activeIndex && order.status !== 'delivered';
                      let hint = step.hint;
                      if (step.key === 'ready') {
                        if (order.delivery_type === 'hubtel') hint = 'Rider is on the way';
                        else if (order.order_type === 'room_service') hint = 'Heading to your room';
                        else hint = 'Ready for pickup at the restaurant';
                      }
                      return (
                        <motion.li
                          key={step.key}
                          className={`got-step${isDone ? ' is-done' : ''}${isCurrent ? ' is-current' : ''}${isTodo ? ' is-todo' : ''}`}
                          variants={{
                            hidden: { opacity: 0, x: -12 },
                            show: { opacity: 1, x: 0, transition: { duration: 0.35, ease: 'easeOut' } },
                          }}
                        >
                          <span className="got-step__rail" aria-hidden>
                            <motion.span
                              className="got-step__rail-fill"
                              initial={{ scaleY: 0 }}
                              animate={{ scaleY: isDone ? 1 : 0 }}
                              transition={{ duration: 0.45, ease: 'easeOut', delay: isDone ? 0.05 : 0 }}
                            />
                          </span>
                          <motion.span
                            className="got-step__dot"
                            aria-hidden
                            animate={
                              isCurrent
                                ? { scale: [1, 1.12, 1], boxShadow: ['0 0 0 4px rgba(203,134,112,0.22)', '0 0 0 8px rgba(203,134,112,0.12)', '0 0 0 4px rgba(203,134,112,0.22)'] }
                                : { scale: 1 }
                            }
                            transition={
                              isCurrent
                                ? { duration: 1.6, repeat: Infinity, ease: 'easeInOut' }
                                : { type: 'spring', stiffness: 420, damping: 18 }
                            }
                          >
                            <AnimatePresence mode="wait">
                              <motion.span
                                key={isDone || order.status === 'delivered' ? 'check' : `n-${index}`}
                                initial={{ opacity: 0, scale: 0.5 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.5 }}
                                transition={{ type: 'spring', stiffness: 500, damping: 20 }}
                              >
                                {isDone || order.status === 'delivered' ? '✓' : index + 1}
                              </motion.span>
                            </AnimatePresence>
                          </motion.span>
                          <div>
                            <div className="got-step__label">{step.label}</div>
                            <AnimatePresence mode="wait">
                              <motion.div
                                key={isCurrent || isDone ? hint : 'wait'}
                                className="got-step__hint"
                                initial={{ opacity: 0, y: 4 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.2 }}
                              >
                                {isCurrent || isDone ? hint : 'Waiting…'}
                              </motion.div>
                            </AnimatePresence>
                          </div>
                        </motion.li>
                      );
                    })}
                  </motion.ol>
                ) : null}

                {order && order.status !== 'delivered' && order.status !== 'cancelled' ? (
                  <>
                    <motion.div
                      className="got-meta"
                      initial={{ opacity: 0, y: 16 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.28, duration: 0.35 }}
                    >
                      <div>
                        <span>Order</span>
                        <strong>#{order.id}</strong>
                      </div>
                      <div>
                        <span>Type</span>
                        <strong>
                          {order.delivery_type === 'hubtel'
                            ? 'Hubtel delivery'
                            : order.order_type === 'room_service'
                              ? `Room service${order.room_number ? ` · ${order.room_number}` : ''}`
                              : 'Pickup / dine-in'}
                        </strong>
                      </div>
                      {order.delivery_address ? (
                        <div>
                          <span>Address</span>
                          <strong>{order.delivery_address}</strong>
                        </div>
                      ) : null}
                      {order.delivery_tracking_ref ? (
                        <div>
                          <span>Delivery ref</span>
                          <strong>{order.delivery_tracking_ref}</strong>
                        </div>
                      ) : null}
                      {order.delivery_status ? (
                        <div>
                          <span>Delivery status</span>
                          <strong style={{ textTransform: 'capitalize' }}>
                            {order.delivery_status.replace(/_/g, ' ')}
                          </strong>
                        </div>
                      ) : null}
                      <div>
                        <span>Payment</span>
                        <strong style={{ textTransform: 'capitalize' }}>
                          {(order.payment_method || 'cash').replace(/_/g, ' ')} · {order.payment_status}
                        </strong>
                      </div>
                      <div>
                        <span>Total</span>
                        <strong>{formatMoney(order.total_amount, currency)}</strong>
                      </div>
                    </motion.div>

                    <motion.ul
                      className="got-lines"
                      initial="hidden"
                      animate="show"
                      variants={{
                        hidden: {},
                        show: { transition: { staggerChildren: 0.06, delayChildren: 0.32 } },
                      }}
                    >
                      {order.lines.map((line, idx) => (
                        <motion.li
                          key={`${line.item_name}-${idx}`}
                          className="got-line"
                          variants={{
                            hidden: { opacity: 0, y: 8 },
                            show: { opacity: 1, y: 0 },
                          }}
                        >
                          <span>
                            {line.quantity}× {line.item_name}
                          </span>
                          <strong>{formatMoney(line.line_total, currency)}</strong>
                        </motion.li>
                      ))}
                    </motion.ul>
                  </>
                ) : null}
              </div>
              </motion.div>
            </div>
          </>
        ) : null}
      </AnimatePresence>
    </>
  );
}
