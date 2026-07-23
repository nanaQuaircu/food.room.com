import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/tenant/session';
import { provisionHotel } from '@/lib/tenant/tenant-provisioner';
import { listPlatformHotels } from '@/lib/platform/platform-stats';
import { DEFAULT_PASSWORD } from '@/lib/config';
import { slugify } from '@/lib/auth/credentials';
import { normalizeDatabaseName, validateDatabaseName } from '@/lib/tenant/database-name';

export async function GET() {
  const session = await getSession();
  if (!session || session.type !== 'platform') {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const hotels = await listPlatformHotels();
  return NextResponse.json({ success: true, data: hotels });
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session || session.type !== 'platform') {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const name = String(body.name || '').trim();
    const ownerEmail = String(body.owner_email || '').trim().toLowerCase();
    const dbName = normalizeDatabaseName(String(body.db_name || ''));

    if (!name || !ownerEmail) {
      return NextResponse.json(
        { success: false, message: 'Hotel name and owner email are required.' },
        { status: 400 }
      );
    }

    const dbNameError = validateDatabaseName(dbName);
    if (dbNameError) {
      return NextResponse.json({ success: false, message: dbNameError }, { status: 400 });
    }

    const result = await provisionHotel({
      name,
      slug: body.slug ? String(body.slug) : slugify(name),
      dbName,
      ownerName: String(body.owner_name || 'Hotel Owner').trim(),
      ownerEmail,
      planId: body.plan_id ? Number(body.plan_id) : 1,
      status: ['active', 'trial', 'suspended'].includes(body.status) ? body.status : 'trial',
    });

    return NextResponse.json({
      success: true,
      data: result,
      message: `Hotel provisioned. Owner default password is ${DEFAULT_PASSWORD} (must change on first login).`,
    });
  } catch (error) {
    console.error('Provision failed:', error);
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : 'Provisioning failed' },
      { status: 500 }
    );
  }
}
