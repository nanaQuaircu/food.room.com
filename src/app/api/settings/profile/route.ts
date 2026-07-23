import fs from 'fs/promises';
import path from 'path';
import { NextRequest } from 'next/server';
import { requireTenant, isTenantContext } from '@/lib/api/tenant-context';
import { apiOk, apiFail } from '@/lib/api/json';
import { getUserProfile, updateUserProfile } from '@/lib/tenant/user-service';
import { updateSession } from '@/lib/tenant/session';

const AVATAR_DIR = path.join(process.cwd(), 'public', 'uploads', 'avatars');
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const MAX_BYTES = 2 * 1024 * 1024;

function extForMime(mime: string) {
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  if (mime === 'image/gif') return 'gif';
  return 'jpg';
}

export async function GET() {
  const ctx = await requireTenant({ allowExpired: true });
  if (!isTenantContext(ctx)) return ctx;
  try {
    const profile = await getUserProfile(ctx.db, ctx.session.userId);
    if (!profile) return apiFail('Profile not found', 404);
    return apiOk(profile);
  } catch (e) {
    console.error(e);
    return apiFail('Failed to load profile', 500);
  }
}

export async function PATCH(request: NextRequest) {
  const ctx = await requireTenant({ allowExpired: true });
  if (!isTenantContext(ctx)) return ctx;
  try {
    const body = await request.json();
    const name = body.name !== undefined ? String(body.name).trim() : undefined;

    if (name !== undefined && !name) {
      return apiFail('Name cannot be empty');
    }

    await updateUserProfile(ctx.db, ctx.session.userId, { name });
    const profile = await getUserProfile(ctx.db, ctx.session.userId);
    if (!profile) return apiFail('Profile not found', 404);

    if (name !== undefined) {
      await updateSession({ userName: profile.name });
    }

    return apiOk(profile);
  } catch (e) {
    console.error(e);
    return apiFail('Failed to update profile', 500);
  }
}

export async function POST(request: NextRequest) {
  const ctx = await requireTenant({ allowExpired: true });
  if (!isTenantContext(ctx)) return ctx;
  try {
    const form = await request.formData();
    const file = form.get('avatar');

    if (!(file instanceof File)) {
      return apiFail('avatar file is required');
    }

    if (!ALLOWED_TYPES.has(file.type)) {
      return apiFail('Only JPG, PNG, WebP, or GIF images are allowed');
    }

    if (file.size > MAX_BYTES) {
      return apiFail('Image must be 2 MB or smaller');
    }

    await fs.mkdir(AVATAR_DIR, { recursive: true });

    const ext = extForMime(file.type);
    const companyId = ctx.session.companyId ?? 0;
    const filename = `${companyId}_${ctx.session.userId}.${ext}`;
    const diskPath = path.join(AVATAR_DIR, filename);
    const publicUrl = `/uploads/avatars/${filename}?v=${Date.now()}`;

    const buffer = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(diskPath, buffer);

    await updateUserProfile(ctx.db, ctx.session.userId, { avatarUrl: publicUrl });
    await updateSession({ userAvatarUrl: publicUrl });

    const profile = await getUserProfile(ctx.db, ctx.session.userId);
    return apiOk(profile, 'Profile photo updated');
  } catch (e) {
    console.error(e);
    return apiFail('Failed to upload profile photo', 500);
  }
}
