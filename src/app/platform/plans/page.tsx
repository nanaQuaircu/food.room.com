import { redirect } from 'next/navigation';
import { getSession } from '@/lib/tenant/session';
import PlatformPlansModule from '@/components/modules/PlatformPlansModule';

export default async function PlatformPlansPage() {
  const session = await getSession();
  if (!session || session.type !== 'platform') redirect('/login');
  if (session.mustChangePassword) redirect('/change-password');

  return <PlatformPlansModule />;
}
