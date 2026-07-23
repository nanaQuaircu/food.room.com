/** Allowed browser origins for Astro (ScrewFast) and Dasher frontends. */
export function getCorsOrigins(): string[] {
  const raw =
    process.env.CORS_ORIGINS ||
    'http://localhost:4321,http://127.0.0.1:4321,http://localhost:3001,http://127.0.0.1:3001';
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function applyCorsHeaders(request: Request, headers: Headers) {
  const origin = request.headers.get('origin');
  if (!origin) return;
  const allowed = getCorsOrigins();
  if (!allowed.includes(origin)) return;
  headers.set('Access-Control-Allow-Origin', origin);
  headers.set('Access-Control-Allow-Credentials', 'true');
  headers.set('Access-Control-Allow-Methods', 'GET,POST,PATCH,PUT,DELETE,OPTIONS');
  headers.set(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, X-Requested-With'
  );
  headers.set('Access-Control-Max-Age', '86400');
  headers.append('Vary', 'Origin');
}
