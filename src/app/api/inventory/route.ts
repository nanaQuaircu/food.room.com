import { NextRequest } from 'next/server';
import { requireTenant, isTenantContext } from '@/lib/api/tenant-context';
import { apiOk, apiFail } from '@/lib/api/json';
import {
  listSuppliers,
  listStockItems,
  createSupplier,
  createStockItem,
  updateSupplier,
  deleteSupplier,
  updateStockItem,
  deleteStockItem,
  adjustStock,
} from '@/lib/services/hotel-service';
import {
  createPurchaseOrder,
  listPurchaseOrders,
  updatePurchaseOrderStatus,
} from '@/lib/services/purchase-order-service';

export async function GET(request: NextRequest) {
  const ctx = await requireTenant();
  if (!isTenantContext(ctx)) return ctx;
  try {
    const view = request.nextUrl.searchParams.get('view');
    if (view === 'purchase_orders') {
      return apiOk(await listPurchaseOrders(ctx.db, ctx.propertyId));
    }
    const [suppliers, items] = await Promise.all([
      listSuppliers(ctx.db, ctx.propertyId),
      listStockItems(ctx.db, ctx.propertyId),
    ]);
    return apiOk({ suppliers, items });
  } catch (e) {
    console.error(e);
    return apiFail('Failed to load inventory', 500);
  }
}

export async function POST(request: NextRequest) {
  const ctx = await requireTenant();
  if (!isTenantContext(ctx)) return ctx;
  try {
    const body = await request.json();
    const entity = String(body.entity || '').trim();

    if (entity === 'supplier') {
      const name = String(body.name || '').trim();
      if (!name) {
        return apiFail('name is required for supplier');
      }

      const id = await createSupplier(ctx.db, ctx.propertyId, {
        name,
        contact_name: body.contact_name ? String(body.contact_name) : undefined,
        email: body.email ? String(body.email) : undefined,
        phone: body.phone ? String(body.phone) : undefined,
      });
      return apiOk({ id });
    }

    if (entity === 'item') {
      const name = String(body.name || '').trim();
      if (!name) {
        return apiFail('name is required for item');
      }

      const id = await createStockItem(
        ctx.db,
        ctx.propertyId,
        {
          name,
          sku: body.sku ? String(body.sku) : undefined,
          department: body.department ? String(body.department) : undefined,
          unit: body.unit ? String(body.unit) : undefined,
          quantity_on_hand: body.quantity_on_hand !== undefined ? Number(body.quantity_on_hand) : undefined,
          reorder_level: body.reorder_level !== undefined ? Number(body.reorder_level) : undefined,
          unit_cost: body.unit_cost !== undefined ? Number(body.unit_cost) : undefined,
          supplier_id: body.supplier_id ? Number(body.supplier_id) : undefined,
        },
        { companyId: ctx.session.companyId }
      );
      return apiOk({ id });
    }

    if (entity === 'purchase_order') {
      const lines = Array.isArray(body.lines) ? body.lines : [];
      const result = await createPurchaseOrder(ctx.db, ctx.propertyId, ctx.session.userId, {
        supplier_id: body.supplier_id ? Number(body.supplier_id) : undefined,
        notes: body.notes ? String(body.notes) : undefined,
        lines: lines.map((l: { stock_item_id?: number; description: string; quantity: number; unit_cost: number }) => ({
          stock_item_id: l.stock_item_id ? Number(l.stock_item_id) : undefined,
          description: String(l.description || ''),
          quantity: Number(l.quantity),
          unit_cost: Number(l.unit_cost),
        })),
      });
      return apiOk(result);
    }

    return apiFail('entity must be supplier, item, or purchase_order');
  } catch (e) {
    console.error(e);
    return apiFail('Failed to create inventory record', 500);
  }
}

export async function PATCH(request: NextRequest) {
  const ctx = await requireTenant();
  if (!isTenantContext(ctx)) return ctx;
  try {
    const body = await request.json();
    const entity = String(body.entity || 'stock').trim();

    if (entity === 'purchase_order') {
      const orderId = Number(body.id);
      const status = String(body.status || '').trim();
      if (!orderId || !status) return apiFail('id and status are required.');
      await updatePurchaseOrderStatus(ctx.db, ctx.propertyId, orderId, status);
      return apiOk({ id: orderId, status });
    }

    if (entity === 'supplier') {
      const id = Number(body.id);
      const name = String(body.name || '').trim();
      if (!id || !name) return apiFail('id and name are required');
      await updateSupplier(ctx.db, ctx.propertyId, id, {
        name,
        contact_name: body.contact_name != null ? String(body.contact_name) : null,
        email: body.email != null ? String(body.email) : null,
        phone: body.phone != null ? String(body.phone) : null,
      });
      return apiOk({ id });
    }

    if (entity === 'item') {
      const id = Number(body.id);
      const name = String(body.name || '').trim();
      if (!id || !name) return apiFail('id and name are required');
      await updateStockItem(
        ctx.db,
        ctx.propertyId,
        id,
        {
          name,
          sku: body.sku != null ? String(body.sku) : null,
          department: body.department != null ? String(body.department) : null,
          unit: body.unit != null ? String(body.unit) : null,
          reorder_level: body.reorder_level !== undefined ? Number(body.reorder_level) : undefined,
          unit_cost: body.unit_cost !== undefined ? Number(body.unit_cost) : undefined,
          supplier_id: body.supplier_id ? Number(body.supplier_id) : null,
        },
        { companyId: ctx.session.companyId }
      );
      return apiOk({ id });
    }

    const id = Number(body.id);
    const quantity = Number(body.quantity);

    if (!id || Number.isNaN(quantity)) {
      return apiFail('id and quantity are required');
    }

    await adjustStock(ctx.db, id, quantity, {
      companyId: ctx.session.companyId,
      propertyId: ctx.propertyId,
    });
    return apiOk({ id, quantity_adjusted: quantity });
  } catch (e) {
    console.error(e);
    const message = e instanceof Error ? e.message : 'Failed to update inventory';
    return apiFail(message, 500);
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

    if (entity === 'supplier') {
      await deleteSupplier(ctx.db, ctx.propertyId, id);
      return apiOk({ id });
    }

    if (entity === 'item') {
      await deleteStockItem(ctx.db, ctx.propertyId, id);
      return apiOk({ id });
    }

    return apiFail('entity must be supplier or item');
  } catch (e) {
    console.error(e);
    const message = e instanceof Error ? e.message : 'Failed to delete inventory record';
    return apiFail(message, 500);
  }
}
