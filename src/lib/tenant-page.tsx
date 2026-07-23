import { redirect } from 'next/navigation';
import { getSession } from '@/lib/tenant/session';
import { canAccessModule, getHomePathForRole } from '@/lib/roles';

/**
 * Lightweight page guard — shell/session come from (tenant)/layout.
 * Only enforces module ACL when moduleId is provided.
 */
export async function createTenantPage(children: React.ReactNode, moduleId?: string) {
  const session = await getSession();
  if (!session || session.type !== 'tenant') redirect('/login');
  if (session.mustChangePassword) redirect('/change-password');

  if (moduleId && !canAccessModule(session.userRole, moduleId)) {
    redirect(getHomePathForRole(session.userRole));
  }

  return children;
}
