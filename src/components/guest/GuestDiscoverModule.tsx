'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { fetchApi } from '@/lib/client/fetch-api';
import { formatGuestMoney } from '@/lib/guest/format-money';
import GuestRoyalHomeHero from '@/components/guest/GuestRoyalHomeHero';
import GuestRoyalGallery from '@/components/guest/GuestRoyalGallery';

const P = '/palatin';
const PLACEHOLDER = `${P}/img/bg-img/1.jpg`;

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

function roomTitle(room: CatalogRoom) {
  return `Room ${room.room_number}`;
}

function typeLabel(room: CatalogRoom) {
  const dedicated =
    room.room_type_name.trim().toLowerCase() === `room ${room.room_number}`.toLowerCase();
  return dedicated ? null : room.room_type_name;
}

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDaysIso(iso: string, days: number) {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const fadeInUp = {
  initial: { opacity: 0, y: 40 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.65, ease: 'easeOut' as const } },
};

const fadeInLeft = {
  initial: { opacity: 0, x: -50 },
  animate: { opacity: 1, x: 0, transition: { duration: 0.65, ease: 'easeOut' as const } },
};

const fadeInRight = {
  initial: { opacity: 0, x: 50 },
  animate: { opacity: 1, x: 0, transition: { duration: 0.65, ease: 'easeOut' as const } },
};

const stagger = {
  animate: { transition: { staggerChildren: 0.12 } },
};

const viewport = { once: true, margin: '-80px' };

type Props = {
  slug: string;
  hotelName: string;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  currency: string;
  latitude?: number | null;
  longitude?: number | null;
  initialRooms?: CatalogRoom[];
};

/**
 * Guest home — Royal Villas–inspired hero booking layout + existing rooms/food-ready sections.
 */
export default function GuestDiscoverModule({
  slug,
  hotelName,
  address,
  phone,
  email,
  currency,
  latitude,
  longitude,
  initialRooms = [],
}: Props) {
  const [rooms, setRooms] = useState<CatalogRoom[]>(initialRooms);
  const [roomsLoading, setRoomsLoading] = useState(initialRooms.length === 0);
  const [roomsError, setRoomsError] = useState<string | null>(null);
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(1);

  useEffect(() => {
    const t = todayIso();
    setCheckIn(t);
    setCheckOut(addDaysIso(t, 2));
  }, []);

  const loadRooms = useCallback(async () => {
    setRoomsLoading(true);
    setRoomsError(null);
    try {
      const roomsRes = await fetchApi<CatalogRoom[]>(`/api/public/${slug}/rooms`);
      if (roomsRes.success && roomsRes.data) {
        setRooms(roomsRes.data);
      } else {
        setRooms([]);
        setRoomsError(roomsRes.message || 'Could not load rooms.');
      }
    } catch {
      setRooms([]);
      setRoomsError('Could not load rooms. Please refresh and try again.');
    } finally {
      setRoomsLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    if (initialRooms.length > 0) {
      setRooms(initialRooms);
      setRoomsLoading(false);
      return;
    }
    void loadRooms();
  }, [initialRooms, loadRooms]);

  const firstRoom = rooms[0];
  const mapSrc =
    latitude != null && longitude != null
      ? `https://maps.google.com/maps?q=${latitude},${longitude}&z=14&output=embed`
      : 'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d22236.40558254599!2d-118.25292394686001!3d34.057682914027104!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x80c2c75ddc27da13%3A0xe22fdf6f254608f4!2z4Kay4Ka4IOCmj-CmnuCnjeCmnOCnh-CmsuCnh-CmuCwg4KaV4KeN4Kav4Ka-4Kay4Ka_4Kar4KeL4Kaw4KeN4Kao4Ka_4Kav4Ka84Ka-LCDgpq7gpr7gprDgp43gppXgpr_gpqgg4Kav4KeB4KaV4KeN4Kak4Kaw4Ka-4Ka34KeN4Kaf4KeN4Kaw!5e0!3m2!1sbn!2sbd!4v1532328708137';

  return (
    <>
      <GuestRoyalHomeHero
        slug={slug}
        hotelName={hotelName}
        checkIn={checkIn}
        checkOut={checkOut}
        adults={adults}
        children={children}
        onCheckIn={setCheckIn}
        onCheckOut={setCheckOut}
        onAdults={setAdults}
        onChildren={setChildren}
        firstRoomId={firstRoom?.id ?? null}
      />

      <section className="guest-royal-about" id="about-preview">
        <div className="guest-royal-about__shell">
          <motion.div
            className="guest-royal-about__copy"
            initial="initial"
            whileInView="animate"
            viewport={viewport}
            variants={stagger}
          >
            <motion.div className="guest-royal-about__eyebrow" variants={fadeInUp}>
              <span />
              Welcome
            </motion.div>
            <motion.h2 variants={fadeInUp}>A place to remember</motion.h2>
            <motion.p variants={fadeInUp}>
              {hotelName} welcomes you to a memorable stay. Browse live room inventory, reserve online,
              and enjoy attentive service from arrival to checkout.
            </motion.p>
            <motion.ul className="guest-royal-about__list" variants={stagger}>
              {[
                'Real-time room availability from our PMS',
                'Online booking & guest trips',
                'Restaurant ordering delivered to your room',
              ].map((item) => (
                <motion.li key={item} variants={fadeInUp}>
                  <span className="guest-royal-about__check" aria-hidden="true">
                    <i className="fa fa-check" />
                  </span>
                  {item}
                </motion.li>
              ))}
            </motion.ul>
            <motion.div variants={fadeInUp}>
              <Link href={`/${slug}/about`} className="guest-royal-about__btn">
                <span>Read More</span>
              </Link>
            </motion.div>
          </motion.div>

          <motion.div
            className="guest-royal-about__collage"
            initial="initial"
            whileInView="animate"
            viewport={viewport}
            variants={stagger}
          >
            <motion.figure
              className="guest-royal-about__shot guest-royal-about__shot--a"
              variants={fadeInRight}
              whileHover={{ y: -8, scale: 1.03 }}
              transition={{ type: 'spring', stiffness: 260, damping: 18 }}
            >
              <img src="/guest/hero/exterior-day.jpg" alt="" />
            </motion.figure>
            <motion.figure
              className="guest-royal-about__shot guest-royal-about__shot--b"
              variants={fadeInUp}
              whileHover={{ y: -8, scale: 1.03 }}
              transition={{ type: 'spring', stiffness: 260, damping: 18 }}
            >
              <img src={`${P}/img/bg-img/5.jpg`} alt="" />
            </motion.figure>
            <motion.figure
              className="guest-royal-about__shot guest-royal-about__shot--c"
              variants={fadeInLeft}
              whileHover={{ y: -8, scale: 1.03 }}
              transition={{ type: 'spring', stiffness: 260, damping: 18 }}
            >
              <img src="/guest/hero/pool.jpg" alt="" />
            </motion.figure>
          </motion.div>
        </div>
      </section>

      <section className="guest-royal-pool" id="amenities">
        <div className="guest-royal-pool__shell">
          <motion.div
            className="guest-royal-pool__copy"
            initial="initial"
            whileInView="animate"
            viewport={viewport}
            variants={fadeInLeft}
          >
            <h3>Hotel Pool &amp; Leisure</h3>
            <p>
              Take a break from the day at {hotelName}&apos;s heated pool and lounge deck. Soft lighting,
              poolside seating, and attentive service make it easy to unwind between meetings or after a
              day of travel.
            </p>
            <p>
              Guests can enjoy refreshments from the pool bar, reserve sunbeds for afternoon rest, and
              use the spa-adjacent showers. Children should be accompanied by an adult while using the
              pool.
            </p>
            <ul className="guest-royal-pool__perks">
              <li>Heated pool with lounge seating</li>
              <li>Poolside drinks &amp; light bites</li>
              <li>Towels and sunbeds available daily</li>
            </ul>
            <Link href={`/${slug}/about`} className="guest-royal-pool__btn">
              <span>Read more</span>
            </Link>
          </motion.div>
          <motion.div
            className="guest-royal-pool__media"
            initial="initial"
            whileInView="animate"
            viewport={viewport}
            variants={fadeInRight}
          >
            <div className="guest-royal-pool__frame">
              <img src="/guest/hero/pool.jpg" alt={`${hotelName} pool`} />
            </div>
          </motion.div>
        </div>
      </section>

      <GuestRoyalGallery slug={slug} hotelName={hotelName} />

      <section className="guest-rooms-showcase" id="rooms">
        <div className="guest-rooms-showcase__inner">
          <motion.header
            className="guest-rooms-showcase__intro"
            initial="initial"
            whileInView="animate"
            viewport={viewport}
            variants={fadeInUp}
          >
            <p className="guest-rooms-showcase__eyebrow">Stay with us</p>
            <h2>Our rooms</h2>
            <p>
              Live rates for {hotelName}. Choose a room to see availability and book online.
            </p>
          </motion.header>

          <div className="guest-rooms-showcase__grid">
            {roomsLoading ? (
              <p className="guest-rooms-showcase__status">Loading rooms…</p>
            ) : roomsError ? (
              <div className="guest-rooms-showcase__status">
                <p>{roomsError}</p>
                <button type="button" className="guest-rooms-showcase__retry" onClick={() => void loadRooms()}>
                  Retry
                </button>
              </div>
            ) : rooms.length === 0 ? (
              <p className="guest-rooms-showcase__status">No rooms available right now.</p>
            ) : (
              rooms.map((room, index) => {
                const img = room.image_url || PLACEHOLDER;
                const title = roomTitle(room);
                const type = typeLabel(room);
                const href = `/${slug}/rooms/${room.room_type_id}?check_in=${checkIn}&check_out=${checkOut}&adults=${adults}&children=${children}&room_id=${room.id}`;
                return (
                  <motion.article
                    key={room.id}
                    className="guest-rooms-showcase__item"
                    initial={{ opacity: 0, y: 36 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={viewport}
                    transition={{ duration: 0.55, delay: (index % 3) * 0.1, ease: 'easeOut' }}
                  >
                    <Link href={href} className="guest-rooms-showcase__link">
                      <div className="guest-rooms-showcase__media">
                        <img src={img} alt={title} loading="lazy" />
                      </div>
                      <div className="guest-rooms-showcase__body">
                        <span className="guest-rooms-showcase__occupancy">
                          {type ? `${type} · ` : ''}Sleeps {room.max_occupancy}
                        </span>
                        <h3>{title}</h3>
                        <p>
                          {room.description ||
                            `A comfortable stay with hotel amenities for up to ${room.max_occupancy} guests.`}
                        </p>
                        <div className="guest-rooms-showcase__foot">
                          <span className="guest-rooms-showcase__price">
                            From {formatGuestMoney(room.base_rate, currency)}
                            <small>/night</small>
                          </span>
                          <span className="guest-rooms-showcase__cta">
                            View room
                            <span aria-hidden="true">→</span>
                          </span>
                        </div>
                      </div>
                    </Link>
                  </motion.article>
                );
              })
            )}
          </div>
        </div>
      </section>

      <section className="guest-home-contact">
        <style>{`
          .guest-home-contact {
            --hc-accent: #cb8670;
            --hc-ink: #111;
            --hc-muted: #6b6560;
            --hc-soft: #f5f4f1;
            --hc-line: #e5e2dc;
            background: var(--hc-soft);
            padding: 4rem 0 4.5rem;
            font-family: 'FuturaLT-Book', 'Segoe UI', sans-serif;
          }
          .guest-home-contact__inner {
            width: min(1100px, calc(100% - 2rem));
            margin: 0 auto;
          }
          .guest-home-contact__intro {
            text-align: center;
            max-width: 38rem;
            margin: 0 auto 2.5rem;
          }
          .guest-home-contact__intro h2 {
            margin: 0 0 0.65rem;
            font-size: clamp(1.75rem, 3vw, 2.4rem);
            font-weight: 700;
            letter-spacing: -0.02em;
          }
          .guest-home-contact__intro p {
            margin: 0;
            color: var(--hc-muted);
            line-height: 1.6;
          }
          .guest-home-contact__grid {
            display: grid;
            grid-template-columns: minmax(0, 1.1fr) minmax(0, 0.9fr);
            gap: 2rem;
            align-items: stretch;
          }
          .guest-home-contact__panel {
            background: #fff;
            border: 1px solid var(--hc-line);
            padding: 1.75rem 1.5rem;
            height: 100%;
          }
          .guest-home-contact__panel h3 {
            margin: 0 0 0.5rem;
            font-size: 1.15rem;
            font-weight: 700;
          }
          .guest-home-contact__panel > p {
            margin: 0 0 1.25rem;
            color: var(--hc-muted);
            font-size: 0.95rem;
            line-height: 1.55;
          }
          .guest-home-contact__cta {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            min-height: 2.85rem;
            padding: 0 1.35rem;
            background: var(--hc-accent);
            color: #111;
            font-weight: 700;
            text-decoration: none;
            transition: background 0.2s ease, color 0.2s ease;
          }
          .guest-home-contact__cta:hover {
            background: #b56f5a;
            color: #fff;
          }
          .guest-home-contact__cta--ghost {
            background: transparent;
            border: 1px solid #111;
            margin-left: 0.65rem;
          }
          .guest-home-contact__cta--ghost:hover {
            background: #111;
            color: #fff;
          }
          .guest-home-contact__meta {
            display: grid;
            gap: 1rem;
            margin-top: 1.5rem;
            padding-top: 1.25rem;
            border-top: 1px solid var(--hc-line);
          }
          .guest-home-contact__meta div span {
            display: block;
            font-size: 0.7rem;
            font-weight: 700;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            color: #9a928a;
            margin-bottom: 0.2rem;
          }
          .guest-home-contact__meta div p,
          .guest-home-contact__meta div a {
            margin: 0;
            color: var(--hc-ink);
            text-decoration: none;
            font-size: 0.98rem;
          }
          .guest-home-contact__map {
            border: 1px solid var(--hc-line);
            overflow: hidden;
            min-height: 100%;
            background: #ddd;
          }
          .guest-home-contact__map iframe {
            width: 100%;
            height: 100%;
            min-height: 320px;
            border: 0;
            display: block;
          }
          @media (max-width: 900px) {
            .guest-home-contact__grid { grid-template-columns: 1fr; }
            .guest-home-contact__cta--ghost { margin-left: 0; margin-top: 0.65rem; }
          }
        `}</style>
        <div className="guest-home-contact__inner">
          <motion.div
            className="guest-home-contact__intro"
            initial="initial"
            whileInView="animate"
            viewport={viewport}
            variants={fadeInUp}
          >
            <h2>Contact us</h2>
            <p>
              Have questions or want to discuss a stay? Reach {hotelName} — or look up an existing
              booking with your confirmation code.
            </p>
          </motion.div>

          <div className="guest-home-contact__grid">
            <motion.div
              className="guest-home-contact__panel"
              initial="initial"
              whileInView="animate"
              viewport={viewport}
              variants={fadeInUp}
            >
              <h3>Send a message</h3>
              <p>
                Tell us about rooms, dining, or special requests. We usually reply within 1–2
                business days.
              </p>
              <div>
                <Link href={`/${slug}/contact`} className="guest-home-contact__cta">
                  Open contact form
                </Link>
                <Link href={`/${slug}/trips`} className="guest-home-contact__cta guest-home-contact__cta--ghost">
                  Booking lookup
                </Link>
              </div>
              <div className="guest-home-contact__meta">
                {address ? (
                  <div>
                    <span>Visit</span>
                    <p>{address}</p>
                  </div>
                ) : null}
                {phone ? (
                  <div>
                    <span>Phone</span>
                    <a href={`tel:${phone.replace(/\s+/g, '')}`}>{phone}</a>
                  </div>
                ) : null}
                {email ? (
                  <div>
                    <span>Email</span>
                    <a href={`mailto:${email}`}>{email}</a>
                  </div>
                ) : null}
              </div>
            </motion.div>

            <motion.div
              className="guest-home-contact__map"
              initial="initial"
              whileInView="animate"
              viewport={viewport}
              variants={fadeInUp}
            >
              <iframe src={mapSrc} allowFullScreen title="Hotel map" loading="lazy" />
            </motion.div>
          </div>
        </div>
      </section>
    </>
  );
}
