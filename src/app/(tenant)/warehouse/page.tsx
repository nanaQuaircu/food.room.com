import { createTenantPage } from '@/lib/tenant-page';
import WarehouseModule from '@/components/modules/WarehouseModule';

export default async function WarehousePage() {
  return createTenantPage(<WarehouseModule />, 'warehouse');
}
