import { requireTenant, isTenantContext } from '@/lib/api/tenant-context';
import { apiOk, apiFail } from '@/lib/api/json';
import {
  getCompanyBySessionId,
  getPaystackRuntimeCredentials,
} from '@/lib/services/company-settings-service';

/** Public Paystack config for client checkout (no secret keys). */
export async function GET() {
  const ctx = await requireTenant();
  if (!isTenantContext(ctx)) return ctx;

  const companyId = ctx.session.companyId;
  if (!companyId) return apiFail('Hotel context missing.', 400);

  try {
    const company = await getCompanyBySessionId(companyId);
    if (!company) return apiFail('Hotel not found.', 404);

    const creds = getPaystackRuntimeCredentials(company);
    return apiOk({
      enabled: creds.enabled && Boolean(creds.publicKey) && Boolean(creds.secretKey),
      publicKey: creds.publicKey,
      mode: creds.mode,
    });
  } catch (e) {
    console.error(e);
    return apiFail('Failed to load Paystack configuration', 500);
  }
}
