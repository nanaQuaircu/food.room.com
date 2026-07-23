import type { Metadata } from 'next';
import AppProviders from '@/components/providers/AppProviders';
import BootstrapClient from '@/components/providers/BootstrapClient';
import './globals.css';

export const metadata: Metadata = {
  title: 'Hotel PMS Pro',
  description: 'Multi-tenant Hotel Property Management System',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <AppProviders>
          <BootstrapClient />
          {children}
        </AppProviders>
      </body>
    </html>
  );
}
