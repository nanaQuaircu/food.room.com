import { NextRequest } from 'next/server';
import { apiOk, apiFail } from '@/lib/api/json';
import { requirePublicTenant } from '@/lib/public/require-public-tenant';
import { getSession } from '@/lib/tenant/session';
import { getGuestProfile, updateGuestProfile } from '@/lib/services/public-guest-service';

type Params = { params: Promise<{ slug: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  const { slug } = await params;
  const resolved = await requirePublicTenant(slug);
  if ('error' in resolved) return resolved.error;

  const session = await getSession();
  if (!session || session.type !== 'guest' || session.companySlug !== slug || !session.guestId) {
    return apiFail('Sign in to view your profile.', 401);
  }

  try {
    const profile = await getGuestProfile(resolved.ctx.db, session.guestId);
    if (!profile) return apiFail('Guest profile not found.', 404);
    return apiOk(profile);
  } catch (e) {
    console.error(e);
    return apiFail('Failed to load profile.', 500);
  }
}

export async function POST(request: NextRequest, { params }: Params) {
  const { slug } = await params;
  const resolved = await requirePublicTenant(slug);
  if ('error' in resolved) return resolved.error;

  const session = await getSession();
  if (!session || session.type !== 'guest' || session.companySlug !== slug || !session.guestId) {
    return apiFail('Sign in to update your profile.', 401);
  }

  try {
    const body = await request.json();
    const firstName = String(body.first_name || '').trim();
    const lastName = String(body.last_name || '').trim();
    const phone = String(body.phone || '').trim();
    const preferredRoomNotes = String(body.preferred_room_notes || '').trim();

    if (!firstName || !lastName) {
      return apiFail('First name and last name are required.');
    }

    await updateGuestProfile(
      resolved.ctx.db,
      session.guestId,
      firstName,
      lastName,
      phone,
      preferredRoomNotes
    );

    // Optional: Update the display name in the session
    const { updateSession } = await import('@/lib/tenant/session');
    await updateSession({ userName: `${firstName} ${lastName}`.trim() });

    return apiOk({}, 'Profile updated successfully.');
  } catch (e) {
    console.error(e);
    return apiFail('Failed to update profile.', 500);
  }
}
