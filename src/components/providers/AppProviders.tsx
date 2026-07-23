'use client';

import NavigationSkeletonProvider from '@/components/providers/NavigationSkeletonProvider';
import PostLoginSkeletonGate from '@/components/providers/PostLoginSkeletonGate';
import { ToastProvider } from '@/components/ui/ToastProvider';
import { ConfirmProvider } from '@/components/ui/ConfirmProvider';

export default function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <ConfirmProvider>
        <NavigationSkeletonProvider>
          <PostLoginSkeletonGate />
          {children}
        </NavigationSkeletonProvider>
      </ConfirmProvider>
    </ToastProvider>
  );
}
