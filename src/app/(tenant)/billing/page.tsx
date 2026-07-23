import { createTenantPage } from '@/lib/tenant-page';
import BillingModule from '@/components/modules/BillingModule';

export default async function BillingPage() {
  return createTenantPage(<BillingModule />, 'billing');
}
