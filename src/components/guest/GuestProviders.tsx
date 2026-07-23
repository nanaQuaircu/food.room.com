'use client';

import { ToastProvider } from '@/components/ui/ToastProvider';
import { GuestCartProvider } from '@/components/guest/GuestCartContext';
import GuestCartDrawer from '@/components/guest/GuestCartDrawer';
import GuestFoodOrderTracker from '@/components/guest/GuestFoodOrderTracker';

export default function GuestProviders({
  slug,
  children,
  initialGuest = null,
}: {
  slug: string;
  children: React.ReactNode;
  initialGuest?: { email: string; name: string; guestId: number } | null;
}) {
  return (
    <ToastProvider>
      <GuestCartProvider slug={slug}>
        {children}
        <GuestCartDrawer slug={slug} initialGuest={initialGuest} />
        <GuestFoodOrderTracker slug={slug} />
      </GuestCartProvider>
    </ToastProvider>
  );
}
