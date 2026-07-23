import GuestMenuModule from '@/components/guest/GuestMenuModule';
import { getSession } from '@/lib/tenant/session';

type Props = { params: Promise<{ slug: string }> };

export default async function GuestMenuPage({ params }: Props) {
  const { slug } = await params;
  const session = await getSession();
  const guestSession =
    session?.type === 'guest' && session.companySlug === slug
      ? {
          email: session.userEmail || '',
          name: session.userName || '',
          guestId: session.guestId || 0,
        }
      : null;

  return <GuestMenuModule slug={slug} initialGuest={guestSession} />;
}
