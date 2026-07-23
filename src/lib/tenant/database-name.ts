export function suggestedDatabaseName(slug: string) {
  const safe = slug.replace(/[^a-z0-9_]/g, '_').slice(0, 40);
  return `hotel_${safe}`;
}

export function suggestDatabaseNameFromHotelName(hotelName: string) {
  const slug = hotelName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return suggestedDatabaseName(slug);
}

export function normalizeDatabaseName(value: string) {
  let normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64);

  if (normalized && !normalized.startsWith('hotel_')) {
    normalized = `hotel_${normalized}`.slice(0, 64);
  }

  return normalized;
}

export function validateDatabaseName(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return 'Database name is required.';
  }
  if (trimmed.length > 64) {
    return 'Database name must be 64 characters or fewer.';
  }
  if (!/^[a-z][a-z0-9_]*$/.test(trimmed)) {
    return 'Use lowercase letters, numbers, and underscores only. Must start with a letter.';
  }
  if (!trimmed.startsWith('hotel_')) {
    return 'Tenant database names must start with hotel_.';
  }
  return null;
}
