import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/tenant/session';
import { getHomePathForRole } from '@/lib/roles';
import SaaSLandingPage from '@/components/marketing/SaaSLandingPage';
import '@/styles/saas-landing.css';

const appName = process.env.NEXT_PUBLIC_APP_NAME || 'Hotel PMS Pro';

export const metadata: Metadata = {
  title: `${appName} — Hotel management & guest websites`,
  description:
    'Multi-tenant hotel property management with branded guest websites for bookings, dining, and stays.',
};

export default async function HomePage() {
  const session = await getSession();
  if (session?.type === 'platform') redirect('/platform');
  if (session?.type === 'tenant') redirect(getHomePathForRole(session.userRole));

  return <SaaSLandingPage />;
}
