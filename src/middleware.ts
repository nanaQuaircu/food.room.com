import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';
import { canAccessModule, moduleIdFromPath, getHomePathForRole } from '@/lib/roles';
import { isGuestSitePath } from '@/lib/public/reserved-segments';
import { applyCorsHeaders } from '@/lib/api/cors';

const SESSION_COOKIE = 'hotel_session';

const publicPaths = [
  '/',
  '/login',
  '/api/hotel/lookup',
  '/api/auth/login',
  '/api/public',
  '/manifest.webmanifest',
  '/sw.js',
];
const passwordPaths = ['/change-password', '/api/auth/change-password', '/api/auth/logout'];
const platformPaths = ['/platform'];
const platformApiPaths = ['/api/platform'];

function isApiPath(pathname: string) {
  return pathname.startsWith('/api/');
}

function unauthorizedApiResponse(request: NextRequest) {
  const res = NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  applyCorsHeaders(request, res.headers);
  return res;
}

function getSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('SESSION_SECRET must be at least 32 characters in .env.local');
  }
  return new TextEncoder().encode(secret);
}

type SessionJwt = {
  type?: string;
  mustChangePassword?: boolean;
  userRole?: string;
};

async function readSession(request: NextRequest): Promise<SessionJwt | null> {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return payload as SessionJwt;
  } catch {
    return null;
  }
}

function finish(request: NextRequest, response: NextResponse) {
  if (isApiPath(request.nextUrl.pathname)) {
    applyCorsHeaders(request, response.headers);
  }
  return response;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.startsWith('/assets') ||
    pathname.startsWith('/uploads') ||
    pathname.match(/\.(svg|png|jpg|jpeg|gif|webp|ico)$/)
  ) {
    return NextResponse.next();
  }

  // CORS preflight for Astro / Dasher frontends
  if (isApiPath(pathname) && request.method === 'OPTIONS') {
    const res = new NextResponse(null, { status: 204 });
    applyCorsHeaders(request, res.headers);
    return res;
  }

  const session = await readSession(request);
  const isPublic =
    publicPaths.some((p) => pathname === p || pathname.startsWith(`${p}/`)) ||
    isGuestSitePath(pathname);
  const isPasswordPath = passwordPaths.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  const isPlatform = platformPaths.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  const isPlatformApi = platformApiPaths.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (session?.mustChangePassword && !isPasswordPath && !isPublic) {
    return finish(request, NextResponse.redirect(new URL('/change-password', request.url)));
  }

  if (pathname === '/') {
    if (session?.type === 'platform') {
      return finish(
        request,
        NextResponse.redirect(
          new URL(session.mustChangePassword ? '/change-password' : '/platform', request.url)
        )
      );
    }
    if (session?.type === 'tenant') {
      return finish(
        request,
        NextResponse.redirect(
          new URL(
            session.mustChangePassword ? '/change-password' : getHomePathForRole(session.userRole),
            request.url
          )
        )
      );
    }
    return finish(request, NextResponse.next());
  }

  if (isPublic) {
    if (session?.type === 'tenant' && pathname === '/login' && !session.mustChangePassword) {
      return finish(
        request,
        NextResponse.redirect(new URL(getHomePathForRole(session.userRole), request.url))
      );
    }
    if (session?.type === 'platform' && pathname === '/login' && !session.mustChangePassword) {
      return finish(request, NextResponse.redirect(new URL('/platform', request.url)));
    }
    return finish(request, NextResponse.next());
  }

  if (isPasswordPath) {
    if (!session) {
      return finish(request, NextResponse.redirect(new URL('/login', request.url)));
    }
    return finish(request, NextResponse.next());
  }

  if (isPlatformApi) {
    if (!session || session.type !== 'platform') {
      return unauthorizedApiResponse(request);
    }
    return finish(request, NextResponse.next());
  }

  if (isPlatform) {
    if (!session || session.type !== 'platform') {
      return finish(request, NextResponse.redirect(new URL('/login', request.url)));
    }
    return finish(request, NextResponse.next());
  }

  if (!session || session.type !== 'tenant') {
    if (session?.type === 'guest') {
      if (isApiPath(pathname)) {
        return unauthorizedApiResponse(request);
      }
      return finish(request, NextResponse.redirect(new URL('/login', request.url)));
    }
    if (isApiPath(pathname)) {
      return unauthorizedApiResponse(request);
    }
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('next', pathname);
    return finish(request, NextResponse.redirect(loginUrl));
  }

  const moduleId = moduleIdFromPath(pathname);
  if (moduleId && !canAccessModule(session.userRole, moduleId)) {
    if (isApiPath(pathname)) {
      const res = NextResponse.json(
        { success: false, message: 'You do not have permission to access this resource.' },
        { status: 403 }
      );
      applyCorsHeaders(request, res.headers);
      return res;
    }
    const fallback = getHomePathForRole(session.userRole);
    return finish(request, NextResponse.redirect(new URL(fallback, request.url)));
  }

  return finish(request, NextResponse.next());
}

export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
};
