import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import type { SessionPayload } from '@/lib/db/types';

const SESSION_COOKIE = 'hotel_session';
const LAST_COMPANY_COOKIE = 'hotel_last_company_id';
const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

function getSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('SESSION_SECRET must be at least 32 characters in .env.local');
  }
  return new TextEncoder().encode(secret);
}

export async function createSession(payload: SessionPayload) {
  const token = await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(getSecret());

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE,
  });
}

export async function destroySession() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

export async function updateSession(patch: Partial<SessionPayload>) {
  const current = await getSession();
  if (!current) return;
  await createSession({ ...current, ...patch });
}

export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, getSecret());
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

export async function setLastCompanyId(companyId: number) {
  const cookieStore = await cookies();
  cookieStore.set(LAST_COMPANY_COOKIE, String(companyId), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function getLastCompanyId(): Promise<number | null> {
  const cookieStore = await cookies();
  const value = cookieStore.get(LAST_COMPANY_COOKIE)?.value;
  if (!value) return null;
  const id = Number(value);
  return Number.isFinite(id) && id > 0 ? id : null;
}

export { SESSION_COOKIE, LAST_COMPANY_COOKIE };
