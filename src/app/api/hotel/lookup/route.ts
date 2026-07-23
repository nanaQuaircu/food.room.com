import { NextRequest, NextResponse } from 'next/server';
import { findCompanyById, findCompanyByName, companyBranding } from '@/lib/tenant/tenant-service';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const companyId = Number(body.id || body.company_id || 0);
    const name = String(body.name || '').trim();

    const company =
      companyId > 0 ? await findCompanyById(companyId) : await findCompanyByName(name);

    if (!company) {
      return NextResponse.json(
        {
          success: false,
          message:
            companyId > 0
              ? 'Hotel is unavailable or inactive.'
              : 'No hotel found with that name. Enter it exactly as registered.',
        },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: companyBranding(company) });
  } catch (error) {
    console.error('Hotel lookup failed:', error);
    return NextResponse.json(
      { success: false, message: 'Unable to reach the hotel registry. Please try again.' },
      { status: 503 }
    );
  }
}
