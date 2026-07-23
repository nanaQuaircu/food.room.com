import { NextRequest } from 'next/server';
import { requireTenant, isTenantContext } from '@/lib/api/tenant-context';
import { apiOk, apiFail } from '@/lib/api/json';
import {
  listMenuCategories,
  upsertMenuCategory,
  deleteMenuCategory,
} from '@/lib/services/food-order-service';

export async function GET() {
  const ctx = await requireTenant();
  if (!isTenantContext(ctx)) return ctx;
  try {
    const cats = await listMenuCategories(ctx.db, ctx.propertyId);
    return apiOk(cats);
  } catch (e) {
    console.error(e);
    return apiFail('Failed to load categories.', 500);
  }
}

export async function POST(request: NextRequest) {
  const ctx = await requireTenant();
  if (!isTenantContext(ctx)) return ctx;
  try {
    const body = await request.json();
    if (!body.name?.trim()) return apiFail('Category name is required.');
    const result = await upsertMenuCategory(ctx.db, ctx.propertyId, {
      id: body.id ? Number(body.id) : undefined,
      name: String(body.name).trim(),
      sort_order: body.sort_order !== undefined ? Number(body.sort_order) : 0,
      is_active: body.is_active !== undefined ? Number(body.is_active) : 1,
    });
    return apiOk(result, body.id ? 'Category updated.' : 'Category created.');
  } catch (e) {
    console.error(e);
    return apiFail('Failed to save category.', 500);
  }
}

export async function DELETE(request: NextRequest) {
  const ctx = await requireTenant();
  if (!isTenantContext(ctx)) return ctx;
  try {
    const { id } = await request.json();
    if (!id) return apiFail('Category ID required.');
    await deleteMenuCategory(ctx.db, ctx.propertyId, Number(id));
    return apiOk(null, 'Category deleted.');
  } catch (e) {
    console.error(e);
    const msg = e instanceof Error ? e.message : 'Delete failed.';
    return apiFail(msg, 400);
  }
}
