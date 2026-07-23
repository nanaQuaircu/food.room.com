import GuestOrdersModule from '@/components/guest/GuestOrdersModule';

type Props = { params: Promise<{ slug: string }> };

export default async function GuestOrdersPage({ params }: Props) {
  const { slug } = await params;
  return <GuestOrdersModule slug={slug} />;
}
