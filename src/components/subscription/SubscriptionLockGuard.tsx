'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { isSubscriptionBypassPath } from '@/lib/subscription/bypass-paths';

/** Redirects expired/suspended hotels to Settings so they can renew. */
export default function SubscriptionLockGuard({ locked }: { locked: boolean }) {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!locked) return;
    if (isSubscriptionBypassPath(pathname)) return;
    router.replace('/settings?tab=subscription&locked=1');
  }, [locked, pathname, router]);

  return null;
}
