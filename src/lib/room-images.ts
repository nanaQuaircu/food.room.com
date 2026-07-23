import type { TenantRole } from '@/lib/roles';

export const ROOM_IMAGE_UPLOAD_ROLES: TenantRole[] = [
  'owner',
  'admin',
  'manager',
  'front_desk',
];

export type RoomImageSource = {
  image_url?: string | null;
  room_type_image_url?: string | null;
  room_type_name?: string | null;
};

const TYPE_ACCENTS: Record<string, string> = {
  standard: '#1F3A63',
  deluxe: '#C6A34D',
  executive: '#3D5A85',
  family: '#3B6D11',
  suite: '#3D5A85',
  penthouse: '#4A3714',
};

const DEFAULT_TYPE_IMAGES: Array<{ match: string; path: string }> = [
  { match: 'deluxe', path: '/assets/images/rooms/deluxe-king.png' },
  { match: 'standard', path: '/assets/images/rooms/standard-twin.png' },
  { match: 'executive', path: '/assets/images/rooms/executive-suite.png' },
  { match: 'family', path: '/assets/images/rooms/family-room.png' },
  { match: 'suite', path: '/assets/images/rooms/executive-suite.png' },
];

function normalizeTypeKey(name?: string | null) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');
}

export function defaultImageForRoomType(name?: string | null): string {
  const key = normalizeTypeKey(name);
  for (const { match, path } of DEFAULT_TYPE_IMAGES) {
    if (key.includes(match)) return path;
  }
  return '/assets/images/rooms/deluxe-king.png';
}

export function accentForRoomType(name?: string | null): string {
  const key = String(name || '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');
  for (const [part, color] of Object.entries(TYPE_ACCENTS)) {
    if (key.includes(part)) return color;
  }
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash + key.charCodeAt(i) * (i + 1)) % 360;
  return `hsl(${hash} 55% 48%)`;
}

export function resolveRoomImageUrl(room: RoomImageSource): string {
  const url = room.image_url || room.room_type_image_url;
  if (url?.trim()) return url.trim();
  return defaultImageForRoomType(room.room_type_name);
}

export function roomPlaceholderPath() {
  return '/assets/images/room-placeholder.svg';
}
