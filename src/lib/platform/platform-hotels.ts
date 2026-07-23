import { queryCentral, executeCentral, createServerConnection, getCentralDbConfig } from '@/lib/db/central';
import type { Company, CompanyStatus } from '@/lib/db/types';
import { slugify } from '@/lib/auth/credentials';
import { companyToDbConfig } from '@/lib/tenant/tenant-service';
import { resetUserPassword } from '@/lib/tenant/user-service';
import { queryTenant } from '@/lib/db/tenant';
import { DEFAULT_PASSWORD } from '@/lib/config';

export type PlatformHotelListItem = {
  id: number;
  name: string;
  slug: string;
  status: CompanyStatus;
  db_name: string;
  created_at: string;
  plan_name: string | null;
  subscription_status: string | null;
};

export type PlatformHotelDetail = PlatformHotelListItem & {
  owner_name: string | null;
  owner_email: string | null;
  plan_id: number | null;
};

export async function getCompanyById(id: number): Promise<Company | null> {
  const rows = await queryCentral<Company[]>(
    `SELECT id, name, slug, db_host, db_name, db_user, db_pass, status, logo_path, settings
     FROM companies WHERE id = :id LIMIT 1`,
    { id }
  );
  return rows[0] ?? null;
}

export async function listPlatformHotelsDetailed(): Promise<PlatformHotelListItem[]> {
  return queryCentral<PlatformHotelListItem[]>(
    `SELECT c.id, c.name, c.slug, c.status, c.db_name, c.created_at,
            sp.name AS plan_name, cs.subscription_status
     FROM companies c
     LEFT JOIN company_subscriptions cs ON cs.company_id = c.id
     LEFT JOIN subscription_plans sp ON sp.id = cs.plan_id
     ORDER BY c.name`
  );
}

export async function getPlatformHotelDetail(id: number): Promise<PlatformHotelDetail | null> {
  const rows = await queryCentral<PlatformHotelDetail[]>(
    `SELECT c.id, c.name, c.slug, c.status, c.db_name, c.created_at,
            sp.name AS plan_name, cs.subscription_status, cs.plan_id,
            NULL AS owner_name, NULL AS owner_email
     FROM companies c
     LEFT JOIN company_subscriptions cs ON cs.company_id = c.id
     LEFT JOIN subscription_plans sp ON sp.id = cs.plan_id
     WHERE c.id = :id
     LIMIT 1`,
    { id }
  );
  const hotel = rows[0];
  if (!hotel) return null;

  const db = companyToDbConfig(hotel as unknown as Company);
  const owners = await queryTenant<Array<{ name: string; email: string }>>(
    db,
    `SELECT name, email FROM users WHERE role = 'owner' ORDER BY id ASC LIMIT 1`
  );
  const owner = owners[0];
  return {
    ...hotel,
    owner_name: owner?.name ?? null,
    owner_email: owner?.email ?? null,
  };
}

async function syncSubscriptionStatus(companyId: number, status: CompanyStatus) {
  if (status === 'active') {
    await executeCentral(
      `UPDATE company_subscriptions
       SET subscription_status = 'active',
           trial_ends_at = NULL,
           current_period_end = COALESCE(current_period_end, DATE_ADD(CURDATE(), INTERVAL 1 MONTH))
       WHERE company_id = :companyId`,
      { companyId }
    );
    return;
  }

  const subscriptionStatus = status === 'trial' ? 'trialing' : 'suspended';

  await executeCentral(
    `UPDATE company_subscriptions
     SET subscription_status = :subscriptionStatus
     WHERE company_id = :companyId`,
    { companyId, subscriptionStatus }
  );
}

export async function updatePlatformHotel(
  id: number,
  input: { name?: string; slug?: string; status?: CompanyStatus }
) {
  const company = await getCompanyById(id);
  if (!company) {
    throw new Error('Hotel not found.');
  }

  const name = input.name?.trim() || company.name;
  const slug = input.slug ? slugify(input.slug) : company.slug;
  const status = input.status ?? company.status;

  if (!name) {
    throw new Error('Hotel name is required.');
  }

  const slugRows = await queryCentral<Array<{ id: number }>>(
    `SELECT id FROM companies WHERE slug = :slug AND id <> :id LIMIT 1`,
    { slug, id }
  );
  if (slugRows[0]) {
    throw new Error(`Slug "${slug}" is already used by another hotel.`);
  }

  await executeCentral(
    `UPDATE companies SET name = :name, slug = :slug, status = :status WHERE id = :id`,
    { id, name, slug, status }
  );
  await syncSubscriptionStatus(id, status);
}

export async function suspendPlatformHotel(id: number) {
  await updatePlatformHotel(id, { status: 'suspended' });
}

export async function resetPlatformHotelOwnerPassword(id: number) {
  const company = await getCompanyById(id);
  if (!company) {
    throw new Error('Hotel not found.');
  }

  const db = companyToDbConfig(company);
  const owners = await queryTenant<Array<{ id: number }>>(
    db,
    `SELECT id FROM users WHERE role = 'owner' ORDER BY id ASC LIMIT 1`
  );
  const owner = owners[0];
  if (!owner) {
    throw new Error('No owner account found for this hotel.');
  }

  await resetUserPassword(db, owner.id);
  return DEFAULT_PASSWORD;
}

export async function deletePlatformHotel(id: number) {
  const company = await getCompanyById(id);
  if (!company) {
    throw new Error('Hotel not found.');
  }

  await executeCentral(`DELETE FROM companies WHERE id = :id`, { id });

  const config = getCentralDbConfig();
  const conn = await createServerConnection({ ...config, database: '' });
  try {
    const safe = company.db_name.replace(/`/g, '``');
    await conn.query(`DROP DATABASE IF EXISTS \`${safe}\``);
  } finally {
    await conn.end();
  }
}
