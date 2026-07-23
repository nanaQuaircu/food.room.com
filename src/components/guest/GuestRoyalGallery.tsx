'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';

/** Real property photos — TemplateMonster `site/images` gallery files are stubs. */
const ITEMS = [
  {
    thumb: '/guest/hero/pool.jpg',
    full: '/guest/hero/pool.jpg',
    tall: true,
    likes: 346,
    views: 220,
  },
  {
    thumb: '/palatin/img/bg-img/5.jpg',
    full: '/palatin/img/bg-img/5.jpg',
    tall: false,
    likes: 312,
    views: 198,
  },
  {
    thumb: '/guest/hero/bar.jpg',
    full: '/guest/hero/bar.jpg',
    tall: true,
    likes: 401,
    views: 267,
  },
  {
    thumb: '/guest/hero/exterior-day.jpg',
    full: '/guest/hero/exterior-day.jpg',
    tall: false,
    likes: 288,
    views: 176,
  },
  {
    thumb: '/palatin/img/bg-img/7.jpg',
    full: '/palatin/img/bg-img/7.jpg',
    tall: false,
    likes: 255,
    views: 149,
  },
  {
    thumb: '/guest/hero/exterior-night.jpg',
    full: '/guest/hero/exterior-night.jpg',
    tall: false,
    likes: 374,
    views: 241,
  },
] as const;

type Props = {
  slug: string;
  hotelName: string;
};

/**
 * Royal Villas–style masonry gallery for the guest home.
 */
export default function GuestRoyalGallery({ slug, hotelName }: Props) {
  const [lightbox, setLightbox] = useState<number | null>(null);

  return (
    <section className="guest-royal-gallery" id="gallery" aria-label={`${hotelName} gallery`}>
      <div className="guest-royal-gallery__shell">
        <div className="guest-royal-gallery__head">
          <h3>Our Gallery</h3>
          <Link href={`/${slug}/about`} className="guest-royal-gallery__see-all">
            See All Photos
          </Link>
        </div>
        <hr className="guest-royal-gallery__rule" />

        <div className="guest-royal-gallery__grid">
          {ITEMS.map((item, i) => (
            <motion.button
              key={item.thumb}
              type="button"
              className={`guest-royal-gallery__item${item.tall ? ' is-tall' : ''}`}
              initial={{ opacity: 0, y: 28 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ duration: 0.5, delay: (i % 4) * 0.08 }}
              onClick={() => setLightbox(i)}
              aria-label={`Open gallery photo ${i + 1}`}
            >
              <img src={item.thumb} alt="" loading="lazy" />
              <span className="guest-royal-gallery__caption">
                <span className="guest-royal-gallery__stat">
                  <i className="fa fa-thumbs-o-up" aria-hidden="true" /> {item.likes}
                </span>
                <span className="guest-royal-gallery__stat">
                  <i className="fa fa-eye" aria-hidden="true" /> {item.views}
                </span>
              </span>
            </motion.button>
          ))}
        </div>
      </div>

      <AnimatePresence>
        {lightbox != null ? (
          <motion.div
            className="guest-royal-gallery__lightbox"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setLightbox(null)}
            role="dialog"
            aria-modal="true"
            aria-label="Gallery photo"
          >
            <button
              type="button"
              className="guest-royal-gallery__lightbox-close"
              aria-label="Close"
              onClick={() => setLightbox(null)}
            >
              ×
            </button>
            <motion.img
              key={ITEMS[lightbox].full}
              src={ITEMS[lightbox].full}
              alt=""
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
            />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
}
