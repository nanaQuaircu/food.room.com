/** Shared amenity keys for staff room editor + guest website. */
export const ROOM_AMENITY_OPTIONS = [
  { key: 'wifi', label: 'Free Wi‑Fi' },
  { key: 'ac', label: 'Air conditioning' },
  { key: 'tv', label: 'Flat-screen TV' },
  { key: 'dstv', label: 'DSTV' },
  { key: 'ensuite', label: 'Private bathroom' },
  { key: 'hot_water', label: 'Hot water' },
  { key: 'fridge', label: 'Mini fridge' },
  { key: 'safe', label: 'In-room safe' },
  { key: 'desk', label: 'Work desk' },
  { key: 'balcony', label: 'Balcony' },
  { key: 'jacuzzi', label: 'Jacuzzi' },
  { key: 'city_view', label: 'City view' },
  { key: 'king_bed', label: 'King bed' },
  { key: 'twin_beds', label: 'Twin beds' },
  { key: 'sofa', label: 'Sofa seating' },
  { key: 'coffee', label: 'Coffee / tea' },
  { key: 'room_service', label: 'Room service' },
] as const;

export type RoomAmenityKey = (typeof ROOM_AMENITY_OPTIONS)[number]['key'];

export const BED_TYPE_OPTIONS = [
  'King',
  'Queen',
  'Twin',
  'Double',
  'Single',
  'Sofa bed',
] as const;

export function parseAmenities(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map(String).filter(Boolean);
  }
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
    } catch {
      return raw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    }
  }
  return [];
}

export function amenityLabel(key: string): string {
  return ROOM_AMENITY_OPTIONS.find((a) => a.key === key)?.label || key;
}

export function normalizeAmenities(input: unknown): string[] {
  const allowed = new Set(ROOM_AMENITY_OPTIONS.map((a) => a.key));
  return parseAmenities(input).filter((k) => allowed.has(k as RoomAmenityKey));
}
