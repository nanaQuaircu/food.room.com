'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { fetchApi } from '@/lib/client/fetch-api';
import { formatGuestMoney } from '@/lib/guest/format-money';
import GuestPageHero from '@/components/guest/GuestPageHero';
import GuestFoodOrderReceipt, {
  type FoodReceiptOrder,
} from '@/components/guest/GuestFoodOrderReceipt';
import { useGuestCartOptional } from '@/components/guest/GuestCartContext';

type OrderLine = { item_name: string; quantity: number; line_total: number };

type GuestOrder = {
  id: number;
  order_type: string;
  delivery_type: string | null;
  room_number: string | null;
  status: string;
  payment_status: string;
  payment_method: string | null;
  total_amount: number;
  delivery_fee: number;
  created_at: string;
  lines: OrderLine[];
};

const fadeInUp = {
  initial: { opacity: 0, y: 24 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.45, ease: 'easeOut' as const } },
};
const stagger = { animate: { transition: { staggerChildren: 0.08 } } };

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: 'New', color: '#b45309', bg: '#fffbeb' },
  preparing: { label: 'Preparing', color: '#1d4ed8', bg: '#eff6ff' },
  ready: { label: 'Ready', color: '#15803d', bg: '#f0fdf4' },
  delivered: { label: 'Delivered', color: '#475569', bg: '#f1f5f9' },
  cancelled: { label: 'Cancelled', color: '#b91c1c', bg: '#fef2f2' },
};

function formatWhen(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function orderTypeLabel(order: GuestOrder) {
  if (order.order_type === 'room_service' || order.delivery_type === 'room_service') {
    return order.room_number ? `Room service · Rm ${order.room_number}` : 'Room service';
  }
  if (order.delivery_type === 'hubtel') return 'Delivery';
  if (order.order_type === 'restaurant') return 'Dine-in / Pickup';
  return order.order_type.replace(/_/g, ' ');
}

export default function GuestOrdersModule({ slug }: { slug: string }) {
  const cart = useGuestCartOptional();
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [currency, setCurrency] = useState('GHS');
  const [hotelName, setHotelName] = useState('Hotel');
  const [hotelAddress, setHotelAddress] = useState<string | null>(null);
  const [hotelLogoUrl, setHotelLogoUrl] = useState<string | null>(null);
  const [orders, setOrders] = useState<GuestOrder[]>([]);
  const [receiptOrderId, setReceiptOrderId] = useState<number | null>(null);
  const [receiptOrder, setReceiptOrder] = useState<FoodReceiptOrder | null>(null);
  const [receiptLoading, setReceiptLoading] = useState(false);
  const [receiptError, setReceiptError] = useState('');
  const [showAllOrders, setShowAllOrders] = useState(false);

  const INITIAL_VISIBLE = 5;
  const visibleOrders = showAllOrders ? orders : orders.slice(0, INITIAL_VISIBLE);
  const hasMoreOrders = orders.length > INITIAL_VISIBLE;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [profileRes, hotelRes, ordersRes] = await Promise.all([
        fetchApi<{ email?: string }>(`/api/public/${slug}/profile`),
        fetchApi<{
          currency?: string;
          name?: string;
          address?: string | null;
          logo_url?: string | null;
        }>(`/api/public/${slug}`),
        fetchApi<GuestOrder[]>(`/api/public/${slug}/food-orders?limit=40`, { skipCache: true }),
      ]);

      if (hotelRes.success && hotelRes.data) {
        if (hotelRes.data.currency) setCurrency(hotelRes.data.currency);
        if (hotelRes.data.name) setHotelName(hotelRes.data.name);
        if (hotelRes.data.address != null) setHotelAddress(hotelRes.data.address);
        if (hotelRes.data.logo_url != null) setHotelLogoUrl(hotelRes.data.logo_url);
      }

      const signedIn = Boolean(profileRes.success && profileRes.data);
      setAuthenticated(signedIn);

      if (signedIn && ordersRes.success && Array.isArray(ordersRes.data)) {
        setOrders(ordersRes.data);
      } else {
        setOrders([]);
      }
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    void load();
  }, [load]);

  const openReceipt = useCallback(
    async (orderId: number) => {
      if (receiptOrderId === orderId) {
        setReceiptOrderId(null);
        setReceiptOrder(null);
        setReceiptError('');
        return;
      }
      setReceiptOrderId(orderId);
      setReceiptLoading(true);
      setReceiptError('');
      setReceiptOrder(null);
      const res = await fetchApi<FoodReceiptOrder>(
        `/api/public/${slug}/food-orders/${orderId}`,
        { skipCache: true }
      );
      if (res.success && res.data) {
        setReceiptOrder(res.data);
      } else {
        setReceiptError(res.message || 'Could not load receipt.');
      }
      setReceiptLoading(false);
    },
    [slug, receiptOrderId]
  );

  if (loading) {
    return (
      <>
        <GuestPageHero title="My Orders" subtitle="Track food orders from the restaurant." />
        <div className="guest-page">
          <p className="guest-loading">Loading orders…</p>
        </div>
      </>
    );
  }

  if (!authenticated) {
    return (
      <>
        <GuestPageHero title="My Orders" subtitle="Sign in to see your food order history." />
        <motion.div className="guest-page" initial="initial" animate="animate" variants={stagger}>
          <motion.div className="guest-panel text-center py-5" variants={fadeInUp}>
            <h3 className="mb-2" style={{ fontSize: '1.25rem' }}>
              Sign in required
            </h3>
            <p className="guest-muted mb-4">
              Your restaurant and room-service orders appear here after you sign in.
            </p>
            <Link href={`/${slug}/account`} className="btn palatin-btn">
              Sign in
            </Link>
          </motion.div>
        </motion.div>
      </>
    );
  }

  return (
    <>
      <GuestPageHero title="My Orders" subtitle="Food orders, room service, and delivery history." />
      <motion.div className="guest-page guest-page--wide" initial="initial" animate="animate" variants={stagger}>
        <motion.div
          className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-4"
          variants={fadeInUp}
        >
          <p className="guest-muted mb-0" style={{ fontSize: '0.92rem' }}>
            {orders.length === 0
              ? 'No orders yet.'
              : `${orders.length} order${orders.length === 1 ? '' : 's'}`}
          </p>
          <Link href={`/${slug}/menu`} className="btn palatin-btn btn-sm">
            Order from menu
          </Link>
        </motion.div>

        {orders.length === 0 ? (
          <motion.div className="guest-panel text-center py-5" variants={fadeInUp}>
            <p className="mb-3" style={{ color: '#555' }}>
              When you place a food order, it will show up here with live status.
            </p>
            <Link href={`/${slug}/menu`} className="btn palatin-btn">
              Browse menu
            </Link>
          </motion.div>
        ) : (
          <div className="d-flex flex-column gap-3">
            {visibleOrders.map((order) => {
              const meta = STATUS_META[order.status] || STATUS_META.pending;
              const canTrack = !['cancelled', 'delivered'].includes(order.status);
              const showReceipt = order.status === 'delivered';
              const receiptOpen = receiptOrderId === order.id;
              return (
                <motion.article
                  key={order.id}
                  className="guest-panel guest-order-card"
                  variants={fadeInUp}
                  style={{ padding: '1.15rem 1.25rem' }}
                >
                  <div className="d-flex flex-wrap justify-content-between gap-2 align-items-start mb-2">
                    <div>
                      <div className="d-flex flex-wrap align-items-center gap-2 mb-1">
                        <strong style={{ fontSize: '1.05rem' }}>Order #{order.id}</strong>
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
                        <span
                          style={{
                            fontSize: '0.72rem',
                            fontWeight: 600,
                            color: order.payment_status === 'paid' ? '#15803d' : '#92400e',
                            background: order.payment_status === 'paid' ? '#f0fdf4' : '#fffbeb',
                            borderRadius: 999,
                            padding: '0.2rem 0.65rem',
                          }}
                        >
                          {order.payment_status === 'paid' ? 'Paid' : 'Payment pending'}
                        </span>
                      </div>
                      <p className="mb-0 guest-muted" style={{ fontSize: '0.85rem' }}>
                        {orderTypeLabel(order)} · {formatWhen(order.created_at)}
                      </p>
                    </div>
                    <div className="text-end">
                      <div style={{ fontWeight: 700, fontSize: '1.1rem', color: '#cb8670' }}>
                        {formatGuestMoney(order.total_amount, currency)}
                      </div>
                      {order.delivery_fee > 0 ? (
                        <div className="guest-muted" style={{ fontSize: '0.75rem' }}>
                          incl. delivery {formatGuestMoney(order.delivery_fee, currency)}
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <ul
                    className="mb-3 ps-3 guest-order-card__lines"
                    style={{
                      fontSize: '0.9rem',
                      color: '#444',
                      maxHeight: order.lines.length > 4 ? 140 : undefined,
                      overflowY: order.lines.length > 4 ? 'auto' : undefined,
                      marginBottom: '0.85rem',
                    }}
                  >
                    {order.lines.map((line, i) => (
                      <li key={`${order.id}-${i}`}>
                        {line.quantity}× {line.item_name}
                        <span className="guest-muted ms-2">
                          {formatGuestMoney(line.line_total, currency)}
                        </span>
                      </li>
                    ))}
                  </ul>

                  <div
                    className="d-flex flex-wrap"
                    style={{ gap: '0.65rem' }}
                  >
                    {canTrack && cart ? (
                      <button
                        type="button"
                        className="btn btn-sm"
                        style={{
                          background: '#1e1714',
                          color: '#fff',
                          borderRadius: 8,
                          fontWeight: 600,
                        }}
                        onClick={() => cart.openTracker(order.id)}
                      >
                        Track order
                      </button>
                    ) : null}
                    {showReceipt ? (
                      <button
                        type="button"
                        className="btn btn-sm"
                        style={{
                          background: receiptOpen ? '#fff' : '#1e1714',
                          color: receiptOpen ? '#1e1714' : '#fff',
                          border: '1px solid #1e1714',
                          borderRadius: 8,
                          fontWeight: 600,
                        }}
                        onClick={() => void openReceipt(order.id)}
                      >
                        {receiptOpen ? 'Hide receipt' : 'View receipt'}
                      </button>
                    ) : null}
                    <Link
                      href={`/${slug}/menu`}
                      className="btn btn-sm btn-outline-secondary"
                      style={{ borderRadius: 8, fontWeight: 600 }}
                    >
                      Order again
                    </Link>
                  </div>

                  {receiptOpen ? (
                    <div className="mt-3">
                      {receiptLoading ? (
                        <p className="guest-muted mb-0" style={{ fontSize: '0.9rem' }}>
                          Loading receipt…
                        </p>
                      ) : null}
                      {receiptError ? (
                        <p className="mb-0" style={{ color: '#b91c1c', fontSize: '0.9rem' }}>
                          {receiptError}
                        </p>
                      ) : null}
                      {receiptOrder ? (
                        <GuestFoodOrderReceipt
                          order={receiptOrder}
                          currency={currency}
                          hotelName={hotelName}
                          hotelAddress={hotelAddress}
                          hotelLogoUrl={hotelLogoUrl}
                          compact
                        />
                      ) : null}
                    </div>
                  ) : null}
                </motion.article>
              );
            })}
            {hasMoreOrders ? (
              <div className="text-center pt-2">
                <button
                  type="button"
                  className="btn palatin-btn"
                  onClick={() => setShowAllOrders((v) => !v)}
                  style={{ minWidth: 160 }}
                >
                  {showAllOrders
                    ? 'Show less'
                    : `View more (${orders.length - INITIAL_VISIBLE} more)`}
                </button>
              </div>
            ) : null}
          </div>
        )}
      </motion.div>
    </>
  );
}
