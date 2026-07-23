'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

type CountdownPayload = {
  countdown: {
    shortLabel: string;
    detailLabel: string;
    daysRemaining: number;
    tone: 'success' | 'warning' | 'danger';
  } | null;
  plan_name: string | null;
};

export default function NavbarSubscriptionBadge({ canUpgrade = false }: { canUpgrade?: boolean }) {
  const [data, setData] = useState<CountdownPayload | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/subscription/summary');
      const json = await res.json();
      if (json.success) {
        setData(json.data ?? null);
      }
    } catch {
      setData(null);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(timer);
  }, [load]);

  if (!data?.countdown) return null;

  const { countdown } = data;
  const className = `premium-subscription-pill premium-subscription-pill--${countdown.tone}`;
  const content = (
    <>
      <i className="ti ti-hourglass-low" aria-hidden="true" />
      <span>{countdown.shortLabel}</span>
    </>
  );

  if (canUpgrade) {
    return (
      <li className="d-none d-md-block">
        <Link href="/settings?tab=subscription" className={className} title={countdown.detailLabel}>
          {content}
        </Link>
      </li>
    );
  }

  return (
    <li className="d-none d-md-block">
      <span className={className} title={countdown.detailLabel}>
        {content}
      </span>
    </li>
  );
}
