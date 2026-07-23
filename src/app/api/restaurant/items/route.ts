import { NextRequest } from 'next/server';
import { requireTenant, isTenantContext } from '@/lib/api/tenant-context';
import { apiOk, apiFail } from '@/lib/api/json';
import {
  listMenuItemsForStaff,
  upsertMenuItem,
  deleteMenuItem,
} from '@/lib/services/food-order-service';

export async function GET() {
  const ctx = await requireTenant();
  if (!isTenantContext(ctx)) return ctx;
  try {
    const items = await listMenuItemsForStaff(ctx.db, ctx.propertyId);
    return apiOk(items.map((i) => ({ ...i, price: Number(i.price) })));
  } catch (e) {
    console.error(e);
    return apiFail('Failed to load menu items.', 500);
  }
}

export async function POST(request: NextRequest) {
  const ctx = await requireTenant();
  if (!isTenantContext(ctx)) return ctx;
  try {
    const body = await request.json();
    if (!body.name?.trim()) return apiFail('Item name is required.');
    if (!body.category_id) return apiFail('Category is required.');
    if (body.price === undefined || body.price === null) return apiFail('Price is required.');
    const result = await upsertMenuItem(ctx.db, ctx.propertyId, {
      id: body.id ? Number(body.id) : undefined,
      category_id: Number(body.category_id),
      name: String(body.name).trim(),
      description: body.description?.trim() || undefined,
      price: Number(body.price),
      image_url: body.image_url?.trim() || undefined,
      is_available: body.is_available !== undefined ? Number(body.is_available) : 1,
      sort_order: body.sort_order !== undefined ? Number(body.sort_order) : 0,
    });
    return apiOk(result, body.id ? 'Item updated.' : 'Item created.');
  } catch (e) {
    console.error(e);
    return apiFail('Failed to save menu item.', 500);
  }
}

export async function DELETE(request: NextRequest) {
  const ctx = await requireTenant();
  if (!isTenantContext(ctx)) return ctx;
  try {
    const { id } = await request.json();
    if (!id) return apiFail('Item ID required.');
    await deleteMenuItem(ctx.db, ctx.propertyId, Number(id));
    return apiOk(null, 'Item deleted.');
  } catch (e) {
    console.error(e);
    const msg = e instanceof Error ? e.message : 'Delete failed.';
    return apiFail(msg, 400);
  }
}
