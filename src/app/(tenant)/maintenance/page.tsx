import MaintenanceModule from '@/components/modules/MaintenanceModule';
import { createTenantPage } from '@/lib/tenant-page';

export default async function MaintenancePage() {
  return createTenantPage(<MaintenanceModule />, 'maintenance');
}
