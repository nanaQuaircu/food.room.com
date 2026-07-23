import GuestAboutModule from '@/components/guest/GuestAboutModule';

type Props = { params: Promise<{ slug: string }> };

export default async function GuestAboutPage({ params }: Props) {
  const { slug } = await params;
  return <GuestAboutModule slug={slug} />;
}
