import { createTenantPage } from '@/lib/tenant-page';
import InventoryModule from '@/components/modules/InventoryModule';

export default async function InventoryPage() {
  return createTenantPage(<InventoryModule />, 'inventory');
}
