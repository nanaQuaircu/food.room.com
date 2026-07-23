import { NextRequest } from 'next/server';
import { requireTenant, isTenantContext } from '@/lib/api/tenant-context';
import { apiOk, apiFail } from '@/lib/api/json';
import {
  countUnreadNotifications,
  listNotificationsForUser,
  markAllNotificationsRead,
  markNotificationRead,
} from '@/lib/services/in-app-notifications';

export async function GET(request: NextRequest) {
  const ctx = await requireTenant();
  if (!isTenantContext(ctx)) return ctx;
  try {
    const limit = Number(request.nextUrl.searchParams.get('limit') || 30);
    const [items, unread] = await Promise.all([
      listNotificationsForUser(ctx.db, ctx.session.userId, ctx.session.userRole, limit),
      countUnreadNotifications(ctx.db, ctx.session.userId, ctx.session.userRole),
    ]);
    return apiOk({ items, unread });
  } catch (e) {
    console.error(e);
    return apiFail('Failed to load notifications', 500);
  }
}

export async function PATCH(request: NextRequest) {
  const ctx = await requireTenant();
  if (!isTenantContext(ctx)) return ctx;
  try {
    const body = await request.json();
    if (body.all) {
      await markAllNotificationsRead(ctx.db, ctx.session.userId, ctx.session.userRole);
      return apiOk({ read: 'all' });
    }
    const id = Number(body.id);
    if (!id) return apiFail('id is required');
    await markNotificationRead(ctx.db, id, ctx.session.userId, ctx.session.userRole);
    return apiOk({ id });
  } catch (e) {
    console.error(e);
    return apiFail('Failed to update notifications', 500);
  }
}
