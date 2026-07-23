import { redirect } from 'next/navigation';
import { getSession } from '@/lib/tenant/session';
import PlatformLayout from '@/components/layout/PlatformLayout';
import StaffStyles from '@/components/layout/StaffStyles';

/**
 * Persistent shell for platform admin routes.
 */
export default async function PlatformAppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session || session.type !== 'platform') redirect('/login');
  if (session.mustChangePassword) redirect('/change-password');

  return (
    <>
      <StaffStyles />
      <PlatformLayout userName={session.userName}>{children}</PlatformLayout>
    </>
  );
}
