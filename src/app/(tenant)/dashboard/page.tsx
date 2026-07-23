import { createTenantPage } from '@/lib/tenant-page';
import DashboardLive from '@/components/modules/DashboardLive';

export default async function DashboardPage() {
  return createTenantPage(<DashboardLive />, 'dashboard');
}
