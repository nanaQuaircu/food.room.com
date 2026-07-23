import { createTenantPage } from '@/lib/tenant-page';
import RoomsModule from '@/components/modules/RoomsModule';

export default async function RoomsPage() {
  return createTenantPage(<RoomsModule />, 'rooms');
}
