import { NextRequest, NextResponse } from 'next/server';
import { queryCentral } from '@/lib/db/central';
import { queryTenant } from '@/lib/db/tenant';
import {
  findCompanyById,
  findCompanyByName,
  companyToDbConfig,
} from '@/lib/tenant/tenant-service';
import { createSession, setLastCompanyId } from '@/lib/tenant/session';
import { verifyPassword } from '@/lib/auth/credentials';
import { isPlatformBypassLogin, findPlatformAdminByLogin } from '@/lib/auth/platform-auth';
import type { TenantUser } from '@/lib/db/types';

import { getHomePathForRole } from '@/lib/roles';

function redirectForUser(
  type: 'tenant' | 'platform',
  mustChangePassword: boolean,
  userRole?: string
) {
  if (mustChangePassword) return '/change-password';
  if (type === 'platform') return '/platform';
  return getHomePathForRole(userRole);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const login = String(body.login || '').trim();
    const password = String(body.password || '');
    const companyId = Number(body.company_id || 0);
    const companyName = String(body.company_name || '').trim();

    if (!login || !password) {
      return NextResponse.json(
        { success: false, message: 'Login and password are required.' },
        { status: 400 }
      );
    }

    if (isPlatformBypassLogin(login)) {
      const platformAdmin = await findPlatformAdminByLogin(login);
      if (!platformAdmin || !(await verifyPassword(password, platformAdmin.password_hash))) {
        return NextResponse.json(
          { success: false, message: 'Invalid platform admin credentials.' },
          { status: 401 }
        );
      }

      const mustChangePassword = Boolean(platformAdmin.must_change_password);
      await createSession({
        type: 'platform',
        userId: platformAdmin.id,
        userName: platformAdmin.name,
        userEmail: platformAdmin.email,
        mustChangePassword,
      });

      return NextResponse.json({
        success: true,
        data: {
          redirect: redirectForUser('platform', mustChangePassword),
          type: 'platform',
        },
      });
    }

    const company =
      companyId > 0
        ? await findCompanyById(companyId)
        : companyName
          ? await findCompanyByName(companyName)
          : null;

    if (!company) {
      return NextResponse.json(
        { success: false, message: 'Please add your hotel name before signing in.' },
        { status: 400 }
      );
    }

    const dbConfig = companyToDbConfig(company);
    const users = await queryTenant<TenantUser[]>(
      dbConfig,
      `SELECT id, property_id, name, email, avatar_url, password_hash, role, is_active, must_change_password
       FROM users WHERE (LOWER(email) = LOWER(:login) OR LOWER(name) = LOWER(:login)) AND is_active = 1 LIMIT 1`,
      { login }
    );

    const user = users[0];
    if (!user || !(await verifyPassword(password, user.password_hash))) {
      return NextResponse.json(
        { success: false, message: 'Invalid email or password for this hotel.' },
        { status: 401 }
      );
    }

    const mustChangePassword = Boolean(user.must_change_password);

    const propertyRows = await queryTenant<Array<{ name: string }>>(
      dbConfig,
      `SELECT name FROM properties WHERE id = :propertyId LIMIT 1`,
      { propertyId: user.property_id }
    );
    const hotelName = propertyRows[0]?.name?.trim() || company.name;

    await createSession({
      type: 'tenant',
      userId: user.id,
      userName: user.name,
      userEmail: user.email,
      userAvatarUrl: user.avatar_url ?? null,
      userRole: user.role,
      mustChangePassword,
      companyId: company.id,
      companyName: hotelName,
      companyLogoUrl: company.logo_path ?? null,
      companySlug: company.slug,
      propertyId: user.property_id,
    });

    await setLastCompanyId(company.id);

    return NextResponse.json({
      success: true,
      data: {
        redirect: redirectForUser('tenant', mustChangePassword, user.role),
        type: 'tenant',
        hotel: hotelName,
      },
    });
  } catch (error) {
    console.error('Login failed:', error);
    return NextResponse.json(
      { success: false, message: 'Login failed. Check database connection and .env.local settings.' },
      { status: 500 }
    );
  }
}
