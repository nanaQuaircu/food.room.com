'use client';

import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { GUEST_HERO_IMAGES, GUEST_HERO_INTERVAL_MS } from '@/lib/guest/hero-images';

type Props = {
  title?: string;
  subtitle?: string;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
};

/** Compact page hero — infinite hotel image shuffle every 3s. */
export default function GuestPageHero({ title, subtitle, className = '', style, children }: Props) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % GUEST_HERO_IMAGES.length);
    }, GUEST_HERO_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, []);

  // Prefetch next slide for snappier / sharper swaps
  useEffect(() => {
    const next = GUEST_HERO_IMAGES[(index + 1) % GUEST_HERO_IMAGES.length];
    const img = new window.Image();
    img.src = next;
  }, [index]);

  return (
    <section
      className={`breadcumb-area guest-page-hero d-flex align-items-center justify-content-center ${className}`.trim()}
      style={{ position: 'relative', overflow: 'hidden', ...style }}
    >
      <AnimatePresence mode="sync" initial={false}>
        <motion.img
          key={GUEST_HERO_IMAGES[index]}
          src={GUEST_HERO_IMAGES[index]}
          alt=""
          className="guest-page-hero__bg-img"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.65, ease: 'easeInOut' }}
          draggable={false}
        />
      </AnimatePresence>
      <div className="guest-page-hero__veil" />
      <motion.div
        className={title ? 'bradcumbContent' : undefined}
        style={{ position: 'relative', zIndex: 2, width: title ? undefined : '100%' }}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: 'easeOut' }}
      >
        {title ? <h2>{title}</h2> : null}
        {subtitle ? <p className="guest-page-hero__sub">{subtitle}</p> : null}
        {children}
      </motion.div>
    </section>
  );
}
