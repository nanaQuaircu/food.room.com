'use client';

import { useEffect } from 'react';

export default function GuestPwaRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    void navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .catch(() => {
        /* ignore registration errors in dev */
      });
  }, []);

  return null;
}
