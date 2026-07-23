import GuestRoomsListModule from '@/components/guest/GuestRoomsListModule';
import { resolvePublicTenant } from '@/lib/public/resolve-tenant';
import {
  getPublicPropertyProfile,
  listPublicCatalogRooms,
} from '@/lib/services/public-guest-service';

type Props = { params: Promise<{ slug: string }> };

export default async function GuestRoomsPage({ params }: Props) {
  const { slug } = await params;
  const ctx = await resolvePublicTenant(slug);
  const profile = ctx
    ? await getPublicPropertyProfile(ctx.db, ctx.propertyId, slug, ctx.branding.logo_url)
    : null;
  const rooms = ctx ? await listPublicCatalogRooms(ctx.db, ctx.propertyId) : [];

  return (
    <GuestRoomsListModule
      slug={slug}
      initialRooms={rooms}
      initialProfile={
        profile
          ? { name: profile.name, currency: profile.currency, address: profile.address }
          : null
      }
    />
  );
}
