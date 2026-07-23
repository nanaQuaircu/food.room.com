import { NextRequest } from 'next/server';
import { requireTenant, isTenantContext, requireTenantRoles } from '@/lib/api/tenant-context';
import { STAFF_MANAGEMENT_ROLES } from '@/lib/roles';
import { apiOk, apiFail } from '@/lib/api/json';
import { listStaff } from '@/lib/services/hotel-service';
import { createStaffUser, resetUserPassword, updateStaffUser, type StaffRole } from '@/lib/tenant/user-service';
import { DEFAULT_PASSWORD } from '@/lib/config';

const VALID_ROLES: StaffRole[] = [
  'admin',
  'manager',
  'front_desk',
  'housekeeping',
  'finance',
  'cook',
  'chef',
  'kitchen_supervisor',
  'security',
  'driver',
];

export async function GET() {
  const ctx = await requireTenant();
  if (!isTenantContext(ctx)) return ctx;
  const denied = requireTenantRoles(ctx, STAFF_MANAGEMENT_ROLES);
  if (denied) return denied;
  try {
    const data = await listStaff(ctx.db, ctx.propertyId);
    return apiOk(data);
  } catch (e) {
    console.error(e);
    return apiFail('Failed to list staff', 500);
  }
}

export async function POST(request: NextRequest) {
  const ctx = await requireTenant();
  if (!isTenantContext(ctx)) return ctx;
  const denied = requireTenantRoles(ctx, STAFF_MANAGEMENT_ROLES);
  if (denied) return denied;
  try {
    const body = await request.json();
    const name = String(body.name || '').trim();
    const email = String(body.email || '').trim();
    const role = String(body.role || '').trim() as StaffRole;
    const phone = body.phone != null ? String(body.phone).trim() : '';

    if (!name || !email || !role) {
      return apiFail('name, email, and role are required');
    }

    if (!VALID_ROLES.includes(role)) {
      return apiFail(`role must be one of: ${VALID_ROLES.join(', ')}`);
    }

    const result = await createStaffUser(ctx.db, {
      propertyId: ctx.propertyId,
      name,
      email,
      role,
      phone: phone || null,
    });

    return apiOk(
      { id: result.insertId },
      `Staff user created. Default password is ${result.defaultPassword} (must change on first login).`
    );
  } catch (e) {
    console.error(e);
    const message = e instanceof Error ? e.message : 'Failed to create staff user';
    return apiFail(message, 500);
  }
}

export async function PATCH(request: NextRequest) {
  const ctx = await requireTenant();
  if (!isTenantContext(ctx)) return ctx;
  const denied = requireTenantRoles(ctx, STAFF_MANAGEMENT_ROLES);
  if (denied) return denied;
  try {
    const body = await request.json();
    const userId = Number(body.id);
    const action = String(body.action || '').trim();

    if (!userId) {
      return apiFail('id is required');
    }

    if (action === 'reset_password') {
      await resetUserPassword(ctx.db, userId);
      return apiOk(
        { id: userId },
        `Password reset to ${DEFAULT_PASSWORD}. User must change it on next login.`
      );
    }

    if (action === 'update') {
      const name = String(body.name || '').trim();
      const email = String(body.email || '').trim();
      const role = String(body.role || '').trim() as StaffRole | 'owner';
      const phone = body.phone != null ? String(body.phone).trim() : '';
      const isActive =
        body.is_active === undefined ? undefined : Boolean(Number(body.is_active) || body.is_active === true);

      if (!name || !email || !role) {
        return apiFail('name, email, and role are required');
      }

      if (role !== 'owner' && !VALID_ROLES.includes(role as StaffRole)) {
        return apiFail(`role must be one of: ${VALID_ROLES.join(', ')}`);
      }

      await updateStaffUser(ctx.db, ctx.propertyId, userId, {
        name,
        email,
        role,
        phone: phone || null,
        is_active: isActive,
      });

      return apiOk({ id: userId }, 'Staff member updated.');
    }

    return apiFail('Unknown action');
  } catch (e) {
    console.error(e);
    return apiFail('Failed to update staff user', 500);
  }
}
