import type { Metadata } from 'next';
import { findCompanyById, companyBranding } from '@/lib/tenant/tenant-service';
import { getLastCompanyId } from '@/lib/tenant/session';
import LoginForm from '@/components/login/LoginForm';
import StaffStyles from '@/components/layout/StaffStyles';
import '@/styles/login.css';

export const metadata: Metadata = {
  title: 'Sign In — Hotel PMS Pro',
  description: 'Sign in to your hotel property management workspace',
};

export default async function LoginPage() {
  const savedCompanyId = (await getLastCompanyId()) ?? 0;
  let savedCompanyName = '';
  let initialBranding = null;

  if (savedCompanyId > 0) {
    const company = await findCompanyById(savedCompanyId);
    if (company) {
      savedCompanyName = company.name;
      initialBranding = companyBranding(company);
    }
  }

  return (
    <>
      <StaffStyles />
      <LoginForm
        savedCompanyId={savedCompanyId}
        savedCompanyName={savedCompanyName}
        initialBranding={initialBranding}
      />
    </>
  );
}
