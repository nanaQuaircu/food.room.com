import { createTenantPage } from '@/lib/tenant-page';
import FrontDeskPageClient from './FrontDeskPageClient';

export default async function FrontDeskPage() {
  return createTenantPage(<FrontDeskPageClient />, 'front-desk');
}
