import { createTenantPage } from '@/lib/tenant-page';
import HousekeepingModule from '@/components/modules/HousekeepingModule';

export default async function HousekeepingPage() {
  return createTenantPage(<HousekeepingModule />, 'housekeeping');
}
