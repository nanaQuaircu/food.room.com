import GuestDiscoverModule from '@/components/guest/GuestDiscoverModule';
import { resolvePublicTenant } from '@/lib/public/resolve-tenant';
import {
  getPublicPropertyProfile,
  listPublicCatalogRooms,
} from '@/lib/services/public-guest-service';

type Props = { params: Promise<{ slug: string }> };

export default async function GuestDiscoverPage({ params }: Props) {
  const { slug } = await params;
  const ctx = await resolvePublicTenant(slug);
  const profile = ctx
    ? await getPublicPropertyProfile(ctx.db, ctx.propertyId, slug, ctx.branding.logo_url)
    : null;
  const rooms = ctx ? await listPublicCatalogRooms(ctx.db, ctx.propertyId) : [];

  return (
    <GuestDiscoverModule
      slug={slug}
      hotelName={profile?.name || 'Our Hotel'}
      address={profile?.address}
      phone={profile?.phone}
      email={profile?.email}
      currency={profile?.currency || 'GHS'}
      latitude={profile?.latitude}
      longitude={profile?.longitude}
      initialRooms={rooms}
    />
  );
}
