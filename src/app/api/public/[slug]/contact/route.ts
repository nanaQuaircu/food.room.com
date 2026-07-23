import { NextRequest } from 'next/server';
import { apiOk, apiFail } from '@/lib/api/json';
import { requirePublicTenant } from '@/lib/public/require-public-tenant';
import { saveGuestContactInquiry } from '@/lib/services/guest-booking-extras';
import { sendContactAckToGuest, sendContactInquiryToHotel } from '@/lib/services/contact-notify';

type Params = { params: Promise<{ slug: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  const { slug } = await params;
  const resolved = await requirePublicTenant(slug);
  if ('error' in resolved) return resolved.error;

  try {
    const body = await request.json();
    const name = String(body.name || '').trim();
    const email = String(body.email || '').trim();
    const subject = String(body.subject || 'Website inquiry').trim();
    const message = String(body.message || '').trim();

    if (!name || !email || !message) {
      return apiFail('name, email, and message are required.');
    }

    await saveGuestContactInquiry(resolved.ctx.db, resolved.ctx.propertyId, {
      name,
      email,
      subject,
      message,
    });

    const { getPublicPropertyProfile } = await import('@/lib/services/public-guest-service');
    const profile = await getPublicPropertyProfile(
      resolved.ctx.db,
      resolved.ctx.propertyId,
      slug,
      resolved.ctx.branding.logo_url
    );
    const hotelEmail = profile?.email;
    if (hotelEmail) {
      try {
        await sendContactInquiryToHotel(resolved.ctx.company.id, hotelEmail, {
          name,
          email,
          subject,
          message,
          hotelName: resolved.ctx.company.name,
        });
      } catch (e) {
        console.warn('Contact email to hotel failed:', e);
      }
    }

    try {
      await sendContactAckToGuest(resolved.ctx.company.id, {
        name,
        email,
        hotelName: resolved.ctx.company.name,
      });
    } catch {
      /* optional */
    }

    return apiOk({}, 'Message sent.');
  } catch (e) {
    console.error(e);
    return apiFail('Failed to send message.', 500);
  }
}
