import { createTenantPage } from '@/lib/tenant-page';
import RestaurantModule from '@/components/modules/RestaurantModule';

export default async function RestaurantPage() {
  return createTenantPage(<RestaurantModule />, 'restaurant');
}
