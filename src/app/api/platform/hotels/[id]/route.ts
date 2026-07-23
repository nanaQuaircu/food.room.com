import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/tenant/session';
import {
  deletePlatformHotel,
  getPlatformHotelDetail,
  resetPlatformHotelOwnerPassword,
  suspendPlatformHotel,
  updatePlatformHotel,
} from '@/lib/platform/platform-hotels';
import type { CompanyStatus } from '@/lib/db/types';
import { DEFAULT_PASSWORD } from '@/lib/config';

type RouteContext = { params: Promise<{ id: string }> };

function parseHotelId(raw: string) {
  const id = Number(raw);
  if (!Number.isFinite(id) || id <= 0) {
    return null;
  }
  return id;
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const session = await getSession();
  if (!session || session.type !== 'platform') {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const id = parseHotelId((await context.params).id);
  if (!id) {
    return NextResponse.json({ success: false, message: 'Invalid hotel id.' }, { status: 400 });
  }

  const hotel = await getPlatformHotelDetail(id);
  if (!hotel) {
    return NextResponse.json({ success: false, message: 'Hotel not found.' }, { status: 404 });
  }

  return NextResponse.json({ success: true, data: hotel });
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const session = await getSession();
  if (!session || session.type !== 'platform') {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const id = parseHotelId((await context.params).id);
  if (!id) {
    return NextResponse.json({ success: false, message: 'Invalid hotel id.' }, { status: 400 });
  }

  try {
    const body = await request.json();
    const status = ['active', 'trial', 'suspended'].includes(body.status)
      ? (body.status as CompanyStatus)
      : undefined;

    await updatePlatformHotel(id, {
      name: body.name ? String(body.name) : undefined,
      slug: body.slug ? String(body.slug) : undefined,
      status,
    });

    const hotel = await getPlatformHotelDetail(id);
    return NextResponse.json({ success: true, data: hotel, message: 'Hotel updated.' });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : 'Update failed.' },
      { status: 400 }
    );
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const session = await getSession();
  if (!session || session.type !== 'platform') {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const id = parseHotelId((await context.params).id);
  if (!id) {
    return NextResponse.json({ success: false, message: 'Invalid hotel id.' }, { status: 400 });
  }

  try {
    await deletePlatformHotel(id);
    return NextResponse.json({ success: true, message: 'Hotel and tenant database removed.' });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : 'Delete failed.' },
      { status: 400 }
    );
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  const session = await getSession();
  if (!session || session.type !== 'platform') {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const id = parseHotelId((await context.params).id);
  if (!id) {
    return NextResponse.json({ success: false, message: 'Invalid hotel id.' }, { status: 400 });
  }

  try {
    const body = await request.json();
    const action = String(body.action || '');

    if (action === 'suspend') {
      await suspendPlatformHotel(id);
      const hotel = await getPlatformHotelDetail(id);
      return NextResponse.json({ success: true, data: hotel, message: 'Hotel suspended.' });
    }

    if (action === 'reset_owner_password') {
      await resetPlatformHotelOwnerPassword(id);
      return NextResponse.json({
        success: true,
        message: `Owner password reset to ${DEFAULT_PASSWORD}. They must change it on next login.`,
      });
    }

    return NextResponse.json({ success: false, message: 'Unknown action.' }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : 'Action failed.' },
      { status: 400 }
    );
  }
}
