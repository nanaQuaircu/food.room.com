'use client';

import { createContext, useContext, type ReactNode } from 'react';

export type TenantShellSession = {
  hotelName: string;
  hotelLogoUrl?: string | null;
  userName: string;
  userAvatarUrl?: string | null;
  userRole: string;
};

const TenantSessionContext = createContext<TenantShellSession | null>(null);

export function TenantSessionProvider({
  value,
  children,
}: {
  value: TenantShellSession;
  children: ReactNode;
}) {
  return <TenantSessionContext.Provider value={value}>{children}</TenantSessionContext.Provider>;
}

export function useTenantSession() {
  const ctx = useContext(TenantSessionContext);
  if (!ctx) {
    throw new Error('useTenantSession must be used within TenantSessionProvider');
  }
  return ctx;
}

export function useTenantSessionOptional() {
  return useContext(TenantSessionContext);
}
