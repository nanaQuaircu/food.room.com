'use client';

import FrontDeskModule from '@/components/modules/FrontDeskModule';
import { useTenantSessionOptional } from '@/components/providers/TenantSessionProvider';

export default function FrontDeskPageClient() {
  const session = useTenantSessionOptional();
  return <FrontDeskModule userRole={session?.userRole} />;
}
