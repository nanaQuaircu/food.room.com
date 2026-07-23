'use client';

import { useEffect } from 'react';

/** Hide theme preloader without jQuery DOM removal (React-safe). */
export default function GuestPalatinScripts() {
  useEffect(() => {
    const hide = () => {
      document.querySelectorAll('.preloader').forEach((el) => {
        el.classList.add('palatin-preloader-done');
      });
    };
    hide();
    const t = window.setTimeout(hide, 300);
    return () => window.clearTimeout(t);
  }, []);

  return null;
}
