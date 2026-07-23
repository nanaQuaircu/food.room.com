import { createTenantPage } from '@/lib/tenant-page';
import GuestsModule from '@/components/modules/GuestsModule';

export default async function GuestsPage() {
  return createTenantPage(<GuestsModule />, 'guests');
}
