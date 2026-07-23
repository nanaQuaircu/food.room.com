import { Suspense } from 'react';
import GuestConfirmationModule from '@/components/guest/GuestConfirmationModule';

type Props = { params: Promise<{ slug: string }> };

export default async function GuestConfirmationPage({ params }: Props) {
  const { slug } = await params;
  return (
    <Suspense fallback={<p className="p-3 text-muted">Loading…</p>}>
      <GuestConfirmationModule slug={slug} />
    </Suspense>
  );
}
