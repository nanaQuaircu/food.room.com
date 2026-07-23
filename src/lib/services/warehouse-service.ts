import type { DbConfig } from '@/lib/db/central';
import { executeTenant, queryTenant } from '@/lib/db/tenant';

const DEFAULT_LOCATIONS = [
  { code: 'warehouse', name: 'Warehouse', sort_order: 1 },
  { code: 'kitchen', name: 'Kitchen', sort_order: 2 },
  { code: 'cleaners', name: 'Cleaners', sort_order: 3 },
  { code: 'front_office', name: 'Front Office', sort_order: 4 },
];

export type StockLocation = {
  id: number;
  property_id: number;
  code: string;
  name: string;
  sort_order: number;
  is_active: number;
};

export type PurchaseLineInput = { item_id: number; quantity: number; unit_cost: number };
export type TransferLineInput = { item_id: number; quantity: number };
export type UsageLineInput = { item_id: number; quantity: number };

export async function ensureDefaultLocations(db: DbConfig, propertyId: number) {
  for (const loc of DEFAULT_LOCATIONS) {
    await executeTenant(
      db,
      `INSERT IGNORE INTO stock_locations (property_id, code, name, sort_order, is_active)
       VALUES (:propertyId, :code, :name, :sortOrder, 1)`,
      { propertyId, code: loc.code, name: loc.name, sortOrder: loc.sort_order }
    );
  }
}

export async function listLocations(db: DbConfig, propertyId: number) {
  await ensureDefaultLocations(db, propertyId);
  return queryTenant<StockLocation[]>(
    db,
    `SELECT * FROM stock_locations WHERE property_id = :propertyId AND is_active = 1 ORDER BY sort_order, name`,
    { propertyId }
  );
}

async function getWarehouseLocationId(db: DbConfig, propertyId: number) {
  await ensureDefaultLocations(db, propertyId);
  const rows = await queryTenant<Array<{ id: number }>>(
    db,
    `SELECT id FROM stock_locations WHERE property_id = :propertyId AND code = 'warehouse' LIMIT 1`,
    { propertyId }
  );
  if (!rows[0]) throw new Error('Warehouse location not found for property.');
  return rows[0].id;
}

async function nextReference(
  db: DbConfig,
  propertyId: number,
  table: 'stock_purchases' | 'stock_transfers',
  prefix: string
) {
  const rows = await queryTenant<Array<{ count: number }>>(
    db,
    `SELECT COUNT(*) AS count FROM ${table} WHERE property_id = :propertyId`,
    { propertyId }
  );
  const seq = Number(rows[0]?.count ?? 0) + 1;
  return `${prefix}-${String(seq).padStart(5, '0')}`;
}

async function upsertBalance(db: DbConfig, itemId: number, locationId: number, delta: number) {
  await executeTenant(
    db,
    `INSERT INTO stock_balances (item_id, location_id, quantity)
     VALUES (:itemId, :locationId, :delta)
     ON DUPLICATE KEY UPDATE quantity = quantity + :delta`,
    { itemId, locationId, delta }
  );
}

async function getBalance(db: DbConfig, itemId: number, locationId: number) {
  const rows = await queryTenant<Array<{ quantity: number }>>(
    db,
    `SELECT quantity FROM stock_balances WHERE item_id = :itemId AND location_id = :locationId LIMIT 1`,
    { itemId, locationId }
  );
  return Number(rows[0]?.quantity ?? 0);
}

export async function listItemsWithBalances(db: DbConfig, propertyId: number) {
  const [items, locations, balances] = await Promise.all([
    queryTenant<
      Array<{
        id: number;
        name: string;
        sku: string | null;
        department: string;
        category: string | null;
        unit: string;
        purchase_unit: string | null;
        usage_unit: string | null;
        conversion_factor: number;
        quantity_on_hand: number;
        reorder_level: number;
        unit_cost: number;
        supplier_id: number | null;
      }>
    >(
      db,
      `SELECT id, name, sku, department, category, unit, purchase_unit, usage_unit, conversion_factor,
              quantity_on_hand, reorder_level, unit_cost, supplier_id
       FROM stock_items
       WHERE property_id = :propertyId
       ORDER BY name`,
      { propertyId }
    ),
    listLocations(db, propertyId),
    queryTenant<Array<{ item_id: number; location_id: number; quantity: number }>>(
      db,
      `SELECT sb.item_id, sb.location_id, sb.quantity
       FROM stock_balances sb
       JOIN stock_items si ON si.id = sb.item_id
       WHERE si.property_id = :propertyId`,
      { propertyId }
    ),
  ]);

  const balancesByItem = new Map<number, Record<number, number>>();
  for (const b of balances) {
    const existing = balancesByItem.get(b.item_id) ?? {};
    existing[b.location_id] = Number(b.quantity);
    balancesByItem.set(b.item_id, existing);
  }

  return items.map((item) => ({
    ...item,
    is_low_stock: Number(item.quantity_on_hand) <= Number(item.reorder_level),
    balances: balancesByItem.get(item.id) ?? {},
  }));
}

export async function createWarehouseItem(
  db: DbConfig,
  propertyId: number,
  input: {
    name: string;
    sku?: string;
    department?: string;
    category?: string;
    unit?: string;
    purchase_unit?: string;
    usage_unit?: string;
    conversion_factor?: number;
    quantity_on_hand?: number;
    reorder_level?: number;
    unit_cost?: number;
    supplier_id?: number;
  }
) {
  const result = await executeTenant(
    db,
    `INSERT INTO stock_items
       (property_id, supplier_id, name, sku, department, category, unit, purchase_unit, usage_unit,
        conversion_factor, quantity_on_hand, reorder_level, unit_cost)
     VALUES
       (:propertyId, :supplierId, :name, :sku, :department, :category, :unit, :purchaseUnit, :usageUnit,
        :conversionFactor, :qty, :reorder, :unitCost)`,
    {
      propertyId,
      supplierId: input.supplier_id || null,
      name: input.name,
      sku: input.sku || null,
      department: input.department || 'general',
      category: input.category || null,
      unit: input.unit || 'unit',
      purchaseUnit: input.purchase_unit || null,
      usageUnit: input.usage_unit || null,
      conversionFactor: input.conversion_factor ?? 1,
      qty: input.quantity_on_hand ?? 0,
      reorder: input.reorder_level ?? 0,
      unitCost: input.unit_cost ?? 0,
    }
  );
  const itemId = Number((result as { insertId?: number }).insertId);

  if (input.quantity_on_hand) {
    const warehouseId = await getWarehouseLocationId(db, propertyId);
    await upsertBalance(db, itemId, warehouseId, Number(input.quantity_on_hand));
  }

  return itemId;
}

export async function dashboardStats(db: DbConfig, propertyId: number) {
  const [itemStats, purchaseCount, transferCount, usageCount, locationTotals] = await Promise.all([
    queryTenant<Array<{ total_items: number; low_stock: number; stock_value: number }>>(
      db,
      `SELECT COUNT(*) AS total_items,
              SUM(CASE WHEN quantity_on_hand <= reorder_level THEN 1 ELSE 0 END) AS low_stock,
              SUM(quantity_on_hand * unit_cost) AS stock_value
       FROM stock_items
       WHERE property_id = :propertyId`,
      { propertyId }
    ),
    queryTenant<Array<{ count: number }>>(
      db,
      `SELECT COUNT(*) AS count FROM stock_purchases WHERE property_id = :propertyId`,
      { propertyId }
    ),
    queryTenant<Array<{ count: number }>>(
      db,
      `SELECT COUNT(*) AS count FROM stock_transfers WHERE property_id = :propertyId`,
      { propertyId }
    ),
    queryTenant<Array<{ count: number }>>(
      db,
      `SELECT COUNT(*) AS count FROM stock_usage_logs WHERE property_id = :propertyId`,
      { propertyId }
    ),
    queryTenant<Array<{ location_id: number; location_name: string; total_quantity: number; total_value: number }>>(
      db,
      `SELECT sl.id AS location_id, sl.name AS location_name,
              COALESCE(SUM(sb.quantity), 0) AS total_quantity,
              COALESCE(SUM(sb.quantity * si.unit_cost), 0) AS total_value
       FROM stock_locations sl
       LEFT JOIN stock_balances sb ON sb.location_id = sl.id
       LEFT JOIN stock_items si ON si.id = sb.item_id
       WHERE sl.property_id = :propertyId AND sl.is_active = 1
       GROUP BY sl.id, sl.name, sl.sort_order
       ORDER BY sl.sort_order`,
      { propertyId }
    ),
  ]);

  const stats = itemStats[0] ?? { total_items: 0, low_stock: 0, stock_value: 0 };

  return {
    total_items: Number(stats.total_items ?? 0),
    low_stock_count: Number(stats.low_stock ?? 0),
    stock_value: Number(stats.stock_value ?? 0),
    purchase_count: Number(purchaseCount[0]?.count ?? 0),
    transfer_count: Number(transferCount[0]?.count ?? 0),
    usage_count: Number(usageCount[0]?.count ?? 0),
    location_totals: locationTotals.map((l) => ({
      location_id: l.location_id,
      location_name: l.location_name,
      total_quantity: Number(l.total_quantity),
      total_value: Number(l.total_value),
    })),
  };
}

export async function createPurchase(
  db: DbConfig,
  propertyId: number,
  userId: number | null,
  input: {
    location_id?: number;
    supplier_id?: number;
    purchase_date: string;
    notes?: string;
    lines: PurchaseLineInput[];
  }
) {
  if (!input.lines?.length) throw new Error('Purchase must have at least one line.');

  const locationId = input.location_id || (await getWarehouseLocationId(db, propertyId));
  const reference = await nextReference(db, propertyId, 'stock_purchases', 'PUR');

  let total = 0;
  const resolved = input.lines.map((line) => {
    const qty = Math.max(0.0001, Number(line.quantity));
    const unitCost = Math.max(0, Number(line.unit_cost));
    const lineTotal = Math.round(qty * unitCost * 100) / 100;
    total += lineTotal;
    return { ...line, quantity: qty, unit_cost: unitCost, line_total: lineTotal };
  });

  const result = await executeTenant(
    db,
    `INSERT INTO stock_purchases (property_id, location_id, supplier_id, reference, purchase_date, total_amount, notes, created_by)
     VALUES (:propertyId, :locationId, :supplierId, :reference, :purchaseDate, :total, :notes, :userId)`,
    {
      propertyId,
      locationId,
      supplierId: input.supplier_id || null,
      reference,
      purchaseDate: input.purchase_date,
      total,
      notes: input.notes || null,
      userId: userId || null,
    }
  );
  const purchaseId = Number((result as { insertId?: number }).insertId);

  for (const line of resolved) {
    await executeTenant(
      db,
      `INSERT INTO stock_purchase_lines (purchase_id, item_id, quantity, unit_cost, line_total)
       VALUES (:purchaseId, :itemId, :qty, :unitCost, :lineTotal)`,
      {
        purchaseId,
        itemId: line.item_id,
        qty: line.quantity,
        unitCost: line.unit_cost,
        lineTotal: line.line_total,
      }
    );

    await upsertBalance(db, line.item_id, locationId, line.quantity);
    await executeTenant(
      db,
      `UPDATE stock_items
       SET quantity_on_hand = quantity_on_hand + :qty, unit_cost = :unitCost
       WHERE id = :itemId AND property_id = :propertyId`,
      { itemId: line.item_id, propertyId, qty: line.quantity, unitCost: line.unit_cost }
    );
  }

  return { id: purchaseId, reference, total_amount: total };
}

export async function createTransfer(
  db: DbConfig,
  propertyId: number,
  userId: number | null,
  input: {
    from_location_id: number;
    to_location_id: number;
    transfer_date: string;
    notes?: string;
    lines: TransferLineInput[];
  }
) {
  if (!input.lines?.length) throw new Error('Transfer must have at least one line.');
  if (Number(input.from_location_id) === Number(input.to_location_id)) {
    throw new Error('From and to locations must be different.');
  }

  const resolved = input.lines.map((line) => ({
    item_id: Number(line.item_id),
    quantity: Math.max(0.0001, Number(line.quantity)),
  }));

  for (const line of resolved) {
    const available = await getBalance(db, line.item_id, input.from_location_id);
    if (available < line.quantity) {
      const rows = await queryTenant<Array<{ name: string }>>(
        db,
        `SELECT name FROM stock_items WHERE id = :itemId LIMIT 1`,
        { itemId: line.item_id }
      );
      const name = rows[0]?.name || `item #${line.item_id}`;
      throw new Error(`Insufficient stock for ${name} at source location (available: ${available}).`);
    }
  }

  const reference = await nextReference(db, propertyId, 'stock_transfers', 'TRF');

  const result = await executeTenant(
    db,
    `INSERT INTO stock_transfers (property_id, from_location_id, to_location_id, reference, transfer_date, notes, created_by)
     VALUES (:propertyId, :fromLocationId, :toLocationId, :reference, :transferDate, :notes, :userId)`,
    {
      propertyId,
      fromLocationId: input.from_location_id,
      toLocationId: input.to_location_id,
      reference,
      transferDate: input.transfer_date,
      notes: input.notes || null,
      userId: userId || null,
    }
  );
  const transferId = Number((result as { insertId?: number }).insertId);

  for (const line of resolved) {
    await executeTenant(
      db,
      `INSERT INTO stock_transfer_lines (transfer_id, item_id, quantity) VALUES (:transferId, :itemId, :qty)`,
      { transferId, itemId: line.item_id, qty: line.quantity }
    );
    await upsertBalance(db, line.item_id, input.from_location_id, -line.quantity);
    await upsertBalance(db, line.item_id, input.to_location_id, line.quantity);
  }

  return { id: transferId, reference };
}

export async function logUsage(
  db: DbConfig,
  propertyId: number,
  userId: number | null,
  input: {
    location_id: number;
    usage_date: string;
    notes?: string;
    lines: UsageLineInput[];
  }
) {
  if (!input.lines?.length) throw new Error('Usage log must have at least one line.');

  const resolved = input.lines.map((line) => ({
    item_id: Number(line.item_id),
    quantity: Math.max(0.0001, Number(line.quantity)),
  }));

  for (const line of resolved) {
    const available = await getBalance(db, line.item_id, input.location_id);
    if (available < line.quantity) {
      const rows = await queryTenant<Array<{ name: string }>>(
        db,
        `SELECT name FROM stock_items WHERE id = :itemId LIMIT 1`,
        { itemId: line.item_id }
      );
      const name = rows[0]?.name || `item #${line.item_id}`;
      throw new Error(`Insufficient stock for ${name} at this location (available: ${available}).`);
    }
  }

  const ids: number[] = [];
  for (const line of resolved) {
    const result = await executeTenant(
      db,
      `INSERT INTO stock_usage_logs (property_id, location_id, item_id, quantity, usage_date, notes, created_by)
       VALUES (:propertyId, :locationId, :itemId, :qty, :usageDate, :notes, :userId)`,
      {
        propertyId,
        locationId: input.location_id,
        itemId: line.item_id,
        qty: line.quantity,
        usageDate: input.usage_date,
        notes: input.notes || null,
        userId: userId || null,
      }
    );
    ids.push(Number((result as { insertId?: number }).insertId));

    await upsertBalance(db, line.item_id, input.location_id, -line.quantity);
    await executeTenant(
      db,
      `UPDATE stock_items SET quantity_on_hand = quantity_on_hand - :qty
       WHERE id = :itemId AND property_id = :propertyId`,
      { itemId: line.item_id, propertyId, qty: line.quantity }
    );
  }

  return { ids };
}

export async function listPurchases(db: DbConfig, propertyId: number) {
  const purchases = await queryTenant<
    Array<{
      id: number;
      reference: string;
      purchase_date: string;
      total_amount: number;
      notes: string | null;
      created_at: string;
      location_id: number;
      location_name: string;
      supplier_id: number | null;
      supplier_name: string | null;
    }>
  >(
    db,
    `SELECT sp.id, sp.reference, sp.purchase_date, sp.total_amount, sp.notes, sp.created_at,
            sp.location_id, sl.name AS location_name, sp.supplier_id, sup.name AS supplier_name
     FROM stock_purchases sp
     JOIN stock_locations sl ON sl.id = sp.location_id
     LEFT JOIN suppliers sup ON sup.id = sp.supplier_id
     WHERE sp.property_id = :propertyId
     ORDER BY sp.created_at DESC
     LIMIT 500`,
    { propertyId }
  );
  if (!purchases.length) return purchases.map((p) => ({ ...p, lines: [] }));

  const ids = purchases.map((p) => p.id);
  const lines = await queryTenant<
    Array<{ purchase_id: number; item_id: number; item_name: string; quantity: number; unit_cost: number; line_total: number }>
  >(
    db,
    `SELECT spl.purchase_id, spl.item_id, si.name AS item_name, spl.quantity, spl.unit_cost, spl.line_total
     FROM stock_purchase_lines spl
     JOIN stock_items si ON si.id = spl.item_id
     WHERE spl.purchase_id IN (:ids)`,
    { ids }
  );

  const linesByPurchase = new Map<number, typeof lines>();
  for (const line of lines) {
    const arr = linesByPurchase.get(line.purchase_id) ?? [];
    arr.push(line);
    linesByPurchase.set(line.purchase_id, arr);
  }

  return purchases.map((p) => ({ ...p, lines: linesByPurchase.get(p.id) ?? [] }));
}

export async function listTransfers(db: DbConfig, propertyId: number) {
  const transfers = await queryTenant<
    Array<{
      id: number;
      reference: string;
      transfer_date: string;
      notes: string | null;
      created_at: string;
      from_location_name: string;
      to_location_name: string;
    }>
  >(
    db,
    `SELECT st.id, st.reference, st.transfer_date, st.notes, st.created_at,
            fl.name AS from_location_name, tl.name AS to_location_name
     FROM stock_transfers st
     JOIN stock_locations fl ON fl.id = st.from_location_id
     JOIN stock_locations tl ON tl.id = st.to_location_id
     WHERE st.property_id = :propertyId
     ORDER BY st.created_at DESC
     LIMIT 500`,
    { propertyId }
  );
  if (!transfers.length) return transfers.map((t) => ({ ...t, lines: [] }));

  const ids = transfers.map((t) => t.id);
  const lines = await queryTenant<
    Array<{ transfer_id: number; item_id: number; item_name: string; quantity: number }>
  >(
    db,
    `SELECT stl.transfer_id, stl.item_id, si.name AS item_name, stl.quantity
     FROM stock_transfer_lines stl
     JOIN stock_items si ON si.id = stl.item_id
     WHERE stl.transfer_id IN (:ids)`,
    { ids }
  );

  const linesByTransfer = new Map<number, typeof lines>();
  for (const line of lines) {
    const arr = linesByTransfer.get(line.transfer_id) ?? [];
    arr.push(line);
    linesByTransfer.set(line.transfer_id, arr);
  }

  return transfers.map((t) => ({ ...t, lines: linesByTransfer.get(t.id) ?? [] }));
}

export async function listUsage(db: DbConfig, propertyId: number) {
  return queryTenant(
    db,
    `SELECT sul.id, sul.quantity, sul.usage_date, sul.notes, sul.created_at,
            sl.name AS location_name, si.name AS item_name, si.unit
     FROM stock_usage_logs sul
     JOIN stock_locations sl ON sl.id = sul.location_id
     JOIN stock_items si ON si.id = sul.item_id
     WHERE sul.property_id = :propertyId
     ORDER BY sul.usage_date DESC, sul.created_at DESC
     LIMIT 500`,
    { propertyId }
  );
}

export async function listConversions(db: DbConfig, propertyId: number) {
  return queryTenant(
    db,
    `SELECT suc.id, suc.item_id, si.name AS item_name, suc.from_unit, suc.to_unit, suc.factor, suc.created_at
     FROM stock_unit_conversions suc
     LEFT JOIN stock_items si ON si.id = suc.item_id
     WHERE suc.property_id = :propertyId
     ORDER BY suc.created_at DESC`,
    { propertyId }
  );
}

export async function upsertConversion(
  db: DbConfig,
  propertyId: number,
  input: { item_id?: number; from_unit: string; to_unit: string; factor: number }
) {
  const fromUnit = String(input.from_unit || '').trim();
  const toUnit = String(input.to_unit || '').trim();
  const factor = Number(input.factor);
  if (!fromUnit || !toUnit || !factor || Number.isNaN(factor)) {
    throw new Error('from_unit, to_unit, and a numeric factor are required.');
  }

  const existing = await queryTenant<Array<{ id: number }>>(
    db,
    `SELECT id FROM stock_unit_conversions
     WHERE property_id = :propertyId AND from_unit = :fromUnit AND to_unit = :toUnit
       AND ((:itemId IS NULL AND item_id IS NULL) OR item_id = :itemId)
     LIMIT 1`,
    { propertyId, fromUnit, toUnit, itemId: input.item_id ?? null }
  );

  if (existing[0]) {
    await executeTenant(
      db,
      `UPDATE stock_unit_conversions SET factor = :factor WHERE id = :id`,
      { id: existing[0].id, factor }
    );
    return existing[0].id;
  }

  const result = await executeTenant(
    db,
    `INSERT INTO stock_unit_conversions (property_id, item_id, from_unit, to_unit, factor)
     VALUES (:propertyId, :itemId, :fromUnit, :toUnit, :factor)`,
    { propertyId, itemId: input.item_id ?? null, fromUnit, toUnit, factor }
  );
  return Number((result as { insertId?: number }).insertId);
}

export async function updateWarehouseItem(
  db: DbConfig,
  propertyId: number,
  id: number,
  input: {
    name: string;
    sku?: string | null;
    department?: string | null;
    category?: string | null;
    unit?: string | null;
    purchase_unit?: string | null;
    usage_unit?: string | null;
    conversion_factor?: number;
    reorder_level?: number;
    unit_cost?: number;
  }
) {
  const result = await executeTenant(
    db,
    `UPDATE stock_items
     SET name = :name, sku = :sku, department = :department, category = :category,
         unit = :unit, purchase_unit = :purchaseUnit, usage_unit = :usageUnit,
         conversion_factor = :conversionFactor, reorder_level = :reorder, unit_cost = :unitCost
     WHERE id = :id AND property_id = :propertyId`,
    {
      id,
      propertyId,
      name: input.name.trim(),
      sku: input.sku?.trim() || null,
      department: input.department?.trim() || 'general',
      category: input.category?.trim() || null,
      unit: input.unit?.trim() || 'unit',
      purchaseUnit: input.purchase_unit?.trim() || null,
      usageUnit: input.usage_unit?.trim() || null,
      conversionFactor: input.conversion_factor ?? 1,
      reorder: input.reorder_level ?? 0,
      unitCost: input.unit_cost ?? 0,
    }
  );
  if (!Number((result as { affectedRows?: number }).affectedRows)) {
    throw new Error('Stock item not found.');
  }
}

export async function deleteWarehouseItem(db: DbConfig, propertyId: number, id: number) {
  const result = await executeTenant(
    db,
    `DELETE FROM stock_items WHERE id = :id AND property_id = :propertyId`,
    { id, propertyId }
  );
  if (!Number((result as { affectedRows?: number }).affectedRows)) {
    throw new Error('Stock item not found.');
  }
}

export async function updatePurchaseMeta(
  db: DbConfig,
  propertyId: number,
  id: number,
  input: { purchase_date?: string; notes?: string | null; supplier_id?: number | null }
) {
  const sets: string[] = [];
  const params: Record<string, string | number | null> = { id, propertyId };
  if (input.purchase_date !== undefined) {
    sets.push('purchase_date = :purchaseDate');
    params.purchaseDate = input.purchase_date;
  }
  if (input.notes !== undefined) {
    sets.push('notes = :notes');
    params.notes = input.notes?.trim() || null;
  }
  if (input.supplier_id !== undefined) {
    sets.push('supplier_id = :supplierId');
    params.supplierId = input.supplier_id || null;
  }
  if (!sets.length) return;
  const result = await executeTenant(
    db,
    `UPDATE stock_purchases SET ${sets.join(', ')} WHERE id = :id AND property_id = :propertyId`,
    params
  );
  if (!Number((result as { affectedRows?: number }).affectedRows)) {
    throw new Error('Purchase not found.');
  }
}

export async function deletePurchase(db: DbConfig, propertyId: number, id: number) {
  const rows = await queryTenant<
    Array<{ location_id: number; item_id: number; quantity: number }>
  >(
    db,
    `SELECT sp.location_id, spl.item_id, spl.quantity
     FROM stock_purchases sp
     JOIN stock_purchase_lines spl ON spl.purchase_id = sp.id
     WHERE sp.id = :id AND sp.property_id = :propertyId`,
    { id, propertyId }
  );
  if (!rows.length) {
    const exists = await queryTenant<Array<{ id: number }>>(
      db,
      `SELECT id FROM stock_purchases WHERE id = :id AND property_id = :propertyId LIMIT 1`,
      { id, propertyId }
    );
    if (!exists[0]) throw new Error('Purchase not found.');
  }

  for (const line of rows) {
    await upsertBalance(db, line.item_id, line.location_id, -Number(line.quantity));
    await executeTenant(
      db,
      `UPDATE stock_items SET quantity_on_hand = GREATEST(0, quantity_on_hand - :qty)
       WHERE id = :itemId AND property_id = :propertyId`,
      { itemId: line.item_id, propertyId, qty: Number(line.quantity) }
    );
  }

  await executeTenant(db, `DELETE FROM stock_purchase_lines WHERE purchase_id = :id`, { id });
  await executeTenant(
    db,
    `DELETE FROM stock_purchases WHERE id = :id AND property_id = :propertyId`,
    { id, propertyId }
  );
}

export async function updateTransferMeta(
  db: DbConfig,
  propertyId: number,
  id: number,
  input: { transfer_date?: string; notes?: string | null }
) {
  const sets: string[] = [];
  const params: Record<string, string | number | null> = { id, propertyId };
  if (input.transfer_date !== undefined) {
    sets.push('transfer_date = :transferDate');
    params.transferDate = input.transfer_date;
  }
  if (input.notes !== undefined) {
    sets.push('notes = :notes');
    params.notes = input.notes?.trim() || null;
  }
  if (!sets.length) return;
  const result = await executeTenant(
    db,
    `UPDATE stock_transfers SET ${sets.join(', ')} WHERE id = :id AND property_id = :propertyId`,
    params
  );
  if (!Number((result as { affectedRows?: number }).affectedRows)) {
    throw new Error('Transfer not found.');
  }
}

export async function deleteTransfer(db: DbConfig, propertyId: number, id: number) {
  const header = await queryTenant<
    Array<{ from_location_id: number; to_location_id: number }>
  >(
    db,
    `SELECT from_location_id, to_location_id FROM stock_transfers
     WHERE id = :id AND property_id = :propertyId LIMIT 1`,
    { id, propertyId }
  );
  if (!header[0]) throw new Error('Transfer not found.');

  const lines = await queryTenant<Array<{ item_id: number; quantity: number }>>(
    db,
    `SELECT item_id, quantity FROM stock_transfer_lines WHERE transfer_id = :id`,
    { id }
  );

  for (const line of lines) {
    await upsertBalance(db, line.item_id, header[0].to_location_id, -Number(line.quantity));
    await upsertBalance(db, line.item_id, header[0].from_location_id, Number(line.quantity));
  }

  await executeTenant(db, `DELETE FROM stock_transfer_lines WHERE transfer_id = :id`, { id });
  await executeTenant(
    db,
    `DELETE FROM stock_transfers WHERE id = :id AND property_id = :propertyId`,
    { id, propertyId }
  );
}

export async function updateUsageLog(
  db: DbConfig,
  propertyId: number,
  id: number,
  input: { usage_date?: string; notes?: string | null; quantity?: number }
) {
  const rows = await queryTenant<
    Array<{ location_id: number; item_id: number; quantity: number }>
  >(
    db,
    `SELECT location_id, item_id, quantity FROM stock_usage_logs
     WHERE id = :id AND property_id = :propertyId LIMIT 1`,
    { id, propertyId }
  );
  const row = rows[0];
  if (!row) throw new Error('Usage log not found.');

  const sets: string[] = [];
  const params: Record<string, string | number | null> = { id, propertyId };

  if (input.usage_date !== undefined) {
    sets.push('usage_date = :usageDate');
    params.usageDate = input.usage_date;
  }
  if (input.notes !== undefined) {
    sets.push('notes = :notes');
    params.notes = input.notes?.trim() || null;
  }

  if (input.quantity !== undefined) {
    const newQty = Math.max(0.0001, Number(input.quantity));
    const delta = newQty - Number(row.quantity);
    if (delta !== 0) {
      if (delta > 0) {
        const available = await getBalance(db, row.item_id, row.location_id);
        if (available < delta) {
          throw new Error(`Insufficient stock to increase usage (available: ${available}).`);
        }
      }
      await upsertBalance(db, row.item_id, row.location_id, -delta);
      await executeTenant(
        db,
        `UPDATE stock_items SET quantity_on_hand = GREATEST(0, quantity_on_hand - :delta)
         WHERE id = :itemId AND property_id = :propertyId`,
        { itemId: row.item_id, propertyId, delta }
      );
      sets.push('quantity = :quantity');
      params.quantity = newQty;
    }
  }

  if (!sets.length) return;
  await executeTenant(
    db,
    `UPDATE stock_usage_logs SET ${sets.join(', ')} WHERE id = :id AND property_id = :propertyId`,
    params
  );
}

export async function deleteUsageLog(db: DbConfig, propertyId: number, id: number) {
  const rows = await queryTenant<
    Array<{ location_id: number; item_id: number; quantity: number }>
  >(
    db,
    `SELECT location_id, item_id, quantity FROM stock_usage_logs
     WHERE id = :id AND property_id = :propertyId LIMIT 1`,
    { id, propertyId }
  );
  const row = rows[0];
  if (!row) throw new Error('Usage log not found.');

  await upsertBalance(db, row.item_id, row.location_id, Number(row.quantity));
  await executeTenant(
    db,
    `UPDATE stock_items SET quantity_on_hand = quantity_on_hand + :qty
     WHERE id = :itemId AND property_id = :propertyId`,
    { itemId: row.item_id, propertyId, qty: Number(row.quantity) }
  );
  await executeTenant(
    db,
    `DELETE FROM stock_usage_logs WHERE id = :id AND property_id = :propertyId`,
    { id, propertyId }
  );
}

export async function updateConversion(
  db: DbConfig,
  propertyId: number,
  id: number,
  input: { item_id?: number | null; from_unit: string; to_unit: string; factor: number }
) {
  const fromUnit = String(input.from_unit || '').trim();
  const toUnit = String(input.to_unit || '').trim();
  const factor = Number(input.factor);
  if (!fromUnit || !toUnit || !factor || Number.isNaN(factor)) {
    throw new Error('from_unit, to_unit, and a numeric factor are required.');
  }
  const result = await executeTenant(
    db,
    `UPDATE stock_unit_conversions
     SET item_id = :itemId, from_unit = :fromUnit, to_unit = :toUnit, factor = :factor
     WHERE id = :id AND property_id = :propertyId`,
    {
      id,
      propertyId,
      itemId: input.item_id || null,
      fromUnit,
      toUnit,
      factor,
    }
  );
  if (!Number((result as { affectedRows?: number }).affectedRows)) {
    throw new Error('Conversion not found.');
  }
}

export async function deleteConversion(db: DbConfig, propertyId: number, id: number) {
  const result = await executeTenant(
    db,
    `DELETE FROM stock_unit_conversions WHERE id = :id AND property_id = :propertyId`,
    { id, propertyId }
  );
  if (!Number((result as { affectedRows?: number }).affectedRows)) {
    throw new Error('Conversion not found.');
  }
}
