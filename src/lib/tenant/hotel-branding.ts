import type { DbConfig } from '@/lib/db/central';
import type { SessionPayload } from '@/lib/db/types';
import { getProperty } from '@/lib/services/hotel-service';

/** Operational hotel name from properties, with company/session fallback. */
export async function resolveTenantHotelName(
  session: SessionPayload,
  db: DbConfig,
  propertyId: number
): Promise<string> {
  try {
    const row = (await getProperty(db, propertyId)) as { name?: string } | undefined;
    const name = row?.name?.trim();
    if (name) return name;
  } catch {
    // fall through to session company name
  }
  return session.companyName?.trim() || 'Hotel';
}
