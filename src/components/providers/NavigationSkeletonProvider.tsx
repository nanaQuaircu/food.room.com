'use client';

import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';

type Ctx = {
  show: (label?: string) => void;
  hide: () => void;
};

const NavigationSkeletonContext = createContext<Ctx | null>(null);

export function useNavigationSkeleton() {
  const ctx = useContext(NavigationSkeletonContext);
  if (!ctx) {
    return { show: () => undefined, hide: () => undefined };
  }
  return ctx;
}

/**
 * Soft navigations should feel like an SPA — no full-page skeleton overlay.
 * Kept as a no-op provider so existing hooks still work.
 */
export default function NavigationSkeletonProvider({ children }: { children: ReactNode }) {
  const show = useCallback((_label?: string) => {
    /* intentionally empty — avoid full-page preloaders on Link navigation */
  }, []);
  const hide = useCallback(() => undefined, []);
  const value = useMemo(() => ({ show, hide }), [show, hide]);

  return (
    <NavigationSkeletonContext.Provider value={value}>{children}</NavigationSkeletonContext.Provider>
  );
}
