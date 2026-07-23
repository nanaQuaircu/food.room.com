import { NextRequest } from 'next/server';
import { apiFail, apiOk } from '@/lib/api/json';
import { requirePublicTenant } from '@/lib/public/require-public-tenant';
import { getHubtelRuntimeCredentials } from '@/lib/services/company-settings-service';
import { estimateHubtelDelivery } from '@/lib/services/hubtel-service';
import { getProperty } from '@/lib/services/hotel-service';

type Params = { params: Promise<{ slug: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  const { slug } = await params;
  const resolved = await requirePublicTenant(slug);
  if ('error' in resolved) return resolved.error;

  const address = String(request.nextUrl.searchParams.get('address') || '').trim();
  if (!address) return apiFail('address is required.');

  const creds = getHubtelRuntimeCredentials(resolved.ctx.company);
  if (!creds.enabled) return apiFail('Hubtel delivery is not configured.', 400);

  try {
    const property = (await getProperty(resolved.ctx.db, resolved.ctx.propertyId)) as
      | { address?: string | null; phone?: string | null }
      | undefined;

    const quote = await estimateHubtelDelivery({
      address,
      creds: {
        ...creds,
        pickupAddress: creds.pickupAddress || property?.address || '',
        pickupPhone: creds.pickupPhone || property?.phone || '',
      },
    });
    return apiOk(quote);
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : 'Failed to quote delivery.';
    return apiFail(message, 400);
  }
}
