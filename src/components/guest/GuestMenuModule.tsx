'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { fetchApi } from '@/lib/client/fetch-api';
import { useGuestCart } from '@/components/guest/GuestCartContext';
import GuestPageHero from '@/components/guest/GuestPageHero';

type MenuItem = {
  id: number;
  name: string;
  description: string | null;
  price: number;
  image_url: string | null;
};

type MenuCategory = {
  id: number;
  name: string;
  items: MenuItem[];
};

const PAGE_SIZE = 8;

const CAT_ICONS: Record<string, string> = {
  All: '🍽️',
  Breakfast: '🍳',
  Lunch: '🥗',
  Dinner: '🍽️',
  Drinks: '🍹',
  Drink: '🍹',
  Desserts: '🍮',
  Starters: '🫙',
  'Main Dishes': '🥩',
  'Main dishes': '🥩',
  Snacks: '🥪',
  Burger: '🍔',
  Pizza: '🍕',
  Rice: '🍚',
  Bread: '🍞',
  Noodle: '🍜',
  Disc: '🏷️',
};

function catIcon(name: string) {
  return CAT_ICONS[name] || '✨';
}

const ease = [0.25, 0.46, 0.45, 0.94] as const;

export default function GuestMenuModule({
  slug,
}: {
  slug: string;
  initialGuest?: { email: string; name: string; guestId: number } | null;
}) {
  const { items: cartItems, addItem, adjustQty } = useGuestCart();
  const cartQty = useMemo(() => {
    const map: Record<number, number> = {};
    for (const item of cartItems) map[item.id] = item.qty;
    return map;
  }, [cartItems]);

  const [menu, setMenu] = useState<MenuCategory[]>([]);
  const [hotelName, setHotelName] = useState('Hotel');
  const [currency, setCurrency] = useState('GHS');
  const [favorites, setFavorites] = useState<Record<number, boolean>>({});
  const [orderType, setOrderType] = useState<'restaurant' | 'room_service'>('restaurant');
  const [roomNumber, setRoomNumber] = useState('');
  const [deliveryType, setDeliveryType] = useState<'pickup' | 'room_service' | 'hubtel'>('pickup');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [activeCategory, setActiveCategory] = useState<number | 'all'>('all');
  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const load = useCallback(async () => {
    const [menuRes, hotelRes] = await Promise.all([
      fetchApi<MenuCategory[]>(`/api/public/${slug}/menu`),
      fetchApi<{ name?: string; currency?: string }>(`/api/public/${slug}`),
    ]);
    if (menuRes.success && menuRes.data) setMenu(menuRes.data);
    if (hotelRes.success && hotelRes.data) {
      if (hotelRes.data.name) setHotelName(hotelRes.data.name);
      if (hotelRes.data.currency) setCurrency(hotelRes.data.currency);
    }
  }, [slug]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [activeCategory, search]);

  function addFoodToCart(item: MenuItem) {
    addItem({
      id: item.id,
      name: item.name,
      price: Number(item.price),
      image_url: item.image_url,
    });
  }

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    let items =
      activeCategory === 'all'
        ? menu.flatMap((c) => c.items.map((item) => ({ ...item, categoryName: c.name })))
        : (menu.find((c) => c.id === activeCategory)?.items || []).map((item) => ({
            ...item,
            categoryName: menu.find((c) => c.id === activeCategory)?.name || '',
          }));

    if (q) {
      items = items.filter(
        (item) =>
          item.name.toLowerCase().includes(q) ||
          (item.description || '').toLowerCase().includes(q) ||
          item.categoryName.toLowerCase().includes(q)
      );
    }
    return items;
  }, [menu, activeCategory, search]);

  const visibleItems = filteredItems.slice(0, visibleCount);
  const canViewMore = visibleCount < filteredItems.length;

  function scrollToMeals() {
    document.getElementById('gm-meals')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  const services = [
    {
      key: 'delivery',
      title: 'Fast Delivery',
      desc: 'Get meals delivered to your room or nearby address with our courier partners.',
      icon: (
        <svg viewBox="0 0 64 64" width="48" height="48" aria-hidden>
          <path
            fill="currentColor"
            d="M6 34h6l4-10h18l6 10h8c2 0 4 2 4 4v6h-4a6 6 0 1 1-12 0H24a6 6 0 1 1-12 0H6v-10zm34-8l-3-6H20l-2 6h22zM16 46a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm30 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"
          />
        </svg>
      ),
      onClick: () => {
        setOrderType('restaurant');
        setDeliveryType('hubtel');
        setShowFilters(true);
        scrollToMeals();
      },
    },
    {
      key: 'catering',
      title: 'Catering',
      desc: 'Plan events, private dining, and group menus with our culinary team.',
      icon: (
        <svg viewBox="0 0 64 64" width="48" height="48" aria-hidden>
          <path
            fill="currentColor"
            d="M18 40c0-8 6-14 14-14s14 6 14 14v2H18v-2zm14-18a6 6 0 0 0-6 6h12a6 6 0 0 0-6-6zm-20 22h40v4H12v-4zm8 6h24v2H20v-2z"
          />
        </svg>
      ),
      href: `/${slug}/contact`,
    },
    {
      key: 'table',
      title: 'Book a Table',
      desc: 'Reserve a table at the restaurant for breakfast, lunch, or dinner service.',
      icon: (
        <svg viewBox="0 0 64 64" width="48" height="48" aria-hidden>
          <path
            fill="currentColor"
            d="M10 28h44v4H10v-4zm6 6h4v14h-4V34zm28 0h4v14h-4V34zm-14-18a8 8 0 0 1 8 8H18a8 8 0 0 1 8-8z"
          />
        </svg>
      ),
      href: `/${slug}/contact`,
    },
  ];

  return (
    <>
      <style>{`
        .gm-wrap {
          --gm-brand: #cb8670;
          --gm-brand-dark: #b56f5a;
          --gm-ink: #2a2a2a;
          --gm-muted: #7d7d7d;
          --gm-line: #ece6e1;
          --gm-bg: #ffffff;
          font-family: 'FuturaLT-Book', 'Segoe UI', sans-serif;
          background: var(--gm-bg);
          color: var(--gm-ink);
          /* top padding from guest.css (.guest-shell main > .gm-wrap) */
          padding: 0 0 140px;
          min-height: 70vh;
        }
        .gm-inner {
          width: min(1180px, calc(100% - 32px));
          margin: 0 auto;
        }
        .gm-services {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 28px;
          margin-bottom: 56px;
        }
        .gm-service {
          text-align: center;
          padding: 8px 12px 4px;
        }
        .gm-service__icon {
          color: var(--gm-brand);
          margin-bottom: 14px;
          display: inline-flex;
        }
        .gm-service__title {
          font-size: 1.15rem;
          font-weight: 700;
          margin: 0 0 10px;
          color: var(--gm-ink);
        }
        .gm-service__desc {
          font-size: 0.88rem;
          line-height: 1.55;
          color: var(--gm-muted);
          margin: 0 auto 18px;
          max-width: 260px;
        }
        .gm-service__btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 120px;
          padding: 10px 22px;
          border-radius: 8px;
          border: none;
          background: var(--gm-brand);
          color: #fff;
          font-weight: 700;
          font-size: 0.85rem;
          text-decoration: none;
          cursor: pointer;
          transition: background 0.2s, transform 0.2s;
        }
        .gm-service__btn:hover {
          background: var(--gm-brand-dark);
          color: #fff;
          transform: translateY(-1px);
        }

        .gm-meals-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          flex-wrap: wrap;
          margin-bottom: 22px;
        }
        .gm-meals-title {
          margin: 0;
          font-size: clamp(1.7rem, 3vw, 2.2rem);
          font-weight: 800;
          color: var(--gm-brand);
          letter-spacing: -0.02em;
        }
        .gm-search-row {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .gm-search {
          position: relative;
          width: min(280px, 70vw);
        }
        .gm-search input {
          width: 100%;
          border: 1px solid #ddd4cd;
          background: #fff;
          border-radius: 999px;
          padding: 11px 42px 11px 16px;
          font-size: 0.9rem;
          outline: none;
          color: var(--gm-ink);
        }
        .gm-search input:focus { border-color: var(--gm-brand); }
        .gm-search input::placeholder { color: #a79a90; }
        .gm-search__icon {
          position: absolute;
          right: 14px;
          top: 50%;
          transform: translateY(-50%);
          color: var(--gm-brand);
          pointer-events: none;
        }
        .gm-filter-btn {
          width: 44px;
          height: 44px;
          border-radius: 50%;
          border: none;
          background: var(--gm-brand);
          color: #fff;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          flex-shrink: 0;
        }
        .gm-filter-btn.active { background: var(--gm-brand-dark); }

        .gm-order-panel {
          background: #fff;
          border: 1px solid var(--gm-line);
          border-radius: 14px;
          padding: 16px;
          margin-bottom: 22px;
          display: grid;
          gap: 12px;
        }
        .gm-order-panel__row {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }
        .gm-chip {
          border: 1px solid #ddd4cd;
          background: #fff;
          color: var(--gm-ink);
          border-radius: 999px;
          padding: 8px 14px;
          font-size: 0.82rem;
          font-weight: 600;
          cursor: pointer;
        }
        .gm-chip.active {
          background: var(--gm-brand);
          border-color: var(--gm-brand);
          color: #fff;
        }
        .gm-order-panel input {
          width: 100%;
          max-width: 360px;
          border: 1px solid #ddd4cd;
          border-radius: 10px;
          padding: 10px 12px;
          outline: none;
        }
        .gm-order-panel input:focus { border-color: var(--gm-brand); }

        .gm-cats {
          display: flex;
          flex-wrap: wrap;
          gap: 18px 22px;
          margin-bottom: 28px;
          padding-bottom: 4px;
        }
        .gm-cat {
          border: none;
          background: transparent;
          color: #b0a49c;
          font-weight: 700;
          font-size: 0.92rem;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
          padding: 0;
        }
        .gm-cat.active { color: var(--gm-brand); }
        .gm-cat span[aria-hidden] { font-size: 1rem; }

        .gm-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 22px;
        }
        .gm-card {
          background: #fff;
          border-radius: 14px;
          overflow: hidden;
          box-shadow: 0 8px 24px rgba(42, 42, 42, 0.06);
          border: 1px solid rgba(0,0,0,0.03);
          display: flex;
          flex-direction: column;
          transition: transform 0.2s, box-shadow 0.2s;
          cursor: pointer;
        }
        .gm-card:hover {
          transform: translateY(-3px);
          box-shadow: 0 14px 32px rgba(42, 42, 42, 0.1);
        }
        .gm-card__media {
          position: relative;
          aspect-ratio: 4 / 3;
          background: #f3f4f6;
          overflow: hidden;
        }
        .gm-card__media img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }
        .gm-card__placeholder {
          width: 100%;
          height: 100%;
          display: grid;
          place-items: center;
          color: var(--gm-brand);
          font-weight: 800;
          font-size: 1.4rem;
          letter-spacing: 0.04em;
          background: #f3f4f6;
        }
        .gm-card__fav {
          position: absolute;
          right: 12px;
          bottom: 12px;
          width: 34px;
          height: 34px;
          border-radius: 50%;
          border: none;
          background: rgba(255,255,255,0.95);
          color: var(--gm-brand);
          display: grid;
          place-items: center;
          cursor: pointer;
          box-shadow: 0 4px 12px rgba(0,0,0,0.12);
        }
        .gm-card__fav.is-on { color: #fff; background: var(--gm-brand); }
        .gm-card__body {
          padding: 14px 14px 16px;
          display: flex;
          flex-direction: column;
          flex: 1;
          gap: 6px;
        }
        .gm-card__name {
          margin: 0;
          font-size: 1rem;
          font-weight: 800;
          color: var(--gm-brand);
          line-height: 1.25;
        }
        .gm-card__meta {
          display: flex;
          align-items: center;
          gap: 6px;
          color: #c4a35a;
          font-size: 0.78rem;
        }
        .gm-card__meta .gm-stars { letter-spacing: 1px; }
        .gm-card__meta .gm-comments { color: var(--gm-muted); }
        .gm-card__loc {
          display: flex;
          align-items: center;
          gap: 6px;
          color: var(--gm-muted);
          font-size: 0.78rem;
        }
        .gm-card__footer {
          margin-top: auto;
          padding-top: 10px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
        }
        .gm-card__price {
          font-weight: 800;
          color: var(--gm-brand-dark);
          font-size: 1rem;
        }
        .gm-add, .gm-qty {
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }
        .gm-add button, .gm-qty button {
          width: 30px;
          height: 30px;
          border-radius: 8px;
          border: none;
          background: var(--gm-brand);
          color: #fff;
          font-weight: 700;
          cursor: pointer;
        }
        .gm-qty span {
          min-width: 18px;
          text-align: center;
          font-weight: 700;
          font-size: 0.9rem;
        }

        .gm-empty {
          text-align: center;
          padding: 48px 16px;
          color: var(--gm-muted);
        }
        .gm-more-wrap {
          display: flex;
          justify-content: center;
          margin-top: 36px;
        }
        .gm-more {
          min-width: 180px;
          padding: 12px 28px;
          border: none;
          border-radius: 10px;
          background: var(--gm-brand);
          color: #fff;
          font-weight: 700;
          cursor: pointer;
        }
        .gm-more:hover { background: var(--gm-brand-dark); }

        @media (max-width: 1100px) {
          .gm-grid { grid-template-columns: repeat(3, 1fr); }
        }
        @media (max-width: 820px) {
          .gm-services { grid-template-columns: 1fr; gap: 28px; }
          .gm-grid { grid-template-columns: repeat(2, 1fr); }
        }
        @media (max-width: 540px) {
          .gm-grid { grid-template-columns: 1fr; }
          .gm-meals-head { align-items: stretch; }
          .gm-search { width: 100%; }
          .gm-search-row { width: 100%; }
        }
      `}</style>

      <GuestPageHero title="Menu" subtitle="Order meals for dine-in, room service, or delivery." />
      <div className="gm-wrap">
        <div className="gm-inner">
          <section className="gm-services" aria-label="Restaurant services">
            {services.map((service) => (
              <motion.div
                key={service.key}
                className="gm-service"
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45, ease }}
              >
                <div className="gm-service__icon">{service.icon}</div>
                <h3 className="gm-service__title">{service.title}</h3>
                <p className="gm-service__desc">{service.desc}</p>
                {service.href ? (
                  <Link href={service.href} className="gm-service__btn">
                    Check Out
                  </Link>
                ) : (
                  <button type="button" className="gm-service__btn" onClick={service.onClick}>
                    Check Out
                  </button>
                )}
              </motion.div>
            ))}
          </section>

          <section id="gm-meals">
            <div className="gm-meals-head">
              <h2 className="gm-meals-title">Our Meals</h2>
              <div className="gm-search-row">
                <div className="gm-search">
                  <input
                    type="search"
                    placeholder="search by name"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    aria-label="Search meals"
                  />
                  <span className="gm-search__icon" aria-hidden>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
                      <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  </span>
                </div>
                <button
                  type="button"
                  className={`gm-filter-btn${showFilters ? ' active' : ''}`}
                  aria-label="Order options"
                  onClick={() => setShowFilters((v) => !v)}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path d="M4 7h16M7 12h10M10 17h4" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
            </div>

            <AnimatePresence>
              {showFilters ? (
                <motion.div
                  className="gm-order-panel"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                >
                  <div className="gm-order-panel__row">
                    <button
                      type="button"
                      className={`gm-chip${orderType === 'restaurant' ? ' active' : ''}`}
                      onClick={() => {
                        setOrderType('restaurant');
                        setDeliveryType('pickup');
                      }}
                    >
                      Dine in / Pickup
                    </button>
                    <button
                      type="button"
                      className={`gm-chip${orderType === 'room_service' ? ' active' : ''}`}
                      onClick={() => {
                        setOrderType('room_service');
                        setDeliveryType('room_service');
                      }}
                    >
                      Room service
                    </button>
                    {orderType === 'restaurant' ? (
                      <button
                        type="button"
                        className={`gm-chip${deliveryType === 'hubtel' ? ' active' : ''}`}
                        onClick={() => setDeliveryType('hubtel')}
                      >
                        Hubtel delivery
                      </button>
                    ) : null}
                  </div>
                  {orderType === 'room_service' ? (
                    <input
                      placeholder="Enter your room number"
                      value={roomNumber}
                      onChange={(e) => setRoomNumber(e.target.value)}
                    />
                  ) : null}
                  {orderType === 'restaurant' && deliveryType === 'hubtel' ? (
                    <input
                      placeholder="Delivery address"
                      value={deliveryAddress}
                      onChange={(e) => setDeliveryAddress(e.target.value)}
                    />
                  ) : null}
                </motion.div>
              ) : null}
            </AnimatePresence>

            <div className="gm-cats" role="tablist" aria-label="Meal categories">
              <button
                type="button"
                className={`gm-cat${activeCategory === 'all' ? ' active' : ''}`}
                onClick={() => setActiveCategory('all')}
              >
                <span aria-hidden>{catIcon('All')}</span>
                All
              </button>
              {menu.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  className={`gm-cat${activeCategory === cat.id ? ' active' : ''}`}
                  onClick={() => setActiveCategory(cat.id)}
                >
                  <span aria-hidden>{catIcon(cat.name)}</span>
                  {cat.name}
                </button>
              ))}
            </div>

            {menu.length === 0 ? (
              <div className="gm-empty">
                <p>Our chefs are preparing the menu. Please check back shortly.</p>
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="gm-empty">
                <p>No meals match your search.</p>
              </div>
            ) : (
              <>
                <div className="gm-grid">
                  {visibleItems.map((item, i) => {
                    const qty = cartQty[item.id] || 0;
                    const initials = item.name
                      .split(' ')
                      .map((n) => n[0])
                      .join('')
                      .slice(0, 2)
                      .toUpperCase();
                    return (
                      <motion.article
                        key={item.id}
                        className="gm-card"
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: Math.min(i, 7) * 0.05, duration: 0.35, ease }}
                        role="button"
                        tabIndex={0}
                        onClick={() => addFoodToCart(item)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            addFoodToCart(item);
                          }
                        }}
                      >
                        <div className="gm-card__media">
                          {item.image_url ? (
                            <img src={item.image_url} alt={item.name} />
                          ) : (
                            <div className="gm-card__placeholder">{initials}</div>
                          )}
                          <button
                            type="button"
                            className={`gm-card__fav${favorites[item.id] ? ' is-on' : ''}`}
                            aria-label={favorites[item.id] ? 'Remove favourite' : 'Save favourite'}
                            onClick={(e) => {
                              e.stopPropagation();
                              setFavorites((prev) => ({ ...prev, [item.id]: !prev[item.id] }));
                            }}
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
                              <path
                                fill="currentColor"
                                d="M12 21s-7.2-4.35-9.6-8.4C.7 9.6 2.1 6 5.4 6c1.8 0 3.2 1 3.9 2.1C10 7 11.4 6 13.2 6c3.3 0 4.7 3.6 3 6.6C19.2 16.65 12 21 12 21z"
                              />
                            </svg>
                          </button>
                        </div>
                        <div className="gm-card__body">
                          <h3 className="gm-card__name">{item.name}</h3>
                          <div className="gm-card__meta">
                            <span className="gm-stars" aria-hidden>
                              ★★★★★
                            </span>
                            <span className="gm-comments">{item.categoryName || 'Menu'}</span>
                          </div>
                          <div className="gm-card__loc">
                            <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden>
                              <path
                                fill="currentColor"
                                d="M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5z"
                              />
                            </svg>
                            {hotelName}
                          </div>
                          <div className="gm-card__footer">
                            <div className="gm-card__price">
                              {currency} {Number(item.price).toFixed(2)}
                            </div>
                            {qty === 0 ? (
                              <div className="gm-add">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    addFoodToCart(item);
                                  }}
                                  aria-label="Add to order"
                                >
                                  +
                                </button>
                              </div>
                            ) : (
                              <div className="gm-qty" onClick={(e) => e.stopPropagation()}>
                                <button
                                  type="button"
                                  onClick={() => adjustQty(item.id, -1)}
                                  aria-label="Decrease"
                                >
                                  −
                                </button>
                                <span>{qty}</span>
                                <button
                                  type="button"
                                  onClick={() => addFoodToCart(item)}
                                  aria-label="Increase"
                                >
                                  +
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </motion.article>
                    );
                  })}
                </div>

                {canViewMore ? (
                  <div className="gm-more-wrap">
                    <button
                      type="button"
                      className="gm-more"
                      onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}
                    >
                      View More
                    </button>
                  </div>
                ) : null}
              </>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
