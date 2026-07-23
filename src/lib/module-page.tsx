import { redirect } from 'next/navigation';
import { getSession } from '@/lib/tenant/session';
import { sessionToDbConfig } from '@/lib/api/tenant-context';
import { resolveTenantHotelName } from '@/lib/tenant/hotel-branding';
import InAppLayout from '@/components/layout/InAppLayout';
import ModuleRoadmap from '@/components/dev/ModuleRoadmap';
import type { DevModule } from '@/lib/module-registry';
import { getTenantModule } from '@/lib/module-registry';

export async function createModulePage(moduleId: string) {
  const module = getTenantModule(moduleId);
  if (!module) {
    throw new Error(`Unknown tenant module: ${moduleId}`);
  }

  const session = await getSession();
  if (!session || session.type !== 'tenant') redirect('/login');

  const propertyId = session.propertyId ?? 0;
  const hotelName =
    propertyId > 0
      ? await resolveTenantHotelName(session, await sessionToDbConfig(session), propertyId)
      : session.companyName || 'Hotel';

  return (
    <InAppLayout
      hotelName={hotelName}
      hotelLogoUrl={session.companyLogoUrl}
      userName={session.userName}
      userAvatarUrl={session.userAvatarUrl}
      userRole={session.userRole}
    >
      <ModuleRoadmap module={module} />
    </InAppLayout>
  );
}

export type { DevModule };
