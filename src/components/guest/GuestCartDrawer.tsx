'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { fetchApi } from '@/lib/client/fetch-api';
import { useGuestCart } from '@/components/guest/GuestCartContext';

type DeliveryQuote = {
  fee: number;
  eta_minutes: number;
  currency?: string;
  source?: string;
};

export default function GuestCartDrawer({
  slug,
  initialGuest = null,
}: {
  slug: string;
  initialGuest?: { email: string; name: string; guestId: number } | null;
}) {
  const {
    items,
    cartCount,
    cartTotal,
    showCart,
    openCart,
    closeCart,
    adjustQty,
    clearCart,
    openTracker,
  } = useGuestCart();

  const [currency, setCurrency] = useState('GHS');
  const [hubtelEnabled, setHubtelEnabled] = useState(false);
  const [orderType, setOrderType] = useState<'restaurant' | 'room_service'>('restaurant');
  const [deliveryType, setDeliveryType] = useState<'pickup' | 'room_service' | 'hubtel'>('pickup');
  const [roomNumber, setRoomNumber] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'paystack' | 'cash'>('cash');
  const [placing, setPlacing] = useState(false);
  const [message, setMessage] = useState('');
  const [loadingAuth, setLoadingAuth] = useState(!initialGuest);
  const [authenticated, setAuthenticated] = useState(Boolean(initialGuest?.guestId));
  const [guestEmail, setGuestEmail] = useState(initialGuest?.email || '');
  const [paystackReady, setPaystackReady] = useState(false);
  const [quote, setQuote] = useState<DeliveryQuote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [quoteError, setQuoteError] = useState('');

  const refreshAuth = useCallback(async () => {
    try {
      const res = await fetchApi<{ email?: string }>(`/api/public/${slug}/profile`, {
        skipCache: true,
      });
      setAuthenticated(Boolean(res.success));
      if (res.data?.email) setGuestEmail(res.data.email);
    } catch {
      setAuthenticated(false);
    } finally {
      setLoadingAuth(false);
    }
  }, [slug]);

  useEffect(() => {
    void fetchApi<{ currency?: string; hubtel_enabled?: boolean }>(`/api/public/${slug}`).then((res) => {
      if (res.success && res.data?.currency) setCurrency(res.data.currency);
      if (res.success) setHubtelEnabled(Boolean(res.data?.hubtel_enabled));
    });
  }, [slug]);

  useEffect(() => {
    if (showCart) void refreshAuth();
  }, [showCart, refreshAuth]);

  useEffect(() => {
    if (document.getElementById('paystack-js')) {
      setPaystackReady(true);
      return;
    }
    const script = document.createElement('script');
    script.id = 'paystack-js';
    script.src = 'https://js.paystack.co/v1/inline.js';
    script.onload = () => setPaystackReady(true);
    document.body.appendChild(script);
  }, []);

  useEffect(() => {
    if (deliveryType !== 'hubtel' || !deliveryAddress.trim() || deliveryAddress.trim().length < 8) {
      setQuote(null);
      setQuoteError('');
      return;
    }

    const timer = window.setTimeout(() => {
      setQuoting(true);
      setQuoteError('');
      void fetchApi<DeliveryQuote>(
        `/api/public/${slug}/delivery/quote?address=${encodeURIComponent(deliveryAddress.trim())}`
      ).then((res) => {
        if (res.success && res.data) {
          setQuote(res.data);
        } else {
          setQuote(null);
          setQuoteError(res.message || 'Could not quote delivery.');
        }
        setQuoting(false);
      });
    }, 450);

    return () => window.clearTimeout(timer);
  }, [deliveryType, deliveryAddress, slug]);

  const deliveryFee = deliveryType === 'hubtel' ? Number(quote?.fee || 0) : 0;
  const grandTotal = useMemo(
    () => Math.round((cartTotal + deliveryFee) * 100) / 100,
    [cartTotal, deliveryFee]
  );

  const cashLabel =
    deliveryType === 'hubtel'
      ? 'Pay cash on delivery'
      : orderType === 'room_service'
        ? 'Pay cash on delivery to room'
        : 'Pay cash at pickup / counter';

  function finishSuccessfulOrder(orderId: number, extra = '') {
    clearCart();
    setNotes('');
    setDeliveryAddress('');
    setQuote(null);
    closeCart();
    setMessage(`Order #${orderId} placed!${extra}`);
    setTimeout(() => setMessage(''), 4000);
    openTracker(orderId);
  }

  async function placeOrder() {
    if (!items.length) return;
    if (orderType === 'room_service' && !roomNumber.trim()) {
      setMessage('Enter your room number.');
      setTimeout(() => setMessage(''), 4000);
      return;
    }
    if (deliveryType === 'hubtel' && !deliveryAddress.trim()) {
      setMessage('Enter a delivery address.');
      setTimeout(() => setMessage(''), 4000);
      return;
    }
    if (deliveryType === 'hubtel' && !quote) {
      setMessage(quoteError || 'Wait for the delivery quote before placing the order.');
      setTimeout(() => setMessage(''), 4000);
      return;
    }

    setPlacing(true);
    setMessage('');
    try {
      const wantsPaystack = paymentMethod === 'paystack';
      const resolvedPaymentMethod =
        deliveryType === 'hubtel' && !wantsPaystack
          ? 'cash_on_delivery'
          : wantsPaystack
            ? 'paystack'
            : 'cash';

      const res = await fetchApi<{
        id: number;
        delivery_fee?: number;
        delivery?: { status?: string; tracking_ref?: string | null; source?: string };
      }>(`/api/public/${slug}/menu`, {
        method: 'POST',
        body: JSON.stringify({
          order_type: orderType,
          delivery_type: orderType === 'room_service' ? 'room_service' : deliveryType,
          delivery_provider: deliveryType === 'hubtel' ? 'hubtel' : undefined,
          delivery_address: deliveryType === 'hubtel' ? deliveryAddress : undefined,
          payment_method: resolvedPaymentMethod,
          room_number: orderType === 'room_service' ? roomNumber : undefined,
          notes,
          lines: items.map((l) => ({ menu_item_id: l.id, quantity: l.qty })),
        }),
      });
      if (!res.success || !res.data?.id) {
        setMessage(res.message || 'Order failed');
        return;
      }

      const orderId = res.data.id;
      const deliveryNote =
        deliveryType === 'hubtel'
          ? res.data.delivery?.source === 'live'
            ? ' Rider requested via Hubtel.'
            : ' Delivery queued for dispatch.'
          : '';

      if (wantsPaystack && paystackReady && guestEmail) {
        const payRes = await fetchApi<{
          public_key: string;
          reference: string;
          amount: number;
          currency?: string;
        }>(`/api/public/${slug}/food-payments`, {
          method: 'POST',
          body: JSON.stringify({ order_id: orderId, email: guestEmail }),
        });

        if (payRes.success && payRes.data?.public_key && (window as any).PaystackPop) {
          let paid = false;
          (window as any).PaystackPop.setup({
            key: payRes.data.public_key,
            email: guestEmail,
            amount: Math.round(payRes.data.amount * 100),
            ref: payRes.data.reference,
            currency: payRes.data.currency || 'GHS',
            callback: (response: { reference: string }) => {
              paid = true;
              void fetchApi(`/api/public/${slug}/food-payments`, {
                method: 'POST',
                body: JSON.stringify({ action: 'confirm', reference: response.reference }),
              }).then(() => {
                finishSuccessfulOrder(orderId, ` Payment received.${deliveryNote}`);
              });
            },
            onClose: () => {
              if (paid) return;
              void fetchApi(`/api/public/${slug}/food-payments`, {
                method: 'POST',
                body: JSON.stringify({ action: 'abandon', order_id: orderId }),
              });
              setMessage('Payment cancelled. Your cart is still here — try again anytime.');
              setTimeout(() => setMessage(''), 6000);
            },
          }).openIframe();
          return;
        }

        setMessage('Could not open Paystack. Your order was not completed — cart kept.');
        void fetchApi(`/api/public/${slug}/food-payments`, {
          method: 'POST',
          body: JSON.stringify({ action: 'abandon', order_id: orderId }),
        });
        return;
      }

      finishSuccessfulOrder(
        orderId,
        resolvedPaymentMethod === 'cash_on_delivery'
          ? ` Pay cash on delivery.${deliveryNote}`
          : ` Pay cash when you receive your order.${deliveryNote}`
      );
    } finally {
      setPlacing(false);
    }
  }

  return (
    <>
      <style>{`
        .gm-drawer-overlay {
          position: fixed;
          inset: 0;
          background: rgba(20,14,10,0.45);
          z-index: 10040;
        }
        .gm-drawer {
          position: fixed;
          top: 0;
          right: 0;
          width: min(420px, 100%);
          height: 100%;
          height: 100dvh;
          background: #fff;
          z-index: 10050;
          display: flex;
          flex-direction: column;
          box-shadow: -12px 0 40px rgba(0,0,0,0.18);
        }
        .gm-drawer-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 20px 22px;
          border-bottom: 1px solid #ece6e1;
          flex-shrink: 0;
        }
        .gm-drawer-title { margin: 0; font-size: 1.25rem; font-weight: 800; color: #1e1714; }
        .gm-drawer-close {
          border: none;
          background: transparent;
          font-size: 1.1rem;
          cursor: pointer;
          color: #7d7d7d;
        }
        .gm-drawer-body {
          flex: 1 1 auto;
          min-height: 0;
          overflow: auto;
          padding: 16px 22px;
          display: grid;
          gap: 14px;
          align-content: start;
          -webkit-overflow-scrolling: touch;
        }
        .gm-drawer-item {
          display: grid;
          grid-template-columns: 56px 1fr auto;
          gap: 12px;
          align-items: center;
        }
        .gm-drawer-item-thumb {
          width: 56px;
          height: 56px;
          border-radius: 12px;
          background: #f3f4f6;
          overflow: hidden;
          display: grid;
          place-items: center;
          color: #cb8670;
          font-weight: 700;
        }
        .gm-drawer-item-thumb img { width: 100%; height: 100%; object-fit: cover; }
        .gm-drawer-item-name { font-weight: 700; font-size: 0.92rem; }
        .gm-drawer-item-price { color: #7d7d7d; font-size: 0.8rem; }
        .gm-drawer-footer {
          flex-shrink: 0;
          padding: 14px 22px calc(18px + env(safe-area-inset-bottom, 0px));
          border-top: 1px solid #ece6e1;
          background: #ffffff;
          box-shadow: 0 -8px 24px rgba(0,0,0,0.06);
        }
        .gm-drawer-checkout {
          display: grid;
          gap: 0;
        }
        .gm-drawer-notes {
          width: 100%;
          border: 1px solid #e5ddd7;
          border-radius: 12px;
          padding: 12px 14px;
          resize: none;
          margin-bottom: 14px;
          font: inherit;
        }
        .gm-totals-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;
        }
        .gm-totals-label { color: #7d7d7d; text-transform: uppercase; font-size: 0.75rem; letter-spacing: 0.08em; }
        .gm-totals-value { font-size: 1.5rem; font-weight: 800; color: #cb8670; }
        .gm-totals-sub { font-size: 0.9rem; font-weight: 600; color: #1e1714; }
        .gm-place-btn, .gm-signin-link {
          display: block;
          width: 100%;
          text-align: center;
          padding: 14px;
          border-radius: 12px;
          border: none;
          background: #1e1714;
          color: #fff;
          font-weight: 800;
          text-decoration: none;
          cursor: pointer;
        }
        .gm-signin-link {
          background: rgba(203,134,112,0.1);
          color: #cb8670;
          border: 1px solid rgba(203,134,112,0.3);
        }
        .gm-qty {
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }
        .gm-qty button {
          width: 28px;
          height: 28px;
          border-radius: 8px;
          border: none;
          background: #cb8670;
          color: #fff;
          font-weight: 700;
          cursor: pointer;
        }
        .gm-qty span {
          min-width: 18px;
          text-align: center;
          font-weight: 700;
        }
        .gm-drawer-chips {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-bottom: 12px;
        }
        .gm-drawer-chip {
          border: 1px solid #ddd4cd;
          background: #fff;
          border-radius: 999px;
          padding: 6px 12px;
          font-size: 0.78rem;
          font-weight: 600;
          cursor: pointer;
        }
        .gm-drawer-chip.active {
          background: #cb8670;
          border-color: #cb8670;
          color: #fff;
        }
        .gm-drawer-input {
          width: 100%;
          border: 1px solid #e5ddd7;
          border-radius: 10px;
          padding: 10px 12px;
          margin-bottom: 12px;
          font: inherit;
        }
        .gm-quote-hint {
          font-size: 0.78rem;
          color: #7d7d7d;
          margin: -4px 0 12px;
        }
        .gm-pay-options {
          display: grid;
          gap: 8px;
          margin-bottom: 14px;
        }
        .gm-pay-option {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          border: 1px solid #e5ddd7;
          border-radius: 12px;
          padding: 10px 12px;
          cursor: pointer;
          background: #fff;
        }
        .gm-pay-option.active {
          border-color: #cb8670;
          background: rgba(203,134,112,0.08);
        }
        .gm-pay-option strong { display: block; font-size: 0.86rem; color: #1e1714; }
        .gm-pay-option span { display: block; font-size: 0.75rem; color: #7d7d7d; margin-top: 2px; }
        .gm-success {
          position: fixed;
          top: 24px;
          left: 50%;
          transform: translateX(-50%);
          background: #16a34a;
          color: #fff;
          padding: 14px 28px;
          border-radius: 50px;
          font-weight: 700;
          font-size: 0.9rem;
          z-index: 2000;
          box-shadow: 0 8px 32px rgba(22,163,74,0.35);
          max-width: min(92vw, 420px);
          text-align: center;
        }
        .gm-cart-fab {
          position: fixed;
          right: 24px;
          bottom: 24px;
          z-index: 1200;
        }
        @media (max-width: 767px) {
          .gm-cart-fab {
            right: 16px;
            bottom: calc(4.75rem + 14px + env(safe-area-inset-bottom, 0px));
            z-index: 10050;
          }
          .gm-cart-pill {
            padding: 12px 16px;
            font-size: 0.85rem;
          }
          .gm-drawer-footer {
            padding-bottom: calc(16px + env(safe-area-inset-bottom, 0px));
          }
        }
        .gm-cart-pill {
          border: none;
          background: #1e1714;
          color: #fff;
          border-radius: 999px;
          padding: 14px 20px;
          font-weight: 700;
          cursor: pointer;
          box-shadow: 0 12px 30px rgba(0,0,0,0.22);
          display: inline-flex;
          align-items: center;
          gap: 10px;
        }
        .gm-cart-badge-dot {
          background: #cb8670;
          min-width: 24px;
          height: 24px;
          border-radius: 999px;
          display: grid;
          place-items: center;
          font-size: 0.75rem;
        }
      `}</style>

      <AnimatePresence>
        {message ? (
          <motion.div
            className="gm-success"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
          >
            {message}
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {cartCount > 0 && !showCart ? (
          <motion.div
            className="gm-cart-fab"
            initial={{ opacity: 0, scale: 0.8, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 20 }}
          >
            <button type="button" className="gm-cart-pill" onClick={openCart}>
              <span className="gm-cart-badge-dot">{cartCount}</span>
              View Order · <strong>
                {currency} {grandTotal.toFixed(2)}
              </strong>
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {showCart ? (
          <>
            <motion.div
              className="gm-drawer-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeCart}
            />
            <motion.div
              className="gm-drawer"
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            >
              <div className="gm-drawer-header">
                <h2 className="gm-drawer-title">Your Order</h2>
                <button type="button" className="gm-drawer-close" onClick={closeCart}>
                  ✕
                </button>
              </div>
              <div className="gm-drawer-body">
                {items.length === 0 ? (
                  <p style={{ color: '#7d7d7d', margin: 0 }}>Your cart is empty.</p>
                ) : (
                  items.map((item) => (
                    <div key={item.id} className="gm-drawer-item">
                      <div className="gm-drawer-item-thumb">
                        {item.image_url ? (
                          <img src={item.image_url} alt={item.name} />
                        ) : (
                          item.name.slice(0, 2).toUpperCase()
                        )}
                      </div>
                      <div>
                        <div className="gm-drawer-item-name">{item.name}</div>
                        <div className="gm-drawer-item-price">
                          {currency} {item.price.toFixed(2)} each
                        </div>
                        <div className="gm-qty" style={{ marginTop: 8 }}>
                          <button type="button" onClick={() => adjustQty(item.id, -1)}>
                            −
                          </button>
                          <span>{item.qty}</span>
                          <button type="button" onClick={() => adjustQty(item.id, 1)}>
                            +
                          </button>
                        </div>
                      </div>
                      <div style={{ fontWeight: 800, color: '#b56f5a' }}>
                        {currency} {(item.price * item.qty).toFixed(2)}
                      </div>
                    </div>
                  ))
                )}

                <div className="gm-drawer-checkout">
                  <div className="gm-drawer-chips">
                    <button
                      type="button"
                      className={`gm-drawer-chip${orderType === 'restaurant' && deliveryType !== 'hubtel' ? ' active' : ''}`}
                      onClick={() => {
                        setOrderType('restaurant');
                        setDeliveryType('pickup');
                      }}
                    >
                      Dine in / Pickup
                    </button>
                    <button
                      type="button"
                      className={`gm-drawer-chip${orderType === 'room_service' ? ' active' : ''}`}
                      onClick={() => {
                        setOrderType('room_service');
                        setDeliveryType('room_service');
                      }}
                    >
                      Room service
                    </button>
                    {orderType === 'restaurant' && hubtelEnabled ? (
                      <button
                        type="button"
                        className={`gm-drawer-chip${deliveryType === 'hubtel' ? ' active' : ''}`}
                        onClick={() => setDeliveryType('hubtel')}
                      >
                        Hubtel delivery
                      </button>
                    ) : null}
                  </div>
                  {orderType === 'room_service' ? (
                    <input
                      className="gm-drawer-input"
                      placeholder="Room number"
                      value={roomNumber}
                      onChange={(e) => setRoomNumber(e.target.value)}
                    />
                  ) : null}
                  {orderType === 'restaurant' && deliveryType === 'hubtel' ? (
                    <>
                      <input
                        className="gm-drawer-input"
                        placeholder="Delivery address"
                        value={deliveryAddress}
                        onChange={(e) => setDeliveryAddress(e.target.value)}
                      />
                      <p className="gm-quote-hint">
                        {quoting
                          ? 'Getting delivery quote…'
                          : quote
                            ? `Delivery fee ${currency} ${Number(quote.fee).toFixed(2)} · ETA ~${quote.eta_minutes} min${quote.source === 'estimated' ? ' (estimate)' : ''}`
                            : quoteError || 'Enter your full address for a delivery quote.'}
                      </p>
                    </>
                  ) : null}
                  <textarea
                    className="gm-drawer-notes"
                    rows={2}
                    placeholder="Special instructions…"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />

                  <div className="gm-pay-options">
                    <label className={`gm-pay-option${paymentMethod === 'cash' ? ' active' : ''}`}>
                      <input
                        type="radio"
                        name="food-pay"
                        checked={paymentMethod === 'cash'}
                        onChange={() => setPaymentMethod('cash')}
                      />
                      <span>
                        <strong>{cashLabel}</strong>
                        <span>
                          {deliveryType === 'hubtel'
                            ? 'Pay the rider when your order arrives.'
                            : 'No online payment needed.'}
                        </span>
                      </span>
                    </label>
                    <label className={`gm-pay-option${paymentMethod === 'paystack' ? ' active' : ''}`}>
                      <input
                        type="radio"
                        name="food-pay"
                        checked={paymentMethod === 'paystack'}
                        onChange={() => setPaymentMethod('paystack')}
                      />
                      <span>
                        <strong>Pay now online (Paystack)</strong>
                        <span>Card or mobile money. Cart is kept if you cancel.</span>
                      </span>
                    </label>
                  </div>
                </div>
              </div>
              <div className="gm-drawer-footer">
                <div className="gm-totals-row">
                  <span className="gm-totals-label">Subtotal</span>
                  <span className="gm-totals-sub">
                    {currency} {cartTotal.toFixed(2)}
                  </span>
                </div>
                {deliveryType === 'hubtel' ? (
                  <div className="gm-totals-row">
                    <span className="gm-totals-label">Delivery</span>
                    <span className="gm-totals-sub">
                      {currency} {deliveryFee.toFixed(2)}
                    </span>
                  </div>
                ) : null}
                <div className="gm-totals-row">
                  <span className="gm-totals-label">Total</span>
                  <span className="gm-totals-value">
                    {currency} {grandTotal.toFixed(2)}
                  </span>
                </div>
                {loadingAuth ? (
                  <p style={{ textAlign: 'center', color: '#9e8c7e', fontSize: '0.85rem' }}>
                    Verifying session…
                  </p>
                ) : authenticated ? (
                  <button
                    type="button"
                    className="gm-place-btn"
                    onClick={() => void placeOrder()}
                    disabled={placing || items.length === 0 || quoting}
                  >
                    {placing
                      ? 'Sending to Kitchen…'
                      : `Place Order · ${cartCount} item${cartCount > 1 ? 's' : ''}`}
                  </button>
                ) : (
                  <Link
                    href={`/${slug}/account?next=${encodeURIComponent(`/${slug}/menu`)}`}
                    className="gm-signin-link"
                  >
                    Sign In to Place Order →
                  </Link>
                )}
              </div>
            </motion.div>
          </>
        ) : null}
      </AnimatePresence>
    </>
  );
}
