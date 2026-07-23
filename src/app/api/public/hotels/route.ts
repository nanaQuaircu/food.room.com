import { NextResponse } from 'next/server';
import { queryCentral } from '@/lib/db/central';

type PublicHotel = {
  id: number;
  name: string;
  slug: string;
  logo_url: string | null;
  created_at: string;
};

export async function GET() {
  try {
    const hotels = await queryCentral<PublicHotel[]>(
      `SELECT id, name, slug, logo_path AS logo_url, created_at
       FROM companies
       WHERE status IN ('active', 'trial')
       ORDER BY created_at DESC, name ASC`
    );

    return NextResponse.json({
      success: true,
      data: hotels,
    });
  } catch (error) {
    console.error('Unable to load public hotels:', error);
    return NextResponse.json(
      { success: false, message: 'Unable to load hotels right now.' },
      { status: 500 }
    );
  }
}
