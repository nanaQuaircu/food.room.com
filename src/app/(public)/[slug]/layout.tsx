import type { Metadata } from 'next';
import GuestBottomNav from '@/components/guest/GuestBottomNav';
import GuestChatWidget from '@/components/guest/GuestChatWidget';
import GuestPalatinScripts from '@/components/guest/GuestPalatinScripts';
import GuestProviders from '@/components/guest/GuestProviders';
import GuestPwaRegister from '@/components/guest/GuestPwaRegister';
import GuestSiteFooter from '@/components/guest/GuestSiteFooter';
import GuestSiteHeader from '@/components/guest/GuestSiteHeader';
import { resolvePublicTenant } from '@/lib/public/resolve-tenant';
import { getPublicPropertyProfile } from '@/lib/services/public-guest-service';
import { getSession } from '@/lib/tenant/session';
import '@/styles/guest.css';

type Props = {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const ctx = await resolvePublicTenant(slug);
  if (!ctx) {
    return { title: 'Hotel not found' };
  }
  const profile = await getPublicPropertyProfile(ctx.db, ctx.propertyId, slug, ctx.branding.logo_url);
  const title = profile?.name || ctx.company.name;
  const description = profile?.address
    ? `Book your stay at ${title}. ${profile.address}`
    : `Book rooms, dining, and manage your stay at ${title}.`;

  return {
    title: `${title} — Book Direct`,
    description,
    manifest: '/manifest.webmanifest',
    themeColor: '#cb8670',
    appleWebApp: { capable: true, statusBarStyle: 'default', title },
    openGraph: {
      title,
      description,
      type: 'website',
      siteName: title,
    },
  };
}

export default async function GuestLayout({ children, params }: Props) {
  const { slug } = await params;
  const ctx = await resolvePublicTenant(slug);
  const profile = ctx
    ? await getPublicPropertyProfile(ctx.db, ctx.propertyId, slug, ctx.branding.logo_url)
    : null;

  const session = await getSession();
  const guestSession = session?.type === 'guest' && session.companySlug === slug ? session : null;
  const initialGuest = guestSession
    ? {
        email: guestSession.userEmail || '',
        name: guestSession.userName || '',
        guestId: guestSession.guestId || 0,
      }
    : null;

  return (
    <div className="guest-shell">
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&display=swap"
      />
      <link rel="stylesheet" href="/palatin/style.css" />
      <div className="preloader d-flex align-items-center justify-content-center">
        <div className="cssload-container">
          <div className="cssload-loading">
            <i></i>
            <i></i>
            <i></i>
            <i></i>
          </div>
        </div>
      </div>
      <GuestProviders slug={slug} initialGuest={initialGuest}>
        <GuestSiteHeader slug={slug} profile={profile} guestSession={guestSession} />
        <main>{children}</main>
        <GuestSiteFooter slug={slug} profile={profile} />
        <GuestBottomNav slug={slug} />
        {profile ? (
          <GuestChatWidget slug={slug} hotelName={profile.name || ctx?.company.name || 'Hotel'} />
        ) : null}
        <GuestPalatinScripts />
        <GuestPwaRegister />
      </GuestProviders>
    </div>
  );
}
