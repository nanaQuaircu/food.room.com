import GuestContactModule from '@/components/guest/GuestContactModule';

type Props = { params: Promise<{ slug: string }> };

export default async function GuestContactPage({ params }: Props) {
  const { slug } = await params;
  return <GuestContactModule slug={slug} />;
}
