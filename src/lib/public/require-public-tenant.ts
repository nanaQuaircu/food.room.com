import { NextResponse } from 'next/server';
import { resolvePublicTenant } from '@/lib/public/resolve-tenant';
import { apiFail } from '@/lib/api/json';

export async function requirePublicTenant(slug: string) {
  const ctx = await resolvePublicTenant(slug);
  if (!ctx) {
    return { error: apiFail('Hotel not found or unavailable.', 404) as NextResponse };
  }
  return { ctx };
}
