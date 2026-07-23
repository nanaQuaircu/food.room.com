import { createTenantPage } from '@/lib/tenant-page';
import StaffModule from '@/components/modules/StaffModule';

export default async function StaffPage() {
  return createTenantPage(<StaffModule />, 'staff');
}
