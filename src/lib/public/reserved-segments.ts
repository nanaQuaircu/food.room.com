/** First URL segments reserved for staff/platform — not hotel slugs. */
export const RESERVED_FIRST_SEGMENTS = new Set([
  'login',
  'dashboard',
  'platform',
  'front-desk',
  'reservations',
  'housekeeping',
  'rooms',
  'guests',
  'billing',
  'reports',
  'inventory',
  'staff',
  'attendance',
  'settings',
  'change-password',
  'api',
  'assets',
  'uploads',
  'favicon.ico',
  'manifest.webmanifest',
  'sw.js',
]);

export function isGuestSlugSegment(segment: string): boolean {
  if (!segment || RESERVED_FIRST_SEGMENTS.has(segment)) return false;
  return /^[a-z0-9][a-z0-9-]*$/.test(segment);
}

export function isGuestSitePath(pathname: string): boolean {
  const segment = pathname.split('/').filter(Boolean)[0];
  return segment ? isGuestSlugSegment(segment) : false;
}
