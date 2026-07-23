import { createSession } from '@/lib/tenant/session';
import { companyBranding } from '@/lib/tenant/tenant-service';
import type { Company } from '@/lib/db/types';

export async function createGuestSession(
  company: Company,
  propertyId: number,
  account: { accountId: number; guestId: number; email: string; name: string }
) {
  const branding = companyBranding(company);
  await createSession({
    type: 'guest',
    userId: account.accountId,
    userName: account.name,
    userEmail: account.email,
    guestId: account.guestId,
    companyId: company.id,
    companyName: branding.name,
    companyLogoUrl: branding.logo_url,
    companySlug: company.slug,
    propertyId,
  });
}
