import { NextRequest } from 'next/server';
import { requireTenant, isTenantContext, requireTenantRoles } from '@/lib/api/tenant-context';
import { PROPERTY_SETTINGS_ROLES } from '@/lib/roles';
import { apiOk, apiFail } from '@/lib/api/json';
import { updateSession } from '@/lib/tenant/session';
import { getProperty, updateProperty } from '@/lib/services/hotel-service';
import { updateCompanyName } from '@/lib/tenant/tenant-service';

export async function GET() {
  const ctx = await requireTenant({ allowExpired: true });
  if (!isTenantContext(ctx)) return ctx;
  const denied = requireTenantRoles(ctx, PROPERTY_SETTINGS_ROLES);
  if (denied) return denied;
  try {
    const data = await getProperty(ctx.db, ctx.propertyId);
    return apiOk(data);
  } catch (e) {
    console.error(e);
    return apiFail('Failed to load property settings', 500);
  }
}

export async function PATCH(request: NextRequest) {
  const ctx = await requireTenant({ allowExpired: true });
  if (!isTenantContext(ctx)) return ctx;
  const denied = requireTenantRoles(ctx, PROPERTY_SETTINGS_ROLES);
  if (denied) return denied;
  try {
    const body = await request.json();
    const input: Record<string, string | number | null> = {};

    if (body.name !== undefined) input.name = String(body.name);
    if (body.address !== undefined) input.address = String(body.address);
    if (body.phone !== undefined) input.phone = String(body.phone);
    if (body.email !== undefined) input.email = String(body.email);
    if (body.timezone !== undefined) input.timezone = String(body.timezone);
    if (body.currency !== undefined) input.currency = String(body.currency);
    if (body.attendance_latitude !== undefined) {
      const raw = body.attendance_latitude;
      input.attendance_latitude =
        raw === '' || raw === null ? null : Number(raw);
    }
    if (body.attendance_longitude !== undefined) {
      const raw = body.attendance_longitude;
      input.attendance_longitude =
        raw === '' || raw === null ? null : Number(raw);
    }
    if (body.attendance_radius_m !== undefined) {
      const raw = body.attendance_radius_m;
      input.attendance_radius_m =
        raw === '' || raw === null ? null : Number(raw);
    }

    if (
      input.attendance_latitude != null &&
      (!Number.isFinite(Number(input.attendance_latitude)) ||
        Number(input.attendance_latitude) < -90 ||
        Number(input.attendance_latitude) > 90)
    ) {
      return apiFail('Latitude must be between -90 and 90.');
    }
    if (
      input.attendance_longitude != null &&
      (!Number.isFinite(Number(input.attendance_longitude)) ||
        Number(input.attendance_longitude) < -180 ||
        Number(input.attendance_longitude) > 180)
    ) {
      return apiFail('Longitude must be between -180 and 180.');
    }
    if (
      input.attendance_radius_m != null &&
      (!Number.isFinite(Number(input.attendance_radius_m)) || Number(input.attendance_radius_m) <= 0)
    ) {
      return apiFail('Allowed distance must be a positive number of meters.');
    }

    await updateProperty(ctx.db, ctx.propertyId, input);
    const data = await getProperty(ctx.db, ctx.propertyId);
    if (input.name !== undefined && ctx.session.companyId) {
      const row = data as { name?: string };
      const nextName = row?.name?.trim();
      if (nextName) {
        await updateCompanyName(ctx.session.companyId, nextName);
        await updateSession({ companyName: nextName });
      }
    }
    return apiOk(data);
  } catch (e) {
    console.error(e);
    return apiFail('Failed to update property settings', 500);
  }
}
