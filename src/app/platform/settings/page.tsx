import { redirect } from 'next/navigation';
import { getSession } from '@/lib/tenant/session';
import PlatformPaystackSettings from '@/components/modules/PlatformPaystackSettings';

export default async function PlatformSettingsPage() {
  const session = await getSession();
  if (!session || session.type !== 'platform') redirect('/login');
  if (session.mustChangePassword) redirect('/change-password');

  return <PlatformPaystackSettings />;
}
