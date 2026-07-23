import { NextRequest } from 'next/server';
import { requireTenant, isTenantContext } from '@/lib/api/tenant-context';
import { apiOk, apiFail } from '@/lib/api/json';
import {
  dashboardStats,
  listLocations,
  listItemsWithBalances,
  createWarehouseItem,
  createPurchase,
  createTransfer,
  logUsage,
  listPurchases,
  listTransfers,
  listUsage,
  listConversions,
  upsertConversion,
  updateWarehouseItem,
  deleteWarehouseItem,
  updatePurchaseMeta,
  deletePurchase,
  updateTransferMeta,
  deleteTransfer,
  updateUsageLog,
  deleteUsageLog,
  updateConversion,
  deleteConversion,
} from '@/lib/services/warehouse-service';

export async function GET(request: NextRequest) {
  const ctx = await requireTenant();
  if (!isTenantContext(ctx)) return ctx;
  try {
    const view = request.nextUrl.searchParams.get('view') || 'dashboard';

    if (view === 'dashboard') {
      return apiOk(await dashboardStats(ctx.db, ctx.propertyId));
    }
    if (view === 'locations') {
      return apiOk(await listLocations(ctx.db, ctx.propertyId));
    }
    if (view === 'items') {
      return apiOk(await listItemsWithBalances(ctx.db, ctx.propertyId));
    }
    if (view === 'purchases') {
      return apiOk(await listPurchases(ctx.db, ctx.propertyId));
    }
    if (view === 'transfers') {
      return apiOk(await listTransfers(ctx.db, ctx.propertyId));
    }
    if (view === 'usage') {
      return apiOk(await listUsage(ctx.db, ctx.propertyId));
    }
    if (view === 'conversions') {
      return apiOk(await listConversions(ctx.db, ctx.propertyId));
    }

    return apiFail('Unknown view. Use dashboard, locations, items, purchases, transfers, usage, or conversions.');
  } catch (e) {
    console.error(e);
    return apiFail('Failed to load warehouse data', 500);
  }
}

export async function POST(request: NextRequest) {
  const ctx = await requireTenant();
  if (!isTenantContext(ctx)) return ctx;
  try {
    const body = await request.json();
    const entity = String(body.entity || '').trim();
    const userId = ctx.session.userId ?? null;

    if (entity === 'item') {
      const name = String(body.name || '').trim();
      if (!name) return apiFail('name is required for item');

      const id = await createWarehouseItem(ctx.db, ctx.propertyId, {
        name,
        sku: body.sku ? String(body.sku) : undefined,
        department: body.department ? String(body.department) : undefined,
        category: body.category ? String(body.category) : undefined,
        unit: body.unit ? String(body.unit) : undefined,
        purchase_unit: body.purchase_unit ? String(body.purchase_unit) : undefined,
        usage_unit: body.usage_unit ? String(body.usage_unit) : undefined,
        conversion_factor: body.conversion_factor !== undefined ? Number(body.conversion_factor) : undefined,
        quantity_on_hand: body.quantity_on_hand !== undefined ? Number(body.quantity_on_hand) : undefined,
        reorder_level: body.reorder_level !== undefined ? Number(body.reorder_level) : undefined,
        unit_cost: body.unit_cost !== undefined ? Number(body.unit_cost) : undefined,
        supplier_id: body.supplier_id ? Number(body.supplier_id) : undefined,
      });
      return apiOk({ id });
    }

    if (entity === 'purchase') {
      const lines = Array.isArray(body.lines) ? body.lines : [];
      if (!lines.length) return apiFail('At least one purchase line is required.');

      const result = await createPurchase(ctx.db, ctx.propertyId, userId, {
        location_id: body.location_id ? Number(body.location_id) : undefined,
        supplier_id: body.supplier_id ? Number(body.supplier_id) : undefined,
        purchase_date: String(body.purchase_date || new Date().toISOString().slice(0, 10)),
        notes: body.notes ? String(body.notes) : undefined,
        lines: lines.map((l: { item_id: number; quantity: number; unit_cost: number }) => ({
          item_id: Number(l.item_id),
          quantity: Number(l.quantity),
          unit_cost: Number(l.unit_cost),
        })),
      });
      return apiOk(result);
    }

    if (entity === 'transfer') {
      const lines = Array.isArray(body.lines) ? body.lines : [];
      if (!lines.length) return apiFail('At least one transfer line is required.');
      if (!body.from_location_id || !body.to_location_id) {
        return apiFail('from_location_id and to_location_id are required.');
      }

      const result = await createTransfer(ctx.db, ctx.propertyId, userId, {
        from_location_id: Number(body.from_location_id),
        to_location_id: Number(body.to_location_id),
        transfer_date: String(body.transfer_date || new Date().toISOString().slice(0, 10)),
        notes: body.notes ? String(body.notes) : undefined,
        lines: lines.map((l: { item_id: number; quantity: number }) => ({
          item_id: Number(l.item_id),
          quantity: Number(l.quantity),
        })),
      });
      return apiOk(result);
    }

    if (entity === 'usage') {
      const lines = Array.isArray(body.lines) ? body.lines : [];
      if (!lines.length) return apiFail('At least one usage line is required.');
      if (!body.location_id) return apiFail('location_id is required.');

      const result = await logUsage(ctx.db, ctx.propertyId, userId, {
        location_id: Number(body.location_id),
        usage_date: String(body.usage_date || new Date().toISOString().slice(0, 10)),
        notes: body.notes ? String(body.notes) : undefined,
        lines: lines.map((l: { item_id: number; quantity: number }) => ({
          item_id: Number(l.item_id),
          quantity: Number(l.quantity),
        })),
      });
      return apiOk(result);
    }

    if (entity === 'conversion') {
      const id = await upsertConversion(ctx.db, ctx.propertyId, {
        item_id: body.item_id ? Number(body.item_id) : undefined,
        from_unit: String(body.from_unit || ''),
        to_unit: String(body.to_unit || ''),
        factor: Number(body.factor),
      });
      return apiOk({ id });
    }

    return apiFail('entity must be item, purchase, transfer, usage, or conversion');
  } catch (e) {
    console.error(e);
    const message = e instanceof Error ? e.message : 'Failed to create warehouse record';
    return apiFail(message, 400);
  }
}

export async function PATCH(request: NextRequest) {
  const ctx = await requireTenant();
  if (!isTenantContext(ctx)) return ctx;
  try {
    const body = await request.json();
    const entity = String(body.entity || '').trim();
    const id = Number(body.id);
    if (!id) return apiFail('id is required');

    if (entity === 'item') {
      const name = String(body.name || '').trim();
      if (!name) return apiFail('name is required');
      await updateWarehouseItem(ctx.db, ctx.propertyId, id, {
        name,
        sku: body.sku != null ? String(body.sku) : null,
        department: body.department != null ? String(body.department) : null,
        category: body.category != null ? String(body.category) : null,
        unit: body.unit != null ? String(body.unit) : null,
        purchase_unit: body.purchase_unit != null ? String(body.purchase_unit) : null,
        usage_unit: body.usage_unit != null ? String(body.usage_unit) : null,
        conversion_factor: body.conversion_factor !== undefined ? Number(body.conversion_factor) : undefined,
        reorder_level: body.reorder_level !== undefined ? Number(body.reorder_level) : undefined,
        unit_cost: body.unit_cost !== undefined ? Number(body.unit_cost) : undefined,
      });
      return apiOk({ id });
    }

    if (entity === 'purchase') {
      await updatePurchaseMeta(ctx.db, ctx.propertyId, id, {
        purchase_date: body.purchase_date ? String(body.purchase_date).slice(0, 10) : undefined,
        notes: body.notes != null ? String(body.notes) : undefined,
        supplier_id: body.supplier_id !== undefined ? (body.supplier_id ? Number(body.supplier_id) : null) : undefined,
      });
      return apiOk({ id });
    }

    if (entity === 'transfer') {
      await updateTransferMeta(ctx.db, ctx.propertyId, id, {
        transfer_date: body.transfer_date ? String(body.transfer_date).slice(0, 10) : undefined,
        notes: body.notes != null ? String(body.notes) : undefined,
      });
      return apiOk({ id });
    }

    if (entity === 'usage') {
      await updateUsageLog(ctx.db, ctx.propertyId, id, {
        usage_date: body.usage_date ? String(body.usage_date).slice(0, 10) : undefined,
        notes: body.notes != null ? String(body.notes) : undefined,
        quantity: body.quantity !== undefined ? Number(body.quantity) : undefined,
      });
      return apiOk({ id });
    }

    if (entity === 'conversion') {
      await updateConversion(ctx.db, ctx.propertyId, id, {
        item_id: body.item_id ? Number(body.item_id) : null,
        from_unit: String(body.from_unit || ''),
        to_unit: String(body.to_unit || ''),
        factor: Number(body.factor),
      });
      return apiOk({ id });
    }

    return apiFail('entity must be item, purchase, transfer, usage, or conversion');
  } catch (e) {
    console.error(e);
    const message = e instanceof Error ? e.message : 'Failed to update warehouse record';
    return apiFail(message, 400);
  }
}

export async function DELETE(request: NextRequest) {
  const ctx = await requireTenant();
  if (!isTenantContext(ctx)) return ctx;
  try {
    const body = await request.json();
    const entity = String(body.entity || '').trim();
    const id = Number(body.id);
    if (!id) return apiFail('id is required');

    if (entity === 'item') {
      await deleteWarehouseItem(ctx.db, ctx.propertyId, id);
      return apiOk({ id });
    }
    if (entity === 'purchase') {
      await deletePurchase(ctx.db, ctx.propertyId, id);
      return apiOk({ id });
    }
    if (entity === 'transfer') {
      await deleteTransfer(ctx.db, ctx.propertyId, id);
      return apiOk({ id });
    }
    if (entity === 'usage') {
      await deleteUsageLog(ctx.db, ctx.propertyId, id);
      return apiOk({ id });
    }
    if (entity === 'conversion') {
      await deleteConversion(ctx.db, ctx.propertyId, id);
      return apiOk({ id });
    }

    return apiFail('entity must be item, purchase, transfer, usage, or conversion');
  } catch (e) {
    console.error(e);
    const message = e instanceof Error ? e.message : 'Failed to delete warehouse record';
    return apiFail(message, 400);
  }
}
