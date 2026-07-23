import { redirect } from 'next/navigation';
import { getSession } from '@/lib/tenant/session';
import ModuleRoadmap from '@/components/dev/ModuleRoadmap';
import { getPlatformModule } from '@/lib/module-registry';

/** Platform module pages — shell comes from platform/layout. */
export async function createPlatformModulePage(moduleId: string) {
  const module = getPlatformModule(moduleId);
  if (!module) {
    throw new Error(`Unknown platform module: ${moduleId}`);
  }

  const session = await getSession();
  if (!session || session.type !== 'platform') redirect('/login');
  if (session.mustChangePassword) redirect('/change-password');

  return <ModuleRoadmap module={module} />;
}
