import { createTenantPage } from '@/lib/tenant-page';
import ReportsModule from '@/components/modules/ReportsModule';

export default async function ReportsPage() {
  return createTenantPage(<ReportsModule />, 'reports');
}
