import { createTenantPage } from '@/lib/tenant-page';
import AttendanceModule from '@/components/modules/AttendanceModule';

export default async function AttendancePage() {
  return createTenantPage(<AttendanceModule />, 'attendance');
}
