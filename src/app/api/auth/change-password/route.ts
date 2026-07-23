import { NextRequest, NextResponse } from 'next/server';
import { DEFAULT_PASSWORD } from '@/lib/config';
import { hashPassword, verifyPassword } from '@/lib/auth/credentials';
import { getSession, createSession, destroySession } from '@/lib/tenant/session';
import { queryCentral } from '@/lib/db/central';
import { queryTenant, executeTenant } from '@/lib/db/tenant';
import { companyToDbConfig, findCompanyById } from '@/lib/tenant/tenant-service';
import type { PlatformAdmin, TenantUser } from '@/lib/db/types';

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const password = String(body.password || '');
    const confirm = String(body.confirm_password || '');

    if (!password || password.length < 8) {
      return NextResponse.json(
        { success: false, message: 'Password must be at least 8 characters.' },
        { status: 400 }
      );
    }

    if (password !== confirm) {
      return NextResponse.json(
        { success: false, message: 'Passwords do not match.' },
        { status: 400 }
      );
    }

    if (password === DEFAULT_PASSWORD) {
      return NextResponse.json(
        { success: false, message: 'Choose a different password from the default temporary password.' },
        { status: 400 }
      );
    }

    const passwordHash = await hashPassword(password);

    if (session.type === 'platform') {
      const admins = await queryCentral<PlatformAdmin[]>(
        `SELECT id, password_hash FROM platform_admins WHERE id = :id LIMIT 1`,
        { id: session.userId }
      );
      const admin = admins[0];
      if (!admin) {
        return NextResponse.json({ success: false, message: 'Account not found.' }, { status: 404 });
      }

      await queryCentral(
        `UPDATE platform_admins SET password_hash = :hash, must_change_password = 0 WHERE id = :id`,
        { hash: passwordHash, id: session.userId }
      );

      await createSession({
        ...session,
        mustChangePassword: false,
      });

      return NextResponse.json({
        success: true,
        data: { redirect: '/platform' },
        message: 'Password updated. Welcome to the platform.',
      });
    }

    if (!session.companyId) {
      return NextResponse.json({ success: false, message: 'Invalid session.' }, { status: 400 });
    }

    const company = await findCompanyById(session.companyId);
    if (!company) {
      return NextResponse.json({ success: false, message: 'Hotel not found.' }, { status: 404 });
    }

    const dbConfig = companyToDbConfig(company);
    await executeTenant(
      dbConfig,
      `UPDATE users SET password_hash = :hash, must_change_password = 0 WHERE id = :id`,
      { hash: passwordHash, id: session.userId }
    );

    await destroySession();

    return NextResponse.json({
      success: true,
      data: { redirect: '/login' },
      message: 'Password updated. Please sign in with your new password.',
    });
  } catch (error) {
    console.error('Password change failed:', error);
    return NextResponse.json(
      { success: false, message: 'Unable to update password.' },
      { status: 500 }
    );
  }
}
