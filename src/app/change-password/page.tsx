import { redirect } from 'next/navigation';
import { getSession } from '@/lib/tenant/session';
import { getHomePathForRole } from '@/lib/roles';
import ChangePasswordForm from '@/components/auth/ChangePasswordForm';
import StaffStyles from '@/components/layout/StaffStyles';
import '@/styles/login.css';

export default async function ChangePasswordPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (!session.mustChangePassword) {
    redirect(
      session.type === 'platform'
        ? '/platform'
        : getHomePathForRole(session.userRole)
    );
  }

  return (
    <>
      <StaffStyles />
      <ChangePasswordForm userName={session.userName} />
    </>
  );
}
