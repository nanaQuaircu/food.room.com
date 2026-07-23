import GuestTripsModule from '@/components/guest/GuestTripsModule';

type Props = { params: Promise<{ slug: string }> };

export default async function GuestTripsPage({ params }: Props) {
  const { slug } = await params;
  return <GuestTripsModule slug={slug} />;
}
