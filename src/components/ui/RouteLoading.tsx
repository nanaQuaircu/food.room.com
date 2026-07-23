import SkeletonPreloader from '@/components/ui/SkeletonPreloader';

/** Shared Next.js `loading.tsx` body for tenant routes. */
export default function RouteLoading({ label = 'Loading…' }: { label?: string }) {
  return <SkeletonPreloader label={label} />;
}
