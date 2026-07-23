'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { fetchApi } from '@/lib/client/fetch-api';
import { formatGuestMoney } from '@/lib/guest/format-money';
import GuestPageHero from '@/components/guest/GuestPageHero';

const P = '/palatin';
const PLACEHOLDER = `${P}/img/bg-img/1.jpg`;
const PAGE_SIZE = 6;

type HotelProfile = { name: string; currency: string; address?: string | null };
type CatalogRoom = {
  id: number;
  room_number: string;
  floor: string | null;
  room_type_id: number;
  room_type_name: string;
  description: string | null;
  base_rate: number;
  max_occupancy: number;
  image_url: string | null;
};

type SortKey = 'room_number' | 'price_asc' | 'price_desc' | 'name';

function roomTitle(room: CatalogRoom) {
  return `Room ${room.room_number}`;
}

function typeLabel(room: CatalogRoom) {
  const dedicated = room.room_type_name.trim().toLowerCase() === `room ${room.room_number}`.toLowerCase();
  return dedicated ? null : room.room_type_name;
}

function compareRoomNumbers(a: string, b: string) {
  const aNum = /^\d+$/.test(a);
  const bNum = /^\d+$/.test(b);
  if (aNum && bNum) return Number(a) - Number(b);
  if (aNum !== bNum) return aNum ? -1 : 1;
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDaysIso(iso: string, days: number) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function buildPriceBands(rates: number[]) {
  if (!rates.length) return [{ key: 'all', label: 'Any price', min: 0, max: Infinity }];
  const max = Math.max(...rates);
  const step = max <= 200 ? 50 : max <= 500 ? 100 : 150;
  const bands = [{ key: 'all', label: 'Any price', min: 0, max: Infinity }];
  for (let start = 0; start < max; start += step) {
    const end = start + step;
    bands.push({
      key: `${start}-${end}`,
      label: `${start === 0 ? 'Up to' : `${start} –`} ${end}`,
      min: start === 0 ? 0 : start,
      max: end,
    });
  }
  bands.push({
    key: `${Math.ceil(max / step) * step}+`,
    label: `${Math.ceil(max / step) * step}+`,
    min: Math.ceil(max / step) * step,
    max: Infinity,
  });
  return bands;
}

export default function GuestRoomsListModule({
  slug,
  initialRooms = [],
  initialProfile = null,
}: {
  slug: string;
  initialRooms?: CatalogRoom[];
  initialProfile?: HotelProfile | null;
}) {
  const [profile, setProfile] = useState<HotelProfile | null>(initialProfile);
  const [rooms, setRooms] = useState<CatalogRoom[]>(initialRooms);
  const [loading, setLoading] = useState(initialRooms.length === 0);
  const [error, setError] = useState<string | null>(null);

  const [lookingFor, setLookingFor] = useState('');
  const [typeName, setTypeName] = useState<string | 'all'>('all');
  const [priceKey, setPriceKey] = useState('all');
  const [guests, setGuests] = useState<number | 'all'>('all');
  const [specific, setSpecific] = useState('');
  const [sortBy, setSortBy] = useState<SortKey>('room_number');
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [saved, setSaved] = useState<Set<number>>(new Set());

  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);

  useEffect(() => {
    const t = todayIso();
    setCheckIn(t);
    setCheckOut(addDaysIso(t, 2));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [p, r] = await Promise.all([
        fetchApi<HotelProfile & { address?: string | null }>(`/api/public/${slug}`),
        fetchApi<CatalogRoom[]>(`/api/public/${slug}/rooms`),
      ]);
      if (p.success && p.data) {
        setProfile({
          name: p.data.name,
          currency: p.data.currency,
          address: p.data.address,
        });
      }
      if (r.success && r.data) setRooms(r.data);
      else {
        setRooms([]);
        setError(r.message || 'Could not load rooms.');
      }
    } catch {
      setRooms([]);
      setError('Could not load rooms. Please refresh and try again.');
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    if (initialRooms.length > 0) {
      setRooms(initialRooms);
      if (initialProfile) setProfile(initialProfile);
      setLoading(false);
      return;
    }
    void load();
  }, [initialRooms, initialProfile, load]);

  const currency = profile?.currency || 'GHS';
  const hotelName = profile?.name || 'Hotel';
  const locationLabel = profile?.address?.trim() || hotelName;

  const typeOptions = useMemo(() => {
    const names = new Set<string>();
    for (const room of rooms) {
      const label = typeLabel(room);
      if (label) names.add(label);
    }
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [rooms]);

  const priceBands = useMemo(
    () => buildPriceBands(rooms.map((r) => Number(r.base_rate))),
    [rooms]
  );

  const filtered = useMemo(() => {
    const q = lookingFor.trim().toLowerCase();
    const s = specific.trim().toLowerCase();
    const band = priceBands.find((b) => b.key === priceKey) || priceBands[0];

    let list = rooms.filter((room) => {
      if (typeName !== 'all' && room.room_type_name !== typeName) return false;
      if (guests !== 'all' && room.max_occupancy < guests) return false;
      const rate = Number(room.base_rate);
      if (rate < band.min || rate > band.max) return false;
      const hay =
        `${room.room_number} ${room.room_type_name} ${room.description || ''}`.toLowerCase();
      if (q && !hay.includes(q)) return false;
      if (s && !hay.includes(s)) return false;
      return true;
    });

    list = [...list].sort((a, b) => {
      if (sortBy === 'price_asc') return a.base_rate - b.base_rate;
      if (sortBy === 'price_desc') return b.base_rate - a.base_rate;
      if (sortBy === 'name') return compareRoomNumbers(a.room_number, b.room_number);
      return compareRoomNumbers(a.room_number, b.room_number);
    });

    return list;
  }, [rooms, lookingFor, specific, typeName, guests, priceKey, priceBands, sortBy]);

  useEffect(() => {
    setVisible(PAGE_SIZE);
  }, [lookingFor, specific, typeName, guests, priceKey, sortBy]);

  const shown = filtered.slice(0, visible);
  const hasMore = visible < filtered.length;

  function toggleSave(id: number) {
    setSaved((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function roomHref(room: CatalogRoom) {
    const params = new URLSearchParams({
      check_in: checkIn,
      check_out: checkOut,
      adults: String(adults),
      children: String(children),
      room_id: String(room.id),
    });
    return `/${slug}/rooms/${room.room_type_id}?${params.toString()}`;
  }

  return (
    <>
      <GuestPageHero title="Rooms" subtitle={`Browse stays at ${hotelName} — filter by type, price, and guests.`} />
      <div className="gr">
      <style>{`
        .gr {
          --gr-bg: #ffffff;
          --gr-card: #ffffff;
          --gr-ink: #1a1a1a;
          --gr-muted: #8a8a8a;
          --gr-line: #ebe4dc;
          --gr-accent: #cb8670;
          --gr-accent-dark: #b56f5a;
          --gr-radius: 18px;
          --gr-radius-sm: 12px;
          background: var(--gr-bg);
          min-height: 60vh;
          /* top padding comes from guest.css (.guest-shell main > .gr) to clear navbar */
          padding: 0 0 4.5rem;
        }
        .gr-wrap {
          width: min(1180px, calc(100% - 2rem));
          margin: 0 auto;
        }
        .gr-hero {
          margin-bottom: 1.5rem;
        }
        .gr-hero h1 {
          margin: 0 0 0.35rem;
          font-size: clamp(1.75rem, 3vw, 2.35rem);
          font-weight: 800;
          color: var(--gr-ink);
          letter-spacing: -0.02em;
        }
        .gr-hero p {
          margin: 0;
          color: var(--gr-muted);
          font-size: 0.95rem;
        }
        .gr-filters {
          background: var(--gr-card);
          border-radius: var(--gr-radius);
          padding: 1rem 1.1rem;
          box-shadow: 0 10px 30px rgba(26, 26, 26, 0.05);
          display: grid;
          grid-template-columns: 1.3fr 1fr 1fr 1fr 1.6fr auto;
          gap: 0.75rem;
          align-items: end;
          margin-bottom: 1rem;
        }
        .gr-dates {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 0.75rem;
          margin-bottom: 1.75rem;
        }
        .gr-field label {
          display: block;
          font-size: 0.68rem;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--gr-muted);
          margin-bottom: 0.4rem;
        }
        .gr-field input,
        .gr-field select {
          width: 100%;
          height: 46px;
          border: 1px solid var(--gr-line);
          border-radius: 999px;
          padding: 0 1rem;
          background: #ffffff;
          color: var(--gr-ink);
          font-size: 0.9rem;
          font-weight: 500;
          outline: none;
          appearance: none;
          transition: border-color 0.2s ease, box-shadow 0.2s ease;
        }
        .gr-field select {
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath fill='%238a8a8a' d='M1 1l5 5 5-5'/%3E%3C/svg%3E");
          background-repeat: no-repeat;
          background-position: right 1rem center;
          padding-right: 2.2rem;
        }
        .gr-field input:focus,
        .gr-field select:focus {
          border-color: var(--gr-accent);
          box-shadow: 0 0 0 3px rgba(203,134,112,0.15);
          background: #fff;
        }
        .gr-search {
          position: relative;
        }
        .gr-search input {
          padding-left: 2.5rem;
        }
        .gr-search__icon {
          position: absolute;
          left: 1rem;
          bottom: 14px;
          color: var(--gr-muted);
          pointer-events: none;
        }
        .gr-filter-btn {
          width: 46px;
          height: 46px;
          border: none;
          border-radius: 14px;
          background: var(--gr-accent);
          color: #fff;
          display: grid;
          place-items: center;
          cursor: pointer;
          flex-shrink: 0;
          transition: background 0.2s ease, transform 0.15s ease;
        }
        .gr-filter-btn:hover {
          background: var(--gr-accent-dark);
          transform: translateY(-1px);
        }
        .gr-toolbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
          flex-wrap: wrap;
          margin-bottom: 1.35rem;
        }
        .gr-count {
          margin: 0;
          font-size: 0.95rem;
          font-weight: 800;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: var(--gr-ink);
        }
        .gr-sort {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          color: var(--gr-muted);
          font-size: 0.9rem;
        }
        .gr-sort select {
          border: none;
          background: transparent;
          font-weight: 700;
          color: var(--gr-ink);
          cursor: pointer;
          outline: none;
        }
        .gr-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 1.35rem;
        }
        .gr-card {
          background: var(--gr-card);
          border-radius: 22px;
          overflow: hidden;
          box-shadow: 0 12px 32px rgba(26, 26, 26, 0.06);
          text-decoration: none;
          color: inherit;
          display: flex;
          flex-direction: column;
          transition: transform 0.25s ease, box-shadow 0.25s ease;
        }
        .gr-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 18px 40px rgba(26, 26, 26, 0.1);
        }
        .gr-card__media {
          position: relative;
          aspect-ratio: 4 / 3.2;
          overflow: hidden;
          background: #ddd;
        }
        .gr-card__media img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
          transition: transform 0.45s ease;
        }
        .gr-card:hover .gr-card__media img {
          transform: scale(1.05);
        }
        .gr-card__save {
          position: absolute;
          top: 14px;
          right: 14px;
          width: 38px;
          height: 38px;
          border: none;
          border-radius: 50%;
          background: rgba(255,255,255,0.92);
          color: #555;
          display: grid;
          place-items: center;
          cursor: pointer;
          box-shadow: 0 6px 16px rgba(0,0,0,0.12);
          z-index: 2;
        }
        .gr-card__save.is-on {
          color: var(--gr-accent);
        }
        .gr-card__body {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 0.85rem;
          padding: 1rem 1.1rem 1.15rem;
        }
        .gr-card__name {
          margin: 0;
          font-size: 1.05rem;
          font-weight: 800;
          color: var(--gr-ink);
          line-height: 1.25;
        }
        .gr-card__meta {
          margin: 0.3rem 0 0;
          font-size: 0.8rem;
          color: var(--gr-muted);
          line-height: 1.35;
        }
        .gr-card__price {
          text-align: right;
          flex-shrink: 0;
        }
        .gr-card__price strong {
          display: block;
          font-size: 1.05rem;
          font-weight: 800;
          color: var(--gr-ink);
        }
        .gr-card__price span {
          font-size: 0.72rem;
          color: var(--gr-muted);
        }
        .gr-empty,
        .gr-status {
          text-align: center;
          padding: 3rem 1rem;
          color: var(--gr-muted);
        }
        .gr-more-wrap {
          display: flex;
          justify-content: center;
          margin-top: 2.25rem;
        }
        .gr-more {
          border: none;
          background: var(--gr-accent);
          color: #fff;
          font-weight: 700;
          font-size: 0.95rem;
          padding: 0.9rem 2.4rem;
          border-radius: 999px;
          cursor: pointer;
          box-shadow: 0 12px 28px rgba(203,134,112,0.3);
          transition: background 0.2s ease, transform 0.15s ease;
        }
        .gr-more:hover {
          background: var(--gr-accent-dark);
          transform: translateY(-1px);
        }
        @media (max-width: 1024px) {
          .gr-filters {
            grid-template-columns: 1fr 1fr 1fr;
          }
          .gr-dates {
            grid-template-columns: 1fr 1fr;
          }
          .gr-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }
        @media (max-width: 720px) {
          .gr-filters {
            grid-template-columns: 1fr;
          }
          .gr-dates {
            grid-template-columns: 1fr;
          }
          .gr-grid {
            grid-template-columns: 1fr;
          }
          .gr-filter-btn {
            width: 100%;
            height: 46px;
            border-radius: 999px;
          }
        }
      `}</style>

      <div className="gr-wrap">
        <div className="gr-filters">
          <div className="gr-field">
            <label htmlFor="gr-looking">Looking for</label>
            <input
              id="gr-looking"
              type="search"
              placeholder="e.g. Deluxe suite"
              value={lookingFor}
              onChange={(e) => setLookingFor(e.target.value)}
            />
          </div>
          <div className="gr-field">
            <label htmlFor="gr-type">Type</label>
            <select
              id="gr-type"
              value={typeName}
              onChange={(e) => setTypeName(e.target.value === 'all' ? 'all' : e.target.value)}
            >
              <option value="all">All rooms</option>
              {typeOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          <div className="gr-field">
            <label htmlFor="gr-price">Price</label>
            <select id="gr-price" value={priceKey} onChange={(e) => setPriceKey(e.target.value)}>
              {priceBands.map((band) => (
                <option key={band.key} value={band.key}>
                  {band.key === 'all' ? band.label : `${currency} ${band.label}`}
                </option>
              ))}
            </select>
          </div>
          <div className="gr-field">
            <label htmlFor="gr-guests">Guests</label>
            <select
              id="gr-guests"
              value={guests === 'all' ? 'all' : String(guests)}
              onChange={(e) =>
                setGuests(e.target.value === 'all' ? 'all' : Number(e.target.value))
              }
            >
              <option value="all">Any</option>
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <option key={n} value={n}>
                  {n}+ guests
                </option>
              ))}
            </select>
          </div>
          <div className="gr-field gr-search">
            <label htmlFor="gr-specific">Find specific room</label>
            <span className="gr-search__icon" aria-hidden>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
                <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </span>
            <input
              id="gr-specific"
              type="search"
              placeholder="Ex. Presidential suite"
              value={specific}
              onChange={(e) => setSpecific(e.target.value)}
            />
          </div>
          <button
            type="button"
            className="gr-filter-btn"
            aria-label="Apply filters"
            onClick={() => setVisible(PAGE_SIZE)}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M4 7h16M7 12h10M10 17h4" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="gr-dates">
          <div className="gr-field">
            <label htmlFor="gr-in">Check in</label>
            <input
              id="gr-in"
              type="date"
              value={checkIn}
              onChange={(e) => setCheckIn(e.target.value)}
            />
          </div>
          <div className="gr-field">
            <label htmlFor="gr-out">Check out</label>
            <input
              id="gr-out"
              type="date"
              value={checkOut}
              onChange={(e) => setCheckOut(e.target.value)}
            />
          </div>
          <div className="gr-field">
            <label htmlFor="gr-adults">Adults</label>
            <select
              id="gr-adults"
              value={adults}
              onChange={(e) => setAdults(Number(e.target.value))}
            >
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
          <div className="gr-field">
            <label htmlFor="gr-children">Children</label>
            <select
              id="gr-children"
              value={children}
              onChange={(e) => setChildren(Number(e.target.value))}
            >
              {[0, 1, 2, 3, 4].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="gr-toolbar">
          <p className="gr-count">
            {loading ? 'Loading…' : `${filtered.length} result${filtered.length === 1 ? '' : 's'} found`}
          </p>
          <div className="gr-sort">
            <span>Sort by:</span>
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value as SortKey)}>
              <option value="room_number">Room number</option>
              <option value="price_asc">Price: Low to high</option>
              <option value="price_desc">Price: High to low</option>
              <option value="name">Room number (A–Z)</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div className="gr-status">Loading rooms…</div>
        ) : error ? (
          <div className="gr-status">
            <p>{error}</p>
            <button type="button" className="gr-more" style={{ marginTop: 16 }} onClick={() => void load()}>
              Retry
            </button>
          </div>
        ) : shown.length === 0 ? (
          <div className="gr-empty">No rooms match your filters. Try adjusting type or price.</div>
        ) : (
          <>
            <div className="gr-grid">
              <AnimatePresence mode="popLayout">
                {shown.map((room, index) => {
                  const img = room.image_url || PLACEHOLDER;
                  const isSaved = saved.has(room.id);
                  const title = roomTitle(room);
                  const type = typeLabel(room);
                  return (
                    <motion.div
                      key={room.id}
                      layout
                      initial={{ opacity: 0, y: 24 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.96 }}
                      transition={{ duration: 0.4, delay: (index % 6) * 0.05, ease: 'easeOut' }}
                    >
                      <Link href={roomHref(room)} className="gr-card">
                        <div className="gr-card__media">
                          <img src={img} alt={title} />
                          <button
                            type="button"
                            className={`gr-card__save${isSaved ? ' is-on' : ''}`}
                            aria-label={isSaved ? 'Remove bookmark' : 'Save room'}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              toggleSave(room.id);
                            }}
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill={isSaved ? 'currentColor' : 'none'}>
                              <path
                                d="M7 4h10a1 1 0 011 1v15l-6-3.5L6 20V5a1 1 0 011-1z"
                                stroke="currentColor"
                                strokeWidth="1.8"
                                strokeLinejoin="round"
                              />
                            </svg>
                          </button>
                        </div>
                        <div className="gr-card__body">
                          <div>
                            <h3 className="gr-card__name">{title}</h3>
                            <p className="gr-card__meta">
                              {type ? `${type} · ` : ''}
                              {locationLabel}
                              {room.max_occupancy ? ` · Up to ${room.max_occupancy} guests` : ''}
                            </p>
                          </div>
                          <div className="gr-card__price">
                            <strong>{formatGuestMoney(room.base_rate, currency)}</strong>
                            <span>per night</span>
                          </div>
                        </div>
                      </Link>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>

            {hasMore ? (
              <div className="gr-more-wrap">
                <motion.button
                  type="button"
                  className="gr-more"
                  onClick={() => setVisible((v) => v + PAGE_SIZE)}
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                >
                  View More
                </motion.button>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
    </>
  );
}
