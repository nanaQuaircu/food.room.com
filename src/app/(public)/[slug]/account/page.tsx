import GuestAccountModule from '@/components/guest/GuestAccountModule';

type Props = { params: Promise<{ slug: string }> };

export default async function GuestAccountPage({ params }: Props) {
  const { slug } = await params;
  return <GuestAccountModule slug={slug} />;
}
