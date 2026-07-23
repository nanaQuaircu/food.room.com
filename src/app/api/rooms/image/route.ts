import fs from 'fs/promises';
import path from 'path';
import { NextRequest } from 'next/server';
import { requireTenant, isTenantContext, requireTenantRoles } from '@/lib/api/tenant-context';
import { ROOM_IMAGE_UPLOAD_ROLES } from '@/lib/room-images';
import { apiOk, apiFail } from '@/lib/api/json';
import {
  updateRoomImage,
  updateRoomTypeImage,
  addRoomGalleryImage,
  removeRoomGalleryImage,
  setRoomCoverFromGallery,
  listRoomImages,
} from '@/lib/services/hotel-service';

const ROOM_IMAGE_DIR = path.join(process.cwd(), 'public', 'uploads', 'rooms');
const TYPE_IMAGE_DIR = path.join(process.cwd(), 'public', 'uploads', 'room-types');
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_BYTES = 3 * 1024 * 1024;

function extForMime(mime: string) {
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  return 'jpg';
}

async function saveImage(dir: string, filename: string, file: File): Promise<string> {
  await fs.mkdir(dir, { recursive: true });
  const diskPath = path.join(dir, filename);
  const buffer = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(diskPath, buffer);
  const folder = path.basename(dir);
  return `/uploads/${folder}/${filename}`;
}

export async function GET(request: NextRequest) {
  const ctx = await requireTenant();
  if (!isTenantContext(ctx)) return ctx;
  const denied = requireTenantRoles(ctx, ROOM_IMAGE_UPLOAD_ROLES);
  if (denied) return denied;

  const roomId = Number(request.nextUrl.searchParams.get('room_id'));
  if (!roomId) return apiFail('room_id is required');
  try {
    const images = await listRoomImages(ctx.db, ctx.propertyId, roomId);
    return apiOk(images);
  } catch (e) {
    console.error(e);
    return apiFail('Failed to list room photos', 500);
  }
}

export async function POST(request: NextRequest) {
  const ctx = await requireTenant();
  if (!isTenantContext(ctx)) return ctx;
  const denied = requireTenantRoles(ctx, ROOM_IMAGE_UPLOAD_ROLES);
  if (denied) return denied;

  try {
    const form = await request.formData();
    const file = form.get('image');
    const roomId = Number(form.get('room_id'));
    const roomTypeId = Number(form.get('room_type_id'));
    const gallery = String(form.get('gallery') || '') === '1' || String(form.get('gallery') || '') === 'true';
    const coverImageId = Number(form.get('cover_image_id'));

    if (coverImageId && roomId) {
      const cover = await setRoomCoverFromGallery(ctx.db, ctx.propertyId, roomId, coverImageId);
      return apiOk({ room_id: roomId, image_url: cover.image_url }, 'Cover photo updated');
    }

    if (!(file instanceof File)) {
      return apiFail('image file is required');
    }
    if (!ALLOWED_TYPES.has(file.type)) {
      return apiFail('Only JPG, PNG, or WebP images are allowed');
    }
    if (file.size > MAX_BYTES) {
      return apiFail('Image must be 3 MB or smaller');
    }

    const ext = extForMime(file.type);
    const version = Date.now();

    if (roomId && gallery) {
      const filename = `property_${ctx.propertyId}_room_${roomId}_${version}.${ext}`;
      const baseUrl = await saveImage(ROOM_IMAGE_DIR, filename, file);
      const publicUrl = `${baseUrl}?v=${version}`;
      const image = await addRoomGalleryImage(ctx.db, ctx.propertyId, roomId, baseUrl);
      const images = await listRoomImages(ctx.db, ctx.propertyId, roomId);
      return apiOk(
        { room_id: roomId, image: { ...image, image_url: publicUrl }, images },
        'Photo added'
      );
    }

    if (roomId) {
      const filename = `property_${ctx.propertyId}_room_${roomId}.${ext}`;
      const baseUrl = await saveImage(ROOM_IMAGE_DIR, filename, file);
      const publicUrl = `${baseUrl}?v=${version}`;
      await updateRoomImage(ctx.db, ctx.propertyId, roomId, baseUrl);
      // Also ensure gallery has this cover
      const existing = await listRoomImages(ctx.db, ctx.propertyId, roomId);
      if (!existing.length) {
        await addRoomGalleryImage(ctx.db, ctx.propertyId, roomId, baseUrl);
      }
      return apiOk({ room_id: roomId, image_url: publicUrl }, 'Room photo updated');
    }

    if (roomTypeId) {
      const filename = `property_${ctx.propertyId}_type_${roomTypeId}.${ext}`;
      const baseUrl = await saveImage(TYPE_IMAGE_DIR, filename, file);
      const publicUrl = `${baseUrl}?v=${version}`;
      await updateRoomTypeImage(ctx.db, ctx.propertyId, roomTypeId, baseUrl);
      return apiOk({ room_type_id: roomTypeId, image_url: publicUrl }, 'Room type photo updated');
    }

    return apiFail('room_id or room_type_id is required');
  } catch (e) {
    console.error(e);
    const message = e instanceof Error ? e.message : 'Failed to upload room image';
    return apiFail(message, 400);
  }
}

export async function DELETE(request: NextRequest) {
  const ctx = await requireTenant();
  if (!isTenantContext(ctx)) return ctx;
  const denied = requireTenantRoles(ctx, ROOM_IMAGE_UPLOAD_ROLES);
  if (denied) return denied;

  try {
    const imageId = Number(request.nextUrl.searchParams.get('image_id'));
    const roomId = Number(request.nextUrl.searchParams.get('room_id'));
    const roomTypeId = Number(request.nextUrl.searchParams.get('room_type_id'));

    if (imageId) {
      const result = await removeRoomGalleryImage(ctx.db, ctx.propertyId, imageId);
      return apiOk(result, 'Photo removed');
    }

    if (roomId) {
      await updateRoomImage(ctx.db, ctx.propertyId, roomId, null);
      return apiOk({ room_id: roomId, image_url: null }, 'Room photo removed');
    }
    if (roomTypeId) {
      await updateRoomTypeImage(ctx.db, ctx.propertyId, roomTypeId, null);
      return apiOk({ room_type_id: roomTypeId, image_url: null }, 'Room type photo removed');
    }

    return apiFail('image_id, room_id, or room_type_id is required');
  } catch (e) {
    console.error(e);
    const message = e instanceof Error ? e.message : 'Failed to remove room image';
    return apiFail(message, 400);
  }
}
