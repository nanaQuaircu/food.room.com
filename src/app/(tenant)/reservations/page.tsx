import { createTenantPage } from '@/lib/tenant-page';
import ReservationsModule from '@/components/modules/ReservationsModule';

export default async function ReservationsPage() {
  return createTenantPage(<ReservationsModule />, 'reservations');
}
