import { createTenantPage } from '@/lib/tenant-page';
import DebtorsModule from '@/components/modules/DebtorsModule';

export default async function DebtorsPage() {
  return createTenantPage(<DebtorsModule />, 'debtors');
}
