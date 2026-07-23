import { redirect } from 'next/navigation';
import { getSession } from '@/lib/tenant/session';
import { sessionToDbConfig } from '@/lib/api/tenant-context';
import { resolveTenantHotelName } from '@/lib/tenant/hotel-branding';
import { assertTenantAccess } from '@/lib/subscription/access-gate';
import InAppLayout from '@/components/layout/InAppLayout';
import StaffStyles from '@/components/layout/StaffStyles';
import { TenantSessionProvider } from '@/components/providers/TenantSessionProvider';
import SubscriptionLockGuard from '@/components/subscription/SubscriptionLockGuard';

/**
 * Persistent shell for all tenant app routes.
 * Keeps sidebar/header mounted across navigations so pages only swap content.
 */
export default async function TenantAppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session || session.type !== 'tenant') redirect('/login');
  if (session.mustChangePassword) redirect('/change-password');

  const access = session.companyId
    ? await assertTenantAccess(session.companyId)
    : { ok: false as const, message: 'Hotel account was not found.' };

  const propertyId = session.propertyId ?? 0;
  let hotelName = session.companyName || 'Hotel';
  try {
    if (propertyId > 0) {
      hotelName = await resolveTenantHotelName(
        session,
        await sessionToDbConfig(session),
        propertyId
      );
    }
  } catch {
    /* company unavailable */
  }

  const shell = {
    hotelName,
    hotelLogoUrl: session.companyLogoUrl,
    userName: session.userName,
    userAvatarUrl: session.userAvatarUrl,
    userRole: session.userRole || 'staff',
  };

  return (
    <TenantSessionProvider value={shell}>
      <StaffStyles />
      <InAppLayout
        hotelName={shell.hotelName}
        hotelLogoUrl={shell.hotelLogoUrl}
        userName={shell.userName}
        userAvatarUrl={shell.userAvatarUrl}
        userRole={shell.userRole}
        subscriptionLocked={access.ok ? null : access.message}
      >
        <SubscriptionLockGuard locked={!access.ok} />
        {children}
      </InAppLayout>
    </TenantSessionProvider>
  );
}
