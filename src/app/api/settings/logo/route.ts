import fs from 'fs/promises';
import path from 'path';
import { NextRequest } from 'next/server';
import { requireTenant, isTenantContext, requireTenantRoles } from '@/lib/api/tenant-context';
import { PROPERTY_SETTINGS_ROLES } from '@/lib/roles';
import { apiOk, apiFail } from '@/lib/api/json';
import { findCompanyById, updateCompanyLogo } from '@/lib/tenant/tenant-service';
import { updateSession } from '@/lib/tenant/session';

const LOGO_DIR = path.join(process.cwd(), 'public', 'uploads', 'logos');
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']);
const MAX_BYTES = 2 * 1024 * 1024;

function extForMime(mime: string) {
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  if (mime === 'image/svg+xml') return 'svg';
  return 'jpg';
}

export async function GET() {
  const ctx = await requireTenant({ allowExpired: true });
  if (!isTenantContext(ctx)) return ctx;
  try {
    const companyId = ctx.session.companyId;
    if (!companyId) return apiFail('Invalid session', 400);
    const company = await findCompanyById(companyId);
    if (!company) return apiFail('Hotel not found', 404);
    return apiOk({ logo_url: company.logo_path });
  } catch (e) {
    console.error(e);
    return apiFail('Failed to load hotel logo', 500);
  }
}

export async function POST(request: NextRequest) {
  const ctx = await requireTenant({ allowExpired: true });
  if (!isTenantContext(ctx)) return ctx;
  const denied = requireTenantRoles(ctx, PROPERTY_SETTINGS_ROLES);
  if (denied) return denied;

  try {
    const companyId = ctx.session.companyId;
    if (!companyId) return apiFail('Invalid session', 400);

    const form = await request.formData();
    const file = form.get('logo');

    if (!(file instanceof File)) {
      return apiFail('logo file is required');
    }

    if (!ALLOWED_TYPES.has(file.type)) {
      return apiFail('Only JPG, PNG, WebP, or SVG images are allowed');
    }

    if (file.size > MAX_BYTES) {
      return apiFail('Logo must be 2 MB or smaller');
    }

    await fs.mkdir(LOGO_DIR, { recursive: true });

    const ext = extForMime(file.type);
    const filename = `company_${companyId}.${ext}`;
    const diskPath = path.join(LOGO_DIR, filename);
    const publicUrl = `/uploads/logos/${filename}?v=${Date.now()}`;

    const buffer = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(diskPath, buffer);

    await updateCompanyLogo(companyId, publicUrl.split('?')[0]);
    await updateSession({ companyLogoUrl: publicUrl.split('?')[0] });

    return apiOk({ logo_url: publicUrl.split('?')[0] }, 'Hotel logo updated');
  } catch (e) {
    console.error(e);
    return apiFail('Failed to upload hotel logo', 500);
  }
}

export async function DELETE() {
  const ctx = await requireTenant({ allowExpired: true });
  if (!isTenantContext(ctx)) return ctx;
  const denied = requireTenantRoles(ctx, PROPERTY_SETTINGS_ROLES);
  if (denied) return denied;

  try {
    const companyId = ctx.session.companyId;
    if (!companyId) return apiFail('Invalid session', 400);

    await updateCompanyLogo(companyId, '');
    await updateSession({ companyLogoUrl: null });

    return apiOk(null, 'Hotel logo removed');
  } catch (e) {
    console.error(e);
    return apiFail('Failed to remove hotel logo', 500);
  }
}
