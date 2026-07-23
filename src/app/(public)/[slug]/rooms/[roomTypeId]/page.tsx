import { Suspense } from 'react';
import GuestRoomDetailModule from '@/components/guest/GuestRoomDetailModule';
import { resolvePublicTenant } from '@/lib/public/resolve-tenant';
import {
  getPublicPropertyProfile,
  getPublicRoomDetails,
  getPublicRoomType,
  listPublicAvailableRooms,
} from '@/lib/services/public-guest-service';

type Props = {
  params: Promise<{ slug: string; roomTypeId: string }>;
  searchParams: Promise<{
    check_in?: string;
    check_out?: string;
    room_id?: string;
    adults?: string;
    children?: string;
  }>;
};

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDaysIso(iso: string, days: number) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default async function GuestRoomDetailPage({ params, searchParams }: Props) {
  const { slug, roomTypeId: roomTypeIdRaw } = await params;
  const sp = await searchParams;
  const roomTypeId = Number(roomTypeIdRaw);
  const preferredRoomId = Number(sp.room_id || 0) || null;
  const checkIn = sp.check_in || todayIso();
  const checkOut = sp.check_out || addDaysIso(checkIn, 2);

  const ctx = await resolvePublicTenant(slug);
  const profile = ctx
    ? await getPublicPropertyProfile(ctx.db, ctx.propertyId, slug, ctx.branding.logo_url)
    : null;
  const roomType =
    ctx && roomTypeId ? await getPublicRoomType(ctx.db, ctx.propertyId, roomTypeId) : null;
  const rooms =
    ctx && roomType
      ? await listPublicAvailableRooms(ctx.db, ctx.propertyId, roomTypeId, checkIn, checkOut)
      : [];
  const initialRoomDetails =
    ctx && preferredRoomId
      ? await getPublicRoomDetails(ctx.db, ctx.propertyId, preferredRoomId)
      : null;

  return (
    <Suspense fallback={<p className="guest-loading">Loading room…</p>}>
      <GuestRoomDetailModule
        slug={slug}
        roomTypeId={roomTypeId}
        initialRoomType={roomType}
        initialRooms={rooms}
        initialRoomDetails={initialRoomDetails}
        initialProfile={
          profile
            ? { name: profile.name, currency: profile.currency, address: profile.address }
            : null
        }
        initialCheckIn={checkIn}
        initialCheckOut={checkOut}
      />
    </Suspense>
  );
}
