import type { DbConfig } from '@/lib/db/central';
import { executeTenant, queryTenant } from '@/lib/db/tenant';
import { createRoleNotification } from '@/lib/services/in-app-notifications';

export async function listPublicMenu(db: DbConfig, propertyId: number) {
  const categories = await queryTenant<
    Array<{ id: number; name: string; sort_order: number }>
  >(
    db,
    `SELECT id, name, sort_order FROM menu_categories
     WHERE property_id = :propertyId AND is_active = 1
     ORDER BY sort_order, name`,
    { propertyId }
  );

  const items = await queryTenant<
    Array<{
      id: number;
      category_id: number;
      name: string;
      description: string | null;
      price: number;
      image_url: string | null;
    }>
  >(
    db,
    `SELECT id, category_id, name, description, price, image_url
     FROM menu_items
     WHERE property_id = :propertyId AND is_available = 1
     ORDER BY sort_order, name`,
    { propertyId }
  );

  return categories.map((cat) => ({
    ...cat,
    items: items.filter((i) => i.category_id === cat.id).map((i) => ({ ...i, price: Number(i.price) })),
  }));
}

export async function createFoodOrder(
  db: DbConfig,
  propertyId: number,
  input: {
    guest_id?: number;
    reservation_id?: number;
    order_type: 'room_service' | 'restaurant';
    delivery_type?: 'pickup' | 'room_service' | 'hubtel';
    delivery_address?: string;
    delivery_provider?: string;
    delivery_fee?: number;
    delivery_status?: string | null;
    delivery_tracking_ref?: string | null;
    delivery_eta_minutes?: number | null;
    payment_method?: 'paystack' | 'cash' | 'cash_on_delivery';
    room_number?: string;
    notes?: string;
    lines: Array<{ menu_item_id: number; quantity: number }>;
  }
) {
  if (!input.lines.length) throw new Error('Cart is empty.');

  const ids = input.lines.map((l) => l.menu_item_id);
  const placeholders = ids.map((_, i) => `:id${i}`).join(', ');
  const params: Record<string, number | string> = { propertyId };
  ids.forEach((id, i) => {
    params[`id${i}`] = id;
  });

  const menuRows = await queryTenant<
    Array<{ id: number; name: string; price: number; is_available: number }>
  >(
    db,
    `SELECT id, name, price, is_available FROM menu_items
     WHERE property_id = :propertyId AND id IN (${placeholders})`,
    params
  );

  let total = 0;
  const resolvedLines: Array<{
    menu_item_id: number;
    item_name: string;
    unit_price: number;
    quantity: number;
    line_total: number;
  }> = [];

  for (const line of input.lines) {
    const item = menuRows.find((m) => m.id === line.menu_item_id);
    if (!item || !item.is_available) throw new Error('One or more menu items are unavailable.');
    const qty = Math.max(1, line.quantity);
    const unit = Number(item.price);
    const lineTotal = unit * qty;
    total += lineTotal;
    resolvedLines.push({
      menu_item_id: item.id,
      item_name: item.name,
      unit_price: unit,
      quantity: qty,
      line_total: lineTotal,
    });
  }

  const deliveryFee = Math.max(0, Number(input.delivery_fee || 0));
  total = Math.round((total + deliveryFee) * 100) / 100;

  const paymentMethod = input.payment_method || 'cash';

  const orderResult = await executeTenant(
    db,
    `INSERT INTO food_orders
      (property_id, guest_id, reservation_id, order_type, delivery_type, delivery_address, delivery_provider,
       delivery_status, delivery_tracking_ref, delivery_eta_minutes, room_number, status, total_amount,
       delivery_fee, payment_status, payment_method, notes)
     VALUES
      (:propertyId, :guestId, :reservationId, :orderType, :deliveryType, :deliveryAddress, :deliveryProvider,
       :deliveryStatus, :deliveryTrackingRef, :deliveryEta, :roomNumber, 'pending', :total,
       :deliveryFee, 'pending', :paymentMethod, :notes)`,
    {
      propertyId,
      guestId: input.guest_id ?? null,
      reservationId: input.reservation_id ?? null,
      orderType: input.order_type,
      deliveryType: input.delivery_type || (input.order_type === 'room_service' ? 'room_service' : 'pickup'),
      deliveryAddress: input.delivery_address || null,
      deliveryProvider: input.delivery_provider || null,
      deliveryStatus: input.delivery_status || null,
      deliveryTrackingRef: input.delivery_tracking_ref || null,
      deliveryEta: input.delivery_eta_minutes ?? null,
      roomNumber: input.room_number || null,
      total,
      deliveryFee,
      paymentMethod,
      notes: input.notes || null,
    }
  );
  const orderId = Number((orderResult as { insertId?: number }).insertId);

  for (const line of resolvedLines) {
    await executeTenant(
      db,
      `INSERT INTO food_order_lines
        (order_id, menu_item_id, item_name, unit_price, quantity, line_total)
       VALUES (:orderId, :menuItemId, :name, :price, :qty, :total)`,
      {
        orderId,
        menuItemId: line.menu_item_id,
        name: line.item_name,
        price: line.unit_price,
        qty: line.quantity,
        total: line.line_total,
      }
    );
  }

  await createRoleNotification(db, ['owner', 'admin', 'manager', 'front_desk', 'kitchen', 'chef'], {
    type: 'order',
    title: 'New food order',
    body: `${input.order_type === 'room_service' ? 'Room service' : 'Restaurant'} order #${orderId}`,
    link: '/restaurant',
  });

  return {
    id: orderId,
    total_amount: total,
    delivery_fee: deliveryFee,
    payment_method: paymentMethod,
    delivery_status: input.delivery_status || null,
    delivery_tracking_ref: input.delivery_tracking_ref || null,
  };
}

export async function updateFoodOrderDeliveryDispatch(
  db: DbConfig,
  propertyId: number,
  orderId: number,
  input: {
    delivery_status?: string | null;
    delivery_tracking_ref?: string | null;
    delivery_eta_minutes?: number | null;
    delivery_fee?: number;
  }
) {
  await executeTenant(
    db,
    `UPDATE food_orders
     SET delivery_status = COALESCE(:deliveryStatus, delivery_status),
         delivery_tracking_ref = COALESCE(:trackingRef, delivery_tracking_ref),
         delivery_eta_minutes = COALESCE(:eta, delivery_eta_minutes),
         delivery_fee = COALESCE(:fee, delivery_fee)
     WHERE id = :orderId AND property_id = :propertyId`,
    {
      orderId,
      propertyId,
      deliveryStatus: input.delivery_status ?? null,
      trackingRef: input.delivery_tracking_ref ?? null,
      eta: input.delivery_eta_minutes ?? null,
      fee: input.delivery_fee ?? null,
    }
  );
}

export async function abandonUnpaidFoodOrder(
  db: DbConfig,
  propertyId: number,
  orderId: number
) {
  const rows = await queryTenant<
    Array<{ id: number; payment_status: string; payment_method: string; status: string }>
  >(
    db,
    `SELECT id, payment_status, payment_method, status
     FROM food_orders
     WHERE id = :orderId AND property_id = :propertyId
     LIMIT 1`,
    { orderId, propertyId }
  );
  const order = rows[0];
  if (!order) return { cancelled: false };
  if (order.payment_status === 'paid') return { cancelled: false, reason: 'already_paid' };
  if (order.payment_method !== 'paystack') return { cancelled: false, reason: 'not_paystack' };

  await executeTenant(
    db,
    `UPDATE food_orders
     SET status = 'cancelled', payment_status = 'failed'
     WHERE id = :orderId AND property_id = :propertyId AND payment_status <> 'paid'`,
    { orderId, propertyId }
  );
  return { cancelled: true };
}

export type GuestFoodOrderTrack = {
  id: number;
  order_type: string;
  delivery_type: string | null;
  delivery_address: string | null;
  delivery_provider: string | null;
  delivery_status: string | null;
  delivery_tracking_ref: string | null;
  delivery_eta_minutes: number | null;
  room_number: string | null;
  status: string;
  payment_status: string;
  payment_method: string | null;
  total_amount: number;
  delivery_fee: number;
  notes: string | null;
  created_at: string;
  updated_at?: string;
  lines: Array<{
    item_name: string;
    quantity: number;
    unit_price: number;
    line_total: number;
  }>;
};

export async function getGuestFoodOrder(
  db: DbConfig,
  propertyId: number,
  guestId: number,
  orderId: number
): Promise<GuestFoodOrderTrack | null> {
  const orders = await queryTenant<
    Array<{
      id: number;
      order_type: string;
      delivery_type: string | null;
      delivery_address: string | null;
      delivery_provider: string | null;
      delivery_status: string | null;
      delivery_tracking_ref: string | null;
      delivery_eta_minutes: number | null;
      room_number: string | null;
      status: string;
      payment_status: string;
      payment_method: string | null;
      total_amount: number;
      delivery_fee: number;
      notes: string | null;
      created_at: string;
      updated_at: string;
    }>
  >(
    db,
    `SELECT id, order_type, delivery_type, delivery_address, delivery_provider,
            delivery_status, delivery_tracking_ref, delivery_eta_minutes, room_number,
            status, payment_status, payment_method, total_amount, delivery_fee, notes,
            created_at, updated_at
     FROM food_orders
     WHERE id = :orderId AND property_id = :propertyId AND guest_id = :guestId
     LIMIT 1`,
    { orderId, propertyId, guestId }
  );
  const order = orders[0];
  if (!order) return null;

  const lines = await queryTenant<
    Array<{ item_name: string; quantity: number; unit_price: number; line_total: number }>
  >(
    db,
    `SELECT item_name, quantity, unit_price, line_total
     FROM food_order_lines WHERE order_id = :orderId ORDER BY id`,
    { orderId }
  );

  return {
    ...order,
    total_amount: Number(order.total_amount),
    delivery_fee: Number(order.delivery_fee || 0),
    delivery_eta_minutes:
      order.delivery_eta_minutes == null ? null : Number(order.delivery_eta_minutes),
    lines: lines.map((l) => ({
      ...l,
      unit_price: Number(l.unit_price),
      line_total: Number(l.line_total),
    })),
  };
}

export async function listGuestFoodOrders(
  db: DbConfig,
  propertyId: number,
  guestId: number,
  limit = 20
) {
  const orders = await queryTenant<
    Array<{
      id: number;
      order_type: string;
      delivery_type: string | null;
      room_number: string | null;
      status: string;
      payment_status: string;
      payment_method: string | null;
      total_amount: number;
      delivery_fee: number;
      created_at: string;
    }>
  >(
    db,
    `SELECT id, order_type, delivery_type, room_number, status, payment_status,
            payment_method, total_amount, delivery_fee, created_at
     FROM food_orders
     WHERE property_id = :propertyId AND guest_id = :guestId
     ORDER BY created_at DESC
     LIMIT ${Math.min(50, Math.max(1, limit))}`,
    { propertyId, guestId }
  );

  const enriched = [];
  for (const o of orders) {
    const lines = await queryTenant<
      Array<{ item_name: string; quantity: number; line_total: number }>
    >(
      db,
      `SELECT item_name, quantity, line_total
       FROM food_order_lines WHERE order_id = :orderId ORDER BY id LIMIT 8`,
      { orderId: o.id }
    );
    enriched.push({
      ...o,
      total_amount: Number(o.total_amount),
      delivery_fee: Number(o.delivery_fee || 0),
      lines: lines.map((l) => ({
        item_name: l.item_name,
        quantity: Number(l.quantity),
        line_total: Number(l.line_total),
      })),
    });
  }

  return enriched;
}

export async function saveFoodOrderPaymentIntent(
  db: DbConfig,
  orderId: number,
  reference: string,
  amount: number,
  currency: string
) {
  await executeTenant(
    db,
    `INSERT INTO food_order_payment_intents (food_order_id, reference, amount, currency, status)
     VALUES (:orderId, :reference, :amount, :currency, 'pending')`,
    { orderId, reference, amount, currency }
  );
}

export async function confirmFoodOrderPayment(
  db: DbConfig,
  propertyId: number,
  reference: string,
  verifiedAmount: number
) {
  const intents = await queryTenant<
    Array<{ id: number; food_order_id: number; amount: number; status: string }>
  >(
    db,
    `SELECT id, food_order_id, amount, status FROM food_order_payment_intents
     WHERE reference = :reference LIMIT 1`,
    { reference }
  );
  const intent = intents[0];
  if (!intent) throw new Error('Food payment intent not found.');
  if (intent.status === 'success') return { already: true, order_id: intent.food_order_id };

  if (Math.abs(Number(intent.amount) - verifiedAmount) > 0.01) {
    throw new Error('Paid amount does not match food order total.');
  }

  await executeTenant(
    db,
    `UPDATE food_order_payment_intents
     SET status = 'success', paid_at = CURRENT_TIMESTAMP
     WHERE id = :id`,
    { id: intent.id }
  );
  await executeTenant(
    db,
    `UPDATE food_orders
     SET payment_status = 'paid', payment_reference = :reference
     WHERE id = :orderId AND property_id = :propertyId`,
    { orderId: intent.food_order_id, propertyId, reference }
  );

  return { already: false, order_id: intent.food_order_id };
}

/**
 * Staff records cash / COD collection so guest receipt & My Orders show Paid.
 */
export async function markFoodOrderCashCollected(
  db: DbConfig,
  propertyId: number,
  orderId: number,
  collectedByUserId?: number
) {
  const rows = await queryTenant<
    Array<{
      id: number;
      payment_status: string;
      payment_method: string | null;
      status: string;
    }>
  >(
    db,
    `SELECT id, payment_status, payment_method, status
     FROM food_orders
     WHERE id = :id AND property_id = :propertyId
     LIMIT 1`,
    { id: orderId, propertyId }
  );
  const order = rows[0];
  if (!order) throw new Error('Order not found.');
  if (order.status === 'cancelled') throw new Error('Cannot collect payment on a cancelled order.');
  if (order.payment_status === 'paid') {
    return { already: true as const, order_id: order.id };
  }

  const method = (order.payment_method || 'cash').toLowerCase();
  if (method === 'paystack') {
    throw new Error('This order is set for Paystack. Confirm card payment instead of cash collection.');
  }

  const reference = `CASH-${order.id}-${Date.now()}${collectedByUserId ? `-U${collectedByUserId}` : ''}`;

  await executeTenant(
    db,
    `UPDATE food_orders
     SET payment_status = 'paid',
         payment_reference = :reference,
         payment_method = COALESCE(NULLIF(payment_method, ''), 'cash')
     WHERE id = :id AND property_id = :propertyId AND payment_status <> 'paid'`,
    { id: orderId, propertyId, reference }
  );

  return { already: false as const, order_id: order.id, payment_reference: reference };
}

export async function listFoodOrdersForStaff(db: DbConfig, propertyId: number) {
  return queryTenant(
    db,
    `SELECT fo.id, fo.order_type, fo.room_number, fo.status, fo.total_amount, fo.notes, fo.created_at,
            fo.payment_status, fo.payment_method,
            CONCAT(g.first_name, ' ', g.last_name) AS guest_name
     FROM food_orders fo
     LEFT JOIN guests g ON g.id = fo.guest_id
     WHERE fo.property_id = :propertyId
     ORDER BY fo.created_at DESC
     LIMIT 100`,
    { propertyId }
  );
}

export async function updateFoodOrderStatus(
  db: DbConfig,
  propertyId: number,
  orderId: number,
  status: string,
  userId?: number
) {
  const allowed = ['pending', 'preparing', 'ready', 'delivered', 'cancelled'];
  if (!allowed.includes(status)) throw new Error('Invalid order status.');

  const orders = await queryTenant<
    Array<{
      id: number;
      reservation_id: number | null;
      total_amount: number;
      charged_to_folio: number;
      status: string;
    }>
  >(
    db,
    `SELECT id, reservation_id, total_amount, COALESCE(charged_to_folio, 0) AS charged_to_folio, status
     FROM food_orders WHERE id = :id AND property_id = :propertyId LIMIT 1`,
    { id: orderId, propertyId }
  );
  const order = orders[0];
  if (!order) throw new Error('Order not found.');

  await executeTenant(
    db,
    `UPDATE food_orders SET status = :status WHERE id = :id AND property_id = :propertyId`,
    { id: orderId, propertyId, status }
  );

  if (
    status === 'delivered' &&
    order.reservation_id &&
    !order.charged_to_folio &&
    Number(order.total_amount) > 0
  ) {
    const folioRows = await queryTenant<Array<{ id: number }>>(
      db,
      `SELECT id FROM folios WHERE reservation_id = :reservationId LIMIT 1`,
      { reservationId: order.reservation_id }
    );
    const folioId = folioRows[0]?.id;
    if (folioId && userId) {
      const { addFolioCharge } = await import('@/lib/services/hotel-service');
      await addFolioCharge(db, folioId, userId, {
        description: `Food order #${orderId}`,
        category: 'restaurant',
        amount: Number(order.total_amount),
        quantity: 1,
      });
      await executeTenant(
        db,
        `UPDATE food_orders SET charged_to_folio = 1 WHERE id = :id`,
        { id: orderId }
      );
    }
  }
}

/* ── Restaurant Dashboard: Menu Category CRUD ─────────────────────────────── */

export async function listMenuCategories(db: DbConfig, propertyId: number) {
  return queryTenant<Array<{ id: number; name: string; sort_order: number; is_active: number }>>(
    db,
    `SELECT id, name, sort_order, is_active FROM menu_categories
     WHERE property_id = :propertyId ORDER BY sort_order, name`,
    { propertyId }
  );
}

export async function upsertMenuCategory(
  db: DbConfig,
  propertyId: number,
  input: { id?: number; name: string; sort_order?: number; is_active?: number }
) {
  if (input.id) {
    await executeTenant(
      db,
      `UPDATE menu_categories SET name = :name, sort_order = :sort, is_active = :active
       WHERE id = :id AND property_id = :propertyId`,
      { id: input.id, propertyId, name: input.name, sort: input.sort_order ?? 0, active: input.is_active ?? 1 }
    );
    return { id: input.id };
  }
  const res = await executeTenant(
    db,
    `INSERT INTO menu_categories (property_id, name, sort_order, is_active)
     VALUES (:propertyId, :name, :sort, :active)`,
    { propertyId, name: input.name, sort: input.sort_order ?? 0, active: input.is_active ?? 1 }
  );
  return { id: Number((res as { insertId?: number }).insertId) };
}

export async function deleteMenuCategory(db: DbConfig, propertyId: number, id: number) {
  await executeTenant(
    db,
    `DELETE FROM menu_categories WHERE id = :id AND property_id = :propertyId`,
    { id, propertyId }
  );
}

/* ── Restaurant Dashboard: Menu Item CRUD ─────────────────────────────────── */

export async function listMenuItemsForStaff(db: DbConfig, propertyId: number) {
  return queryTenant<Array<{
    id: number; category_id: number; category_name: string;
    name: string; description: string | null; price: number;
    image_url: string | null; is_available: number; sort_order: number;
  }>>(
    db,
    `SELECT mi.id, mi.category_id, mc.name AS category_name,
            mi.name, mi.description, mi.price, mi.image_url, mi.is_available, mi.sort_order
     FROM menu_items mi
     JOIN menu_categories mc ON mc.id = mi.category_id
     WHERE mi.property_id = :propertyId
     ORDER BY mc.sort_order, mi.sort_order, mi.name`,
    { propertyId }
  );
}

export async function upsertMenuItem(
  db: DbConfig,
  propertyId: number,
  input: {
    id?: number;
    category_id: number;
    name: string;
    description?: string;
    price: number;
    image_url?: string;
    is_available?: number;
    sort_order?: number;
  }
) {
  if (input.id) {
    await executeTenant(
      db,
      `UPDATE menu_items
       SET category_id = :catId, name = :name, description = :desc, price = :price,
           image_url = :img, is_available = :avail, sort_order = :sort
       WHERE id = :id AND property_id = :propertyId`,
      {
        id: input.id, propertyId, catId: input.category_id, name: input.name,
        desc: input.description ?? null, price: input.price,
        img: input.image_url ?? null, avail: input.is_available ?? 1, sort: input.sort_order ?? 0,
      }
    );
    return { id: input.id };
  }
  const res = await executeTenant(
    db,
    `INSERT INTO menu_items (property_id, category_id, name, description, price, image_url, is_available, sort_order)
     VALUES (:propertyId, :catId, :name, :desc, :price, :img, :avail, :sort)`,
    {
      propertyId, catId: input.category_id, name: input.name,
      desc: input.description ?? null, price: input.price,
      img: input.image_url ?? null, avail: input.is_available ?? 1, sort: input.sort_order ?? 0,
    }
  );
  return { id: Number((res as { insertId?: number }).insertId) };
}

export async function deleteMenuItem(db: DbConfig, propertyId: number, id: number) {
  await executeTenant(
    db,
    `DELETE FROM menu_items WHERE id = :id AND property_id = :propertyId`,
    { id, propertyId }
  );
}

/* ── Restaurant Dashboard: Enriched Orders with Line Items ───────────────── */

export async function listFoodOrdersWithLines(db: DbConfig, propertyId: number) {
  const orders = await queryTenant<Array<{
    id: number; order_type: string; room_number: string | null;
    status: string; total_amount: number; notes: string | null;
    created_at: string; guest_name: string | null;
    payment_status: string; payment_method: string | null;
  }>>(
    db,
    `SELECT fo.id, fo.order_type, fo.room_number, fo.status, fo.total_amount, fo.notes, fo.created_at,
            fo.payment_status, fo.payment_method,
            CONCAT(COALESCE(g.first_name,''), ' ', COALESCE(g.last_name,'')) AS guest_name
     FROM food_orders fo
     LEFT JOIN guests g ON g.id = fo.guest_id
     WHERE fo.property_id = :propertyId
     ORDER BY fo.created_at DESC
     LIMIT 200`,
    { propertyId }
  );

  const lines = await queryTenant<Array<{
    order_id: number; item_name: string; quantity: number; unit_price: number; line_total: number;
  }>>(
    db,
    `SELECT fol.order_id, fol.item_name, fol.quantity, fol.unit_price, fol.line_total
     FROM food_order_lines fol
     JOIN food_orders fo ON fo.id = fol.order_id
     WHERE fo.property_id = :propertyId`,
    { propertyId }
  );

  return orders.map((o) => ({
    ...o,
    total_amount: Number(o.total_amount),
    lines: lines.filter((l) => l.order_id === o.id).map((l) => ({
      ...l,
      unit_price: Number(l.unit_price),
      line_total: Number(l.line_total),
    })),
  }));
}

