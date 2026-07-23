import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/tenant/session';
import PlatformHotelsClient from './PlatformHotelsClient';

export default async function PlatformHotelsPage() {
  const session = await getSession();
  if (!session || session.type !== 'platform') redirect('/login');
  if (session.mustChangePassword) redirect('/change-password');

  return (
    <Suspense fallback={<div className="p-4 text-muted">Loading hotels…</div>}>
      <PlatformHotelsClient />
    </Suspense>
  );
}
