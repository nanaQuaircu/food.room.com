import type { DbConfig } from '@/lib/db/central';
import { executeTenant, queryTenant } from '@/lib/db/tenant';

export async function listPurchaseOrders(db: DbConfig, propertyId: number) {
  return queryTenant(
    db,
    `SELECT po.id, po.po_number, po.status, po.total_amount, po.notes, po.created_at,
            s.name AS supplier_name
     FROM purchase_orders po
     LEFT JOIN suppliers s ON s.id = po.supplier_id
     WHERE po.property_id = :propertyId
     ORDER BY po.created_at DESC
     LIMIT 100`,
    { propertyId }
  );
}

export async function createPurchaseOrder(
  db: DbConfig,
  propertyId: number,
  userId: number,
  input: {
    supplier_id?: number;
    notes?: string;
    lines: Array<{ stock_item_id?: number; description: string; quantity: number; unit_cost: number }>;
  }
) {
  if (!input.lines.length) throw new Error('Purchase order must have at least one line.');

  const countRows = await queryTenant<Array<{ count: number }>>(
    db,
    `SELECT COUNT(*) AS count FROM purchase_orders WHERE property_id = :propertyId`,
    { propertyId }
  );
  const seq = Number(countRows[0]?.count ?? 0) + 1;
  const poNumber = `PO-${String(seq).padStart(5, '0')}`;

  let total = 0;
  const resolved = input.lines.map((line) => {
    const qty = Math.max(0.01, Number(line.quantity));
    const unit = Math.max(0, Number(line.unit_cost));
    const lineTotal = Math.round(qty * unit * 100) / 100;
    total += lineTotal;
    return { ...line, quantity: qty, unit_cost: unit, line_total: lineTotal };
  });

  const orderRes = await executeTenant(
    db,
    `INSERT INTO purchase_orders (property_id, supplier_id, po_number, status, total_amount, notes, created_by)
     VALUES (:propertyId, :supplierId, :poNumber, 'draft', :total, :notes, :userId)`,
    {
      propertyId,
      supplierId: input.supplier_id ?? null,
      poNumber,
      total,
      notes: input.notes || null,
      userId,
    }
  );
  const orderId = Number((orderRes as { insertId?: number }).insertId);

  for (const line of resolved) {
    await executeTenant(
      db,
      `INSERT INTO purchase_order_lines (purchase_order_id, stock_item_id, description, quantity, unit_cost, line_total)
       VALUES (:orderId, :stockItemId, :description, :qty, :unitCost, :lineTotal)`,
      {
        orderId,
        stockItemId: line.stock_item_id ?? null,
        description: line.description,
        qty: line.quantity,
        unitCost: line.unit_cost,
        lineTotal: line.line_total,
      }
    );
  }

  return { id: orderId, po_number: poNumber, total_amount: total };
}

export async function updatePurchaseOrderStatus(
  db: DbConfig,
  propertyId: number,
  orderId: number,
  status: string
) {
  const allowed = ['draft', 'ordered', 'received', 'cancelled'];
  if (!allowed.includes(status)) throw new Error('Invalid purchase order status.');

  await executeTenant(
    db,
    `UPDATE purchase_orders SET status = :status WHERE id = :id AND property_id = :propertyId`,
    { id: orderId, propertyId, status }
  );

  if (status === 'received') {
    const lines = await queryTenant<
      Array<{ stock_item_id: number | null; quantity: number }>
    >(
      db,
      `SELECT stock_item_id, quantity FROM purchase_order_lines WHERE purchase_order_id = :orderId`,
      { orderId }
    );
    for (const line of lines) {
      if (!line.stock_item_id) continue;
      await executeTenant(
        db,
        `UPDATE stock_items SET quantity_on_hand = quantity_on_hand + :qty
         WHERE id = :id AND property_id = :propertyId`,
        { id: line.stock_item_id, propertyId, qty: line.quantity }
      );
    }
  }
}
