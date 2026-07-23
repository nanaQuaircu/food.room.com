import { NextRequest } from 'next/server';
import { requireTenant, isTenantContext, requireTenantRoles } from '@/lib/api/tenant-context';
import { apiOk, apiFail } from '@/lib/api/json';
import { INTEGRATION_SETTINGS_ROLES } from '@/lib/roles';
import {
  getCompanyBySessionId,
  getIntegrationSettings,
  savePaystackSettings,
  saveSmsSettings,
  saveEmailSettings,
  saveHubtelSettings,
} from '@/lib/services/company-settings-service';

export async function GET() {
  const ctx = await requireTenant({ allowExpired: true });
  if (!isTenantContext(ctx)) return ctx;

  const denied = requireTenantRoles(ctx, INTEGRATION_SETTINGS_ROLES);
  if (denied) return denied;

  const companyId = ctx.session.companyId;
  if (!companyId) return apiFail('Hotel context missing.', 400);

  try {
    const company = await getCompanyBySessionId(companyId);
    if (!company) return apiFail('Hotel not found.', 404);
    return apiOk(getIntegrationSettings(company));
  } catch (e) {
    console.error(e);
    return apiFail('Failed to load integration settings', 500);
  }
}

export async function PATCH(request: NextRequest) {
  const ctx = await requireTenant({ allowExpired: true });
  if (!isTenantContext(ctx)) return ctx;

  const denied = requireTenantRoles(ctx, INTEGRATION_SETTINGS_ROLES);
  if (denied) return denied;

  const companyId = ctx.session.companyId;
  if (!companyId) return apiFail('Hotel context missing.', 400);

  try {
    const body = await request.json();
    const section = String(body.section || '').trim();

    if (section === 'paystack') {
      const message = await savePaystackSettings(companyId, body);
      const company = await getCompanyBySessionId(companyId);
      return apiOk(company ? getIntegrationSettings(company).paystack : null, message);
    }

    if (section === 'sms') {
      const message = await saveSmsSettings(companyId, body);
      const company = await getCompanyBySessionId(companyId);
      return apiOk(company ? getIntegrationSettings(company).sms : null, message);
    }

    if (section === 'email') {
      const message = await saveEmailSettings(companyId, body);
      const company = await getCompanyBySessionId(companyId);
      return apiOk(company ? getIntegrationSettings(company).email : null, message);
    }

    if (section === 'hubtel') {
      const message = await saveHubtelSettings(companyId, body);
      const company = await getCompanyBySessionId(companyId);
      return apiOk(company ? getIntegrationSettings(company).hubtel : null, message);
    }

    return apiFail('section must be paystack, sms, email, or hubtel');
  } catch (e) {
    console.error(e);
    const message = e instanceof Error ? e.message : 'Failed to save integration settings';
    return apiFail(message, 422);
  }
}
