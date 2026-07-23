import { NextRequest } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { requireTenant, isTenantContext, requireTenantRoles } from '@/lib/api/tenant-context';
import { apiOk, apiFail } from '@/lib/api/json';
import type { TenantRole } from '@/lib/roles';

const MENU_IMAGE_DIR = path.join(process.cwd(), 'public', 'uploads', 'menu');
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_BYTES = 3 * 1024 * 1024;
const UPLOAD_ROLES: TenantRole[] = [
  'owner',
  'admin',
  'manager',
  'front_desk',
  'cook',
  'chef',
  'kitchen_supervisor',
];

function extForMime(mime: string) {
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  return 'jpg';
}

export async function POST(request: NextRequest) {
  const ctx = await requireTenant();
  if (!isTenantContext(ctx)) return ctx;
  const denied = requireTenantRoles(ctx, UPLOAD_ROLES);
  if (denied) return denied;

  try {
    const form = await request.formData();
    const file = form.get('image');
    if (!(file instanceof File)) return apiFail('image file is required');
    if (!ALLOWED_TYPES.has(file.type)) return apiFail('Only JPG, PNG, or WebP images are allowed');
    if (file.size > MAX_BYTES) return apiFail('Image must be 3 MB or smaller');

    await fs.mkdir(MENU_IMAGE_DIR, { recursive: true });
    const ext = extForMime(file.type);
    const version = Date.now();
    const filename = `property_${ctx.propertyId}_menu_${version}.${ext}`;
    const diskPath = path.join(MENU_IMAGE_DIR, filename);
    await fs.writeFile(diskPath, Buffer.from(await file.arrayBuffer()));

    const baseUrl = `/uploads/menu/${filename}`;
    return apiOk({ image_url: `${baseUrl}?v=${version}` }, 'Menu photo uploaded');
  } catch (e) {
    console.error(e);
    const message = e instanceof Error ? e.message : 'Failed to upload menu image';
    return apiFail(message, 400);
  }
}
