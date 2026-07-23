/**
 * Temporary password for new / reset staff accounts.
 * Prefer DEFAULT_STAFF_PASSWORD in .env.local for production.
 * Avoid bare `$` in .env values (dotenv expansion); use quotes if needed.
 */
export const DEFAULT_PASSWORD = process.env.DEFAULT_STAFF_PASSWORD || 'P@$$w0rd';

function parseLoginList(raw: string | undefined, fallback: string[]): string[] {
  if (raw === undefined) return fallback;
  return raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function getPlatformBypassLogins(): string[] {
  // Production: no default bypass — set PLATFORM_BYPASS_LOGINS explicitly if needed.
  const fallback = process.env.NODE_ENV === 'production' ? [] : ['alex andoh'];
  return parseLoginList(process.env.PLATFORM_BYPASS_LOGINS, fallback);
}

export function getPublicPlatformBypassLogins(): string[] {
  const fallback = process.env.NODE_ENV === 'production' ? [] : ['alex andoh'];
  return parseLoginList(
    process.env.NEXT_PUBLIC_PLATFORM_BYPASS_LOGINS || process.env.PLATFORM_BYPASS_LOGINS,
    fallback
  );
}
