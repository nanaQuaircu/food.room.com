'use client';

import type { ReactNode } from 'react';

/** Lightweight page enter — CSS handles motion; no artificial wait before content is “ready”. */
export default function AnimatedPage({ pageKey, children }: { pageKey: string; children: ReactNode }) {
  return (
    <div className="premium-page-view premium-page-view--ready" data-page={pageKey}>
      {children}
    </div>
  );
}
