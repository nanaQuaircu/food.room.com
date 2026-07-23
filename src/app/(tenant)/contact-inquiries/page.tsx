import { createTenantPage } from '@/lib/tenant-page';
import ContactInquiriesModule from '@/components/modules/ContactInquiriesModule';

export default async function ContactInquiriesPage() {
  return createTenantPage(<ContactInquiriesModule />, 'contact-inquiries');
}
