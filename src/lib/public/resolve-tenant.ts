import type { DbConfig } from '@/lib/db/central';
import type { Company } from '@/lib/db/types';
import { queryTenant } from '@/lib/db/tenant';
import {
  companyBranding,
  companyToDbConfig,
  findCompanyBySlug,
} from '@/lib/tenant/tenant-service';

export type PublicTenantContext = {
  company: Company;
  db: DbConfig;
  propertyId: number;
  branding: { id: number; name: string; slug: string; logo_url: string | null };
};

export async function resolvePublicTenant(slug: string): Promise<PublicTenantContext | null> {
  const company = await findCompanyBySlug(slug);
  if (!company || !['active', 'trial'].includes(company.status)) return null;

  const db = companyToDbConfig(company);
  const properties = await queryTenant<Array<{ id: number }>>(
    db,
    `SELECT id FROM properties WHERE is_active = 1 ORDER BY id LIMIT 1`
  );
  const propertyId = properties[0]?.id;
  if (!propertyId) return null;

  return {
    company,
    db,
    propertyId,
    branding: companyBranding(company),
  };
}
