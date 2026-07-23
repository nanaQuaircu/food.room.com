import { queryCentral, executeCentral, getDefaultTenantDbConfig, type DbConfig } from '@/lib/db/central';
import type { Company } from '@/lib/db/types';
import { slugify } from '@/lib/auth/credentials';
import { normalizeDatabaseName, suggestedDatabaseName } from '@/lib/tenant/database-name';

export type CompanyBranding = {
  id: number;
  name: string;
  slug: string;
  logo_url: string | null;
};

function normalizeName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export async function findCompanyById(id: number): Promise<Company | null> {
  const rows = await queryCentral<Company[]>(
    `SELECT id, name, slug, db_host, db_name, db_user, db_pass, status, logo_path, settings
     FROM companies WHERE id = :id AND status IN ('active', 'trial') LIMIT 1`,
    { id }
  );
  return rows[0] ?? null;
}

/** Resolve DB credentials regardless of subscription status (for session wiring / renewal). */
export async function findCompanyCredentialsById(id: number): Promise<Company | null> {
  const rows = await queryCentral<Company[]>(
    `SELECT id, name, slug, db_host, db_name, db_user, db_pass, status, logo_path, settings
     FROM companies WHERE id = :id LIMIT 1`,
    { id }
  );
  return rows[0] ?? null;
}

export async function findCompanyByDbName(dbName: string): Promise<Company | null> {
  const trimmed = dbName.trim();
  if (!trimmed) return null;

  const rows = await queryCentral<Company[]>(
    `SELECT id, name, slug, db_host, db_name, db_user, db_pass, status, logo_path, settings
     FROM companies WHERE db_name = :dbName LIMIT 1`,
    { dbName: trimmed }
  );
  return rows[0] ?? null;
}

export async function findCompanyBySlug(slug: string): Promise<Company | null> {
  const trimmed = slug.trim();
  if (!trimmed) return null;

  const rows = await queryCentral<Company[]>(
    `SELECT id, name, slug, db_host, db_name, db_user, db_pass, status, logo_path, settings
     FROM companies WHERE slug = :slug LIMIT 1`,
    { slug: trimmed }
  );
  return rows[0] ?? null;
}

export async function findCompanyByName(name: string): Promise<Company | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;

  const rows = await queryCentral<Company[]>(
    `SELECT id, name, slug, db_host, db_name, db_user, db_pass, status, logo_path, settings
     FROM companies WHERE status IN ('active', 'trial')`
  );

  const normalized = normalizeName(trimmed);
  const slug = slugify(trimmed);

  return (
    rows.find((c) => c.name.toLowerCase() === trimmed.toLowerCase()) ??
    rows.find((c) => c.slug === slug) ??
    rows.find((c) => normalizeName(c.name) === normalized) ??
    null
  );
}

export function companyBranding(company: Company): CompanyBranding {
  return {
    id: company.id,
    name: company.name,
    slug: company.slug,
    logo_url: company.logo_path ? String(company.logo_path) : null,
  };
}

export async function updateCompanyLogo(companyId: number, logoPath: string) {
  await executeCentral(`UPDATE companies SET logo_path = :logoPath WHERE id = :id`, {
    id: companyId,
    logoPath,
  });
}

export async function updateCompanyName(companyId: number, name: string) {
  const trimmed = name.trim();
  if (!trimmed) return;
  await executeCentral(`UPDATE companies SET name = :name WHERE id = :id`, {
    id: companyId,
    name: trimmed,
  });
}

export function companyToDbConfig(company: Company): DbConfig {
  const defaults = getDefaultTenantDbConfig();
  return {
    host: company.db_host || defaults.host,
    port: defaults.port,
    user: company.db_user || defaults.user,
    password: company.db_pass ?? defaults.password,
    database: company.db_name,
  };
}

export function buildCompanyRecord(input: {
  name: string;
  slug?: string;
  dbName?: string;
  dbHost?: string;
  dbUser?: string;
  dbPass?: string;
}): Omit<Company, 'id' | 'status' | 'logo_path' | 'settings'> & { status: Company['status'] } {
  const slug = input.slug || slugify(input.name);
  const dbName = input.dbName
    ? normalizeDatabaseName(input.dbName)
    : suggestedDatabaseName(slug);
  const defaults = getDefaultTenantDbConfig();

  return {
    name: input.name.trim(),
    slug,
    db_host: input.dbHost || defaults.host,
    db_name: dbName,
    db_user: input.dbUser || defaults.user,
    db_pass: input.dbPass ?? defaults.password,
    status: 'trial',
  };
}
