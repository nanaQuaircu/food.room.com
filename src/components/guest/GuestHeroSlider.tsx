'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { GUEST_HERO_IMAGES, GUEST_HERO_INTERVAL_MS } from '@/lib/guest/hero-images';

const SLIDES = [
  {
    image: GUEST_HERO_IMAGES[0],
    eyebrow: 'Luxury Stay',
    title: 'The Vacation Heaven',
    ctaHref: '#rooms',
    ctaLabel: 'Explore Rooms',
  },
  {
    image: GUEST_HERO_IMAGES[1],
    eyebrow: 'Unforgettable Moments',
    title: 'A Place to Remember',
    ctaHref: '#book',
    ctaLabel: 'Book Your Stay',
  },
  {
    image: GUEST_HERO_IMAGES[2],
    eyebrow: 'Dining & Leisure',
    title: 'Enjoy Your Life',
    ctaHref: 'menu',
    ctaLabel: 'View Restaurant',
  },
  {
    image: GUEST_HERO_IMAGES[3],
    eyebrow: 'Evening Escape',
    title: 'Nights to Remember',
    ctaHref: '#rooms',
    ctaLabel: 'See Our Rooms',
  },
] as const;

const zoomIn = {
  initial: { opacity: 0, scale: 0.6 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.85 },
};

/** DGcom-style full-bleed carousel hero with hotel content. */
export default function GuestHeroSlider({
  hotelName,
  address,
  menuHref,
}: {
  hotelName: string;
  address?: string | null;
  menuHref: string;
}) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % SLIDES.length);
    }, GUEST_HERO_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, []);

  function goTo(i: number) {
    setIndex(((i % SLIDES.length) + SLIDES.length) % SLIDES.length);
  }

  const slide = SLIDES[index];
  const bodies = [
    `Welcome to ${hotelName}. Discover comfort, warmth, and an unforgettable stay tailored just for you.`,
    address
      ? `Located at ${address}. Reserve your preferred room online in minutes.`
      : 'Reserve your preferred room online and enjoy premium hospitality.',
    'Browse rooms, dine with us, and manage your trips — all from your guest account.',
    `Evenings at ${hotelName} — poolside, dining, and rooms that feel like home.`,
  ];
  const body = bodies[index] ?? bodies[0];
  const ctaHref = slide.ctaHref === 'menu' ? menuHref : slide.ctaHref;

  return (
    <section className="hero-area guest-dgcom-hero">
      <div className="guest-dgcom-carousel">
        <AnimatePresence mode="sync" initial={false}>
          <motion.img
            key={`bg-${index}`}
            src={slide.image}
            alt=""
            className="guest-dgcom-carousel__img"
            initial={{ opacity: 0, scale: 1.08 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.85, ease: [0.22, 1, 0.36, 1] }}
            draggable={false}
          />
        </AnimatePresence>

        <div className="guest-dgcom-carousel__caption">
          <div className="guest-dgcom-carousel__caption-inner">
            <AnimatePresence mode="wait">
              <motion.div
                key={`copy-${index}`}
                initial="initial"
                animate="animate"
                exit="exit"
                className="guest-dgcom-carousel__copy"
              >
                <motion.h4
                  className="guest-dgcom-carousel__eyebrow"
                  variants={zoomIn}
                  transition={{ duration: 0.55, ease: 'easeOut' }}
                >
                  {slide.eyebrow}
                </motion.h4>
                <motion.h1
                  className="guest-dgcom-carousel__title"
                  variants={zoomIn}
                  transition={{ duration: 0.7, ease: 'easeOut', delay: 0.08 }}
                >
                  {slide.title}
                </motion.h1>
                <motion.p
                  className="guest-dgcom-carousel__body"
                  variants={zoomIn}
                  transition={{ duration: 0.55, ease: 'easeOut', delay: 0.14 }}
                >
                  {body}
                </motion.p>
                <motion.div
                  variants={zoomIn}
                  transition={{ duration: 0.5, ease: 'easeOut', delay: 0.2 }}
                >
                  {ctaHref.startsWith('#') ? (
                    <a href={ctaHref} className="btn palatin-btn guest-dgcom-carousel__cta">
                      {slide.ctaLabel}
                    </a>
                  ) : (
                    <Link href={ctaHref} className="btn palatin-btn guest-dgcom-carousel__cta">
                      {slide.ctaLabel}
                    </Link>
                  )}
                </motion.div>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        <button
          type="button"
          className="guest-dgcom-carousel__control guest-dgcom-carousel__control--prev"
          aria-label="Previous slide"
          onClick={() => goTo(index - 1)}
        >
          <span aria-hidden="true">‹</span>
        </button>
        <button
          type="button"
          className="guest-dgcom-carousel__control guest-dgcom-carousel__control--next"
          aria-label="Next slide"
          onClick={() => goTo(index + 1)}
        >
          <span aria-hidden="true">›</span>
        </button>

        <div className="guest-dgcom-carousel__indicators" aria-label="Hero slides">
          {SLIDES.map((s, i) => (
            <button
              key={s.image}
              type="button"
              className={i === index ? 'active' : undefined}
              aria-label={`Slide ${i + 1}`}
              aria-current={i === index ? 'true' : undefined}
              onClick={() => goTo(i)}
            >
              <img src={s.image} alt="" />
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
