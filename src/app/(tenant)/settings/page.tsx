import { createTenantPage } from '@/lib/tenant-page';
import SettingsModule from '@/components/modules/SettingsModule';

export default async function SettingsPage() {
  return createTenantPage(<SettingsModule />, 'settings');
}
