import { NextRequest } from 'next/server';
import { requireTenant, isTenantContext } from '@/lib/api/tenant-context';
import { apiOk, apiFail } from '@/lib/api/json';
import {
  getCompanyBySessionId,
  getPaystackRuntimeCredentials,
} from '@/lib/services/company-settings-service';
import {
  createBillingPaystackReference,
  createFrontDeskPaystackReference,
  paystackInitialize,
} from '@/lib/payments/paystack-service';

export async function POST(request: NextRequest) {
  const ctx = await requireTenant();
  if (!isTenantContext(ctx)) return ctx;

  const companyId = ctx.session.companyId;
  if (!companyId) return apiFail('Hotel context missing.', 400);

  try {
    const body = await request.json();
    const email = String(body.email || '').trim();
    const amount = Number(body.amount);

    if (!email || !email.includes('@')) {
      return apiFail('A valid guest email is required for Paystack payments.');
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return apiFail('A valid payment amount is required.');
    }

    const company = await getCompanyBySessionId(companyId);
    if (!company) return apiFail('Hotel not found.', 404);

    const creds = getPaystackRuntimeCredentials(company);
    if (!creds.enabled || !creds.secretKey || !creds.publicKey) {
      return apiFail('Paystack is not configured. Enable it in Settings → Integrations.', 400);
    }

    const source = String(body.source || 'front_desk').trim();
    const folioId = body.folio_id ? Number(body.folio_id) : undefined;

    if (source === 'billing' && !folioId) {
      return apiFail('folio_id is required for billing Paystack payments.');
    }

    const reference =
      source === 'billing'
        ? createBillingPaystackReference(ctx.propertyId, folioId!)
        : createFrontDeskPaystackReference(ctx.propertyId);

    const initialized = await paystackInitialize(creds.secretKey, {
      email,
      amount,
      reference,
      metadata: {
        property_id: ctx.propertyId,
        user_id: ctx.session.userId,
        source: source === 'billing' ? 'billing_folio' : 'front_desk_walk_in',
        ...(folioId ? { folio_id: folioId } : {}),
      },
    });

    return apiOk({
      reference: initialized.reference,
      access_code: initialized.access_code,
      public_key: creds.publicKey,
      amount,
      email,
    });
  } catch (e) {
    console.error(e);
    const message = e instanceof Error ? e.message : 'Failed to initialize Paystack payment';
    return apiFail(message, 500);
  }
}
