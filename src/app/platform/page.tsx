import PlatformDashboard from '@/components/platform/PlatformDashboard';
import { getSession } from '@/lib/tenant/session';
import { redirect } from 'next/navigation';

export default async function PlatformPage() {
  const session = await getSession();
  if (!session || session.type !== 'platform') redirect('/login');
  if (session.mustChangePassword) redirect('/change-password');

  return <PlatformDashboard userName={session.userName} />;
}
