export type SavedHotel = {
  id: number;
  name: string;
  logo_url: string | null;
};

const STORAGE_KEY = 'hotel_pms_connected_hotel';

export function loadSavedHotel(): SavedHotel | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedHotel;
    if (!parsed?.id || !parsed?.name) return null;
    return {
      id: Number(parsed.id),
      name: String(parsed.name),
      logo_url: parsed.logo_url ?? null,
    };
  } catch {
    return null;
  }
}

export function saveSavedHotel(hotel: SavedHotel) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(hotel));
}

export function clearSavedHotel() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(STORAGE_KEY);
}
