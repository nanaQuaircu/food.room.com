import { Suspense } from 'react';
import GuestBookModule from '@/components/guest/GuestBookModule';

type Props = { params: Promise<{ slug: string }> };

export default async function GuestBookPage({ params }: Props) {
  const { slug } = await params;
  return (
    <Suspense fallback={<p className="p-3 text-muted">Loading…</p>}>
      <GuestBookModule slug={slug} />
    </Suspense>
  );
}
