import type { ApiResponse } from '@/lib/db/types';

type CacheEntry = {
  expires: number;
  promise?: Promise<ApiResponse<unknown>>;
  data?: ApiResponse<unknown>;
};

const GET_CACHE = new Map<string, CacheEntry>();
const DEFAULT_TTL_MS = 25_000;

function cacheKey(url: string, init?: RequestInit) {
  return `${(init?.method || 'GET').toUpperCase()}:${url}`;
}

function shouldCache(url: string, init?: RequestInit) {
  const method = (init?.method || 'GET').toUpperCase();
  if (method !== 'GET') return false;
  if (url.includes('/api/auth/')) return false;
  return url.startsWith('/api/');
}

/** Synchronous read for initial React state (avoids full-page loader flash). */
export function peekApiCache<T>(url: string): ApiResponse<T> | null {
  const key = cacheKey(url);
  const hit = GET_CACHE.get(key);
  if (hit?.data && hit.expires > Date.now()) {
    return hit.data as ApiResponse<T>;
  }
  return null;
}

/** Drop cached GET responses (all keys, or those matching a prefix). */
export function invalidateApiCache(prefix?: string) {
  if (!prefix) {
    GET_CACHE.clear();
    return;
  }
  for (const key of GET_CACHE.keys()) {
    if (key.includes(prefix)) GET_CACHE.delete(key);
  }
}

export async function fetchApi<T>(
  url: string,
  init?: RequestInit & { cacheTtlMs?: number; skipCache?: boolean }
): Promise<ApiResponse<T>> {
  const { cacheTtlMs = DEFAULT_TTL_MS, skipCache = false, ...requestInit } = init ?? {};
  const method = (requestInit.method || 'GET').toUpperCase();
  const key = cacheKey(url, requestInit);
  const useCache = !skipCache && shouldCache(url, requestInit);

  if (useCache) {
    const hit = GET_CACHE.get(key);
    if (hit?.data && hit.expires > Date.now()) {
      return hit.data as ApiResponse<T>;
    }
    if (hit?.promise) {
      return hit.promise as Promise<ApiResponse<T>>;
    }
  }

  const request = (async () => {
    const res = await fetch(url, {
      ...requestInit,
      headers: {
        ...(method !== 'GET' ? { 'Content-Type': 'application/json' } : {}),
        ...requestInit.headers,
      },
    });
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      throw new Error('Unexpected server response');
    }
    return res.json() as Promise<ApiResponse<T>>;
  })();

  if (useCache) {
    GET_CACHE.set(key, {
      expires: Date.now() + cacheTtlMs,
      promise: request as Promise<ApiResponse<unknown>>,
    });
  }

  try {
    const json = await request;
    if (useCache) {
      // Never cache auth failures — callers re-check login state frequently
      if (json?.success === false) {
        GET_CACHE.delete(key);
      } else {
        GET_CACHE.set(key, { expires: Date.now() + cacheTtlMs, data: json as ApiResponse<unknown> });
      }
    }
    if (method !== 'GET') {
      const apiRoot = url.split('?')[0];
      invalidateApiCache(apiRoot);
      if (
        apiRoot.includes('/api/rooms') ||
        apiRoot.includes('/api/front-desk') ||
        apiRoot.includes('/api/housekeeping')
      ) {
        invalidateApiCache('/api/dashboard');
        invalidateApiCache('/api/front-desk');
        invalidateApiCache('/api/housekeeping');
        invalidateApiCache('/api/rooms');
      }
    }
    return json;
  } catch (err) {
    if (useCache) GET_CACHE.delete(key);
    throw err;
  }
}
