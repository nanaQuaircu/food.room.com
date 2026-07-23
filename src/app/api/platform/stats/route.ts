import { NextResponse } from 'next/server';
import { getSession } from '@/lib/tenant/session';
import { getPlatformDashboardStats } from '@/lib/platform/platform-stats';

export async function GET() {
  const session = await getSession();
  if (!session || session.type !== 'platform') {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const stats = await getPlatformDashboardStats();
    return NextResponse.json({ success: true, data: stats });
  } catch (error) {
    console.error('Platform stats failed:', error);
    const code = (error as NodeJS.ErrnoException)?.code;
    const message =
      code === 'ECONNREFUSED' || code === 'ENOTFOUND' || code === 'ETIMEDOUT'
        ? 'Database is unavailable. Start MySQL in XAMPP and refresh this page.'
        : 'Unable to load platform stats. Please try again.';
    return NextResponse.json({ success: false, message }, { status: 503 });
  }
}
