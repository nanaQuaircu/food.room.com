import { NextRequest } from 'next/server';
import { requireTenant, isTenantContext } from '@/lib/api/tenant-context';
import { apiOk, apiFail } from '@/lib/api/json';
import {
  activateSubscriptionFromPayment,
  getPlatformPaystackCredentials,
  initializeSubscriptionPayment,
} from '@/lib/subscription/saas-paystack';
import { queryTenant } from '@/lib/db/tenant';

export async function GET() {
  const ctx = await requireTenant({ allowExpired: true });
  if (!isTenantContext(ctx)) return ctx;
  const creds = await getPlatformPaystackCredentials();
  return apiOk({
    enabled: creds.enabled,
    publicKey: creds.publicKey,
  });
}

export async function POST(request: NextRequest) {
  const ctx = await requireTenant({ allowExpired: true });
  if (!isTenantContext(ctx)) return ctx;
  try {
    if (ctx.session.userRole !== 'owner') {
      return apiFail('Only the hotel owner can change the subscription plan.', 403);
    }

    const body = await request.json();
    const planId = Number(body.plan_id);
    const action = String(body.action || 'initialize').trim();

    if (action === 'confirm') {
      const reference = String(body.reference || '').trim();
      if (!reference) return apiFail('reference is required');
      const result = await activateSubscriptionFromPayment(reference);
      if (!result.handled) return apiFail('Payment intent not found.');
      return apiOk(result, result.already ? 'Subscription already activated' : 'Subscription activated');
    }

    if (!planId) return apiFail('plan_id is required');

    const companyId = ctx.session.companyId;
    if (!companyId) return apiFail('Hotel context missing.', 400);

    let email = String(body.email || '').trim();
    if (!email) {
      const users = await queryTenant<Array<{ email: string }>>(
        ctx.db,
        `SELECT email FROM users WHERE id = :id LIMIT 1`,
        { id: ctx.session.userId }
      );
      email = users[0]?.email || '';
    }
    if (!email) return apiFail('A billing email is required for Paystack.');

    const data = await initializeSubscriptionPayment({
      companyId,
      planId,
      email,
    });
    return apiOk(data);
  } catch (e) {
    console.error(e);
    const message = e instanceof Error ? e.message : 'Failed to start subscription payment';
    return apiFail(message, 400);
  }
}
