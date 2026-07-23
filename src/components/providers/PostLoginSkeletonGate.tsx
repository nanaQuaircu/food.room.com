'use client';

import { useEffect, useState } from 'react';
import SkeletonPreloader from '@/components/ui/SkeletonPreloader';

const FLAG = 'pms_post_login_skeleton';

/**
 * Brief overlay only after hard navigation from login.
 * Soft in-app navigations never use a full-page preloader.
 */
export default function PostLoginSkeletonGate() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let flagged = false;
    try {
      flagged = sessionStorage.getItem(FLAG) === '1';
      if (flagged) sessionStorage.removeItem(FLAG);
    } catch {
      flagged = false;
    }

    if (!flagged) return;

    setOpen(true);
    const reduceMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    const timer = window.setTimeout(() => setOpen(false), reduceMotion ? 60 : 180);
    return () => window.clearTimeout(timer);
  }, []);

  if (!open) return null;
  return <SkeletonPreloader overlay label="Preparing your workspace…" />;
}
