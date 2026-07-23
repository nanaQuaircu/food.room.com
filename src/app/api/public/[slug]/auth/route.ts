import { NextRequest } from 'next/server';
import { apiOk, apiFail } from '@/lib/api/json';
import { requirePublicTenant } from '@/lib/public/require-public-tenant';
import {
  loginGuestAccount,
  registerGuestAccount,
  resendGuestSignupOtp,
  verifyGuestSignupOtp,
} from '@/lib/services/guest-auth-service';
import { createGuestSession } from '@/lib/guest/guest-session';
import { destroySession } from '@/lib/tenant/session';
import { getPublicPropertyProfile } from '@/lib/services/public-guest-service';

type Params = { params: Promise<{ slug: string }> };

async function hotelNameFor(ctx: {
  db: Parameters<typeof getPublicPropertyProfile>[0];
  propertyId: number;
  company: { id: number; name: string; slug: string };
  branding: { logo_url: string | null };
}) {
  const profile = await getPublicPropertyProfile(
    ctx.db,
    ctx.propertyId,
    ctx.company.slug,
    ctx.branding.logo_url
  );
  return profile?.name?.trim() || ctx.company.name;
}

export async function POST(request: NextRequest, { params }: Params) {
  const { slug } = await params;
  const resolved = await requirePublicTenant(slug);
  if ('error' in resolved) return resolved.error;

  try {
    const body = await request.json();
    const action = String(body.action || 'login').trim();

    if (action === 'logout') {
      await destroySession();
      return apiOk({}, 'Signed out.');
    }

    if (action === 'register') {
      const hotelName = await hotelNameFor(resolved.ctx);
      const account = await registerGuestAccount(
        resolved.ctx.db,
        {
          first_name: String(body.first_name || '').trim(),
          last_name: String(body.last_name || '').trim(),
          email: String(body.email || '').trim(),
          phone: body.phone ? String(body.phone) : undefined,
          password: String(body.password || ''),
        },
        { companyId: resolved.ctx.company.id, hotelName }
      );
      return apiOk(
        { email: account.email, name: account.name, requires_otp: true },
        'Account created. Enter the verification code sent to your email.'
      );
    }

    if (action === 'verify_otp') {
      const account = await verifyGuestSignupOtp(
        resolved.ctx.db,
        String(body.email || '').trim(),
        String(body.otp || '').trim()
      );
      await createGuestSession(resolved.ctx.company, resolved.ctx.propertyId, {
        accountId: account.accountId,
        guestId: account.guestId,
        email: account.email,
        name: account.name,
      });
      return apiOk({ email: account.email, name: account.name }, 'Email verified. Signed in.');
    }

    if (action === 'resend_otp') {
      const hotelName = await hotelNameFor(resolved.ctx);
      const result = await resendGuestSignupOtp(
        resolved.ctx.db,
        String(body.email || '').trim(),
        { companyId: resolved.ctx.company.id, hotelName }
      );
      return apiOk({ email: result.email, requires_otp: true }, 'A new verification code was sent.');
    }

    const email = String(body.email || '').trim();
    const password = String(body.password || '');
    const account = await loginGuestAccount(resolved.ctx.db, email, password);
    if (!account) return apiFail('Invalid email or password.', 401);

    if (account.requiresOtp) {
      const hotelName = await hotelNameFor(resolved.ctx);
      await resendGuestSignupOtp(resolved.ctx.db, email, {
        companyId: resolved.ctx.company.id,
        hotelName,
      });
      return apiOk(
        { email: account.email, name: account.name, requires_otp: true },
        'Please verify your email. A new code was sent.'
      );
    }

    await createGuestSession(resolved.ctx.company, resolved.ctx.propertyId, account);
    return apiOk({ email: account.email, name: account.name }, 'Signed in.');
  } catch (e) {
    console.error(e);
    const message = e instanceof Error ? e.message : 'Authentication failed.';
    return apiFail(message, 400);
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const { slug } = await params;
  const resolved = await requirePublicTenant(slug);
  if ('error' in resolved) return resolved.error;
  await destroySession();
  return apiOk({}, 'Signed out.');
}
