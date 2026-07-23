'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { GUEST_HERO_IMAGES, GUEST_HERO_INTERVAL_MS } from '@/lib/guest/hero-images';

const SLIDES = [
  {
    image: GUEST_HERO_IMAGES[0],
    title: 'Your Ideal Retreat',
    line1: 'Enjoy the world of relaxation',
    line2: 'and tranquility!',
  },
  {
    image: GUEST_HERO_IMAGES[1],
    title: 'Relax & Unwind',
    line1: 'Experience the luxurious level',
    line2: 'of comfort and care',
  },
  {
    image: GUEST_HERO_IMAGES[2],
    title: 'Revitalize & Stay',
    line1: 'Indulge in our top-notch',
    line2: 'hospitality and dining',
  },
  {
    image: GUEST_HERO_IMAGES[3],
    title: 'Nights to Remember',
    line1: 'Evenings made for rest',
    line2: 'and lasting memories',
  },
] as const;

type Props = {
  slug: string;
  hotelName: string;
  checkIn: string;
  checkOut: string;
  adults: number;
  children: number;
  onCheckIn: (v: string) => void;
  onCheckOut: (v: string) => void;
  onAdults: (v: number) => void;
  onChildren: (v: number) => void;
  firstRoomId?: number | null;
};

/**
 * Royal Villas–inspired home hero: wide vertical carousel + booking sidebar.
 * “Check availability” navigates into the existing /book quote flow (no PHP mailform).
 */
export default function GuestRoyalHomeHero({
  slug,
  hotelName,
  checkIn,
  checkOut,
  adults,
  children,
  onCheckIn,
  onCheckOut,
  onAdults,
  onChildren,
  firstRoomId,
}: Props) {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [guestName, setGuestName] = useState('');

  useEffect(() => {
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % SLIDES.length);
    }, GUEST_HERO_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, []);

  function goTo(i: number) {
    setIndex(((i % SLIDES.length) + SLIDES.length) % SLIDES.length);
  }

  function handleCheckAvailability(e: FormEvent) {
    e.preventDefault();
    if (!firstRoomId) {
      document.getElementById('rooms')?.scrollIntoView({ behavior: 'smooth' });
      return;
    }
    const q = new URLSearchParams({
      room_type_id: String(firstRoomId),
      check_in: checkIn,
      check_out: checkOut,
      adults: String(adults),
      children: String(children),
    });
    if (guestName.trim()) q.set('guest_name', guestName.trim());
    router.push(`/${slug}/book?${q.toString()}`);
  }

  const slide = SLIDES[index];

  return (
    <section className="guest-royal-home" id="book">
      <div className="guest-royal-home__shell">
        <div className="guest-royal-home__slider">
          <AnimatePresence mode="sync" initial={false}>
            <motion.div
              key={`slide-${index}`}
              className="guest-royal-home__slide"
              style={{ backgroundImage: `url(${slide.image})` }}
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -30 }}
              transition={{ duration: 0.75, ease: [0.22, 1, 0.36, 1] }}
            />
          </AnimatePresence>

          <div className="guest-royal-home__caption">
            <AnimatePresence mode="wait">
              <motion.div
                key={`caption-${index}`}
                initial={{ opacity: 0, y: 28 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -16 }}
                transition={{ duration: 0.55 }}
              >
                <h1>{slide.title}</h1>
                <div className="guest-royal-home__subtitle-group">
                  <div className="guest-royal-home__line" />
                  <h4>{slide.line1}</h4>
                  <h3>{slide.line2}</h3>
                </div>
                <Link href={`/${slug}/about`} className="guest-royal-home__outline-btn">
                  <span>Learn more</span>
                </Link>
              </motion.div>
            </AnimatePresence>
          </div>

          <div className="guest-royal-home__pager" aria-label="Hero slides">
            {SLIDES.map((_, i) => (
              <button
                key={i}
                type="button"
                className={i === index ? 'active' : undefined}
                aria-label={`Slide ${i + 1}`}
                onClick={() => goTo(i)}
              />
            ))}
          </div>

          <motion.aside
            className="guest-royal-home__booking"
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.7, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
          >
            <h3>Book a Room</h3>
            <p className="guest-royal-home__booking-intro">
              Check live availability at {hotelName} and continue to secure booking.
            </p>
            <form className="guest-royal-home__form" onSubmit={handleCheckAvailability}>
              <label className="guest-royal-home__label" htmlFor="royal-guest-name">
                Your name
              </label>
              <input
                id="royal-guest-name"
                className="guest-royal-home__input"
                type="text"
                placeholder="Your full name"
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
              />

              <label className="guest-royal-home__label" htmlFor="royal-check-in">
                Arrival
              </label>
              <input
                id="royal-check-in"
                className="guest-royal-home__input"
                type="date"
                value={checkIn}
                onChange={(e) => onCheckIn(e.target.value)}
                required
              />

              <label className="guest-royal-home__label" htmlFor="royal-check-out">
                Departure
              </label>
              <input
                id="royal-check-out"
                className="guest-royal-home__input"
                type="date"
                value={checkOut}
                onChange={(e) => onCheckOut(e.target.value)}
                required
              />

              <div className="guest-royal-home__row">
                <div>
                  <label className="guest-royal-home__label" htmlFor="royal-adults">
                    Adults
                  </label>
                  <select
                    id="royal-adults"
                    className="guest-royal-home__input"
                    value={adults}
                    onChange={(e) => onAdults(Number(e.target.value))}
                  >
                    {[1, 2, 3, 4, 5, 6].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="guest-royal-home__label" htmlFor="royal-children">
                    Children
                  </label>
                  <select
                    id="royal-children"
                    className="guest-royal-home__input"
                    value={children}
                    onChange={(e) => onChildren(Number(e.target.value))}
                  >
                    {[0, 1, 2, 3, 4, 5].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <button type="submit" className="guest-royal-home__submit">
                <span>Check availability</span>
              </button>
            </form>
          </motion.aside>
        </div>
      </div>
    </section>
  );
}
