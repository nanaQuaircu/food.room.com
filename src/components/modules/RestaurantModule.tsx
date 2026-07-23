'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchApi, invalidateApiCache } from '@/lib/client/fetch-api';
import PremiumModal from '@/components/ui/PremiumModal';
import MenuImageUpload from '@/components/restaurant/MenuImageUpload';

/* ─── Types ──────────────────────────────────────────────────────────── */
type Category = { id: number; name: string; sort_order: number; is_active: number };

type MenuItem = {
  id: number; category_id: number; category_name: string;
  name: string; description: string | null; price: number;
  image_url: string | null; is_available: number; sort_order: number;
};

type OrderLine = {
  item_name: string; quantity: number; unit_price: number; line_total: number;
};

type Order = {
  id: number; order_type: string; room_number: string | null;
  status: string; total_amount: number; notes: string | null;
  created_at: string; guest_name: string | null; lines: OrderLine[];
  payment_status?: string; payment_method?: string | null;
};

const STATUS_COLS: Array<{ key: string; label: string; color: string; bg: string }> = [
  { key: 'pending',   label: '🕐 New Orders',   color: '#d97706', bg: '#fffbeb' },
  { key: 'preparing', label: '👨‍🍳 Preparing',   color: '#2563eb', bg: '#eff6ff' },
  { key: 'ready',     label: '✅ Ready',         color: '#16a34a', bg: '#f0fdf4' },
  { key: 'delivered', label: '📦 Delivered',     color: '#6b7280', bg: '#f9fafb' },
];
const CANCELLED_KEY = 'cancelled';

function timeSince(iso: string) {
  const secs = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  return `${Math.floor(secs / 3600)}h ago`;
}

/* ─── Order Card ─────────────────────────────────────────────────────── */
function OrderCard({
  order,
  onStatusChange,
  onMarkPaid,
}: {
  order: Order;
  onStatusChange: (id: number, s: string) => void;
  onMarkPaid: (id: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const NEXT: Record<string, string | undefined> = {
    pending: 'preparing', preparing: 'ready', ready: 'delivered',
  };
  const nextStatus = NEXT[order.status];
  const paymentStatus = order.payment_status || 'pending';
  const paymentMethod = (order.payment_method || 'cash').replace(/_/g, ' ');
  const canMarkPaid =
    paymentStatus !== 'paid' &&
    order.status !== CANCELLED_KEY &&
    (order.payment_method || 'cash') !== 'paystack';

  return (
    <div
      style={{
        background: '#fff',
        border: '1px solid #e5e7eb',
        borderRadius: 12,
        padding: '14px 16px',
        marginBottom: 12,
        boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
        transition: 'box-shadow 0.2s',
        cursor: 'pointer',
      }}
      onClick={() => setOpen((v) => !v)}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
        <div>
          <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>#{order.id}</span>
          <span
            style={{
              marginLeft: 8,
              fontSize: '0.75rem',
              padding: '2px 8px',
              borderRadius: 20,
              background: order.order_type === 'room_service' ? '#dbeafe' : '#fce7f3',
              color: order.order_type === 'room_service' ? '#1d4ed8' : '#9d174d',
              fontWeight: 600,
            }}
          >
            {order.order_type === 'room_service' ? `🚪 Room ${order.room_number || '?'}` : '🍽️ Dine-in'}
          </span>
          <span
            style={{
              marginLeft: 6,
              fontSize: '0.72rem',
              padding: '2px 8px',
              borderRadius: 20,
              fontWeight: 700,
              background: paymentStatus === 'paid' ? '#f0fdf4' : '#fffbeb',
              color: paymentStatus === 'paid' ? '#15803d' : '#92400e',
            }}
          >
            {paymentStatus === 'paid' ? 'Paid' : 'Unpaid'} · {paymentMethod}
          </span>
        </div>
        <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>{timeSince(order.created_at)}</span>
      </div>

      <div style={{ fontSize: '0.85rem', color: '#374151', marginBottom: 6 }}>
        <strong>{order.guest_name?.trim() || 'Guest'}</strong>
        {' · '}
        <span style={{ color: '#16a34a', fontWeight: 700 }}>GHS {order.total_amount.toFixed(2)}</span>
      </div>

      <div style={{ fontSize: '0.8rem', color: '#6b7280', marginBottom: 8 }}>
        {order.lines.slice(0, 2).map((l, i) => (
          <span key={i}>{l.quantity}× {l.item_name}{i < Math.min(order.lines.length, 2) - 1 ? ', ' : ''}</span>
        ))}
        {order.lines.length > 2 && <span> +{order.lines.length - 2} more</span>}
      </div>

      {open && (
        <div
          style={{
            borderTop: '1px solid #f3f4f6',
            paddingTop: 10,
            marginTop: 4,
            maxHeight: 160,
            overflowY: 'auto',
          }}
        >
          {order.lines.map((l, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', color: '#374151', marginBottom: 3 }}>
              <span>{l.quantity}× {l.item_name}</span>
              <span>GHS {l.line_total.toFixed(2)}</span>
            </div>
          ))}
          {order.notes && (
            <p style={{ marginTop: 8, fontSize: '0.8rem', color: '#9ca3af', fontStyle: 'italic' }}>
              Note: {order.notes}
            </p>
          )}
        </div>
      )}

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }} onClick={(e) => e.stopPropagation()}>
        {nextStatus && (
          <button
            type="button"
            onClick={() => onStatusChange(order.id, nextStatus)}
            style={{
              padding: '5px 14px', borderRadius: 20, border: 'none', fontWeight: 700,
              fontSize: '0.8rem', cursor: 'pointer', background: '#111827', color: '#fff',
            }}
          >
            Mark {nextStatus.charAt(0).toUpperCase() + nextStatus.slice(1)}
          </button>
        )}
        {canMarkPaid && (
          <button
            type="button"
            onClick={() => onMarkPaid(order.id)}
            style={{
              padding: '5px 14px', borderRadius: 20, border: 'none', fontWeight: 700,
              fontSize: '0.8rem', cursor: 'pointer', background: '#cb8670', color: '#fff',
            }}
          >
            Mark cash paid
          </button>
        )}
        {order.status !== CANCELLED_KEY && order.status !== 'delivered' && (
          <button
            type="button"
            onClick={() => onStatusChange(order.id, 'cancelled')}
            style={{
              padding: '5px 14px', borderRadius: 20, border: '1px solid #fca5a5',
              background: 'transparent', color: '#ef4444', fontWeight: 600,
              fontSize: '0.8rem', cursor: 'pointer',
            }}
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

/* ─── Orders Kanban Board ────────────────────────────────────────────── */
function OrdersBoard() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCancelled, setShowCancelled] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    const res = await fetchApi<Order[]>('/api/restaurant/orders', { skipCache: true });
    if (res.success && res.data) setOrders(res.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
    timerRef.current = setInterval(() => void load(), 20_000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [load]);

  async function handleStatusChange(id: number, status: string) {
    await fetchApi('/api/restaurant/orders', { method: 'PATCH', body: JSON.stringify({ id, status }) });
    invalidateApiCache('/api/restaurant/orders');
    void load();
  }

  async function handleMarkPaid(id: number) {
    await fetchApi('/api/restaurant/orders', {
      method: 'PATCH',
      body: JSON.stringify({ id, action: 'mark_paid' }),
    });
    invalidateApiCache('/api/restaurant/orders');
    void load();
  }

  const activeOrders = orders.filter((o) => o.status !== CANCELLED_KEY);
  const cancelledOrders = orders.filter((o) => o.status === CANCELLED_KEY);

  if (loading) return <div className="text-center py-5 text-muted">Loading orders…</div>;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h5 style={{ margin: 0, fontWeight: 700 }}>Live Orders Board</h5>
          <p style={{ margin: 0, fontSize: '0.85rem', color: '#9ca3af' }}>Auto-refreshes every 20 seconds</p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <label style={{ fontSize: '0.85rem', color: '#6b7280', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input type="checkbox" checked={showCancelled} onChange={(e) => setShowCancelled(e.target.checked)} />
            Show Cancelled
          </label>
          <button type="button" className="btn btn-sm btn-light" onClick={() => void load()}>
            ↻ Refresh
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
        {STATUS_COLS.map((col) => {
          const colOrders = activeOrders.filter((o) => o.status === col.key);
          return (
            <div
              key={col.key}
              style={{
                background: col.bg,
                borderRadius: 16,
                padding: '16px 14px',
                minHeight: 200,
                maxHeight: 'calc(100vh - 260px)',
                display: 'flex',
                flexDirection: 'column',
                border: `1px solid ${col.color}22`,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14, flexShrink: 0 }}>
                <h6 style={{ margin: 0, fontWeight: 700, color: col.color, fontSize: '0.9rem' }}>{col.label}</h6>
                {colOrders.length > 0 && (
                  <span style={{
                    background: col.color, color: '#fff', borderRadius: '50%',
                    width: 22, height: 22, fontSize: '0.75rem', fontWeight: 700,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {colOrders.length}
                  </span>
                )}
              </div>
              {colOrders.length === 0 ? (
                <p style={{ fontSize: '0.8rem', color: '#9ca3af', textAlign: 'center', padding: '20px 0' }}>No orders</p>
              ) : (
                <div
                  className="restaurant-orders-col-scroll"
                  style={{
                    overflowY: 'auto',
                    overflowX: 'hidden',
                    flex: 1,
                    minHeight: 0,
                    paddingRight: 4,
                  }}
                >
                  {colOrders.map((o) => (
                    <OrderCard
                      key={o.id}
                      order={o}
                      onStatusChange={handleStatusChange}
                      onMarkPaid={handleMarkPaid}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Cancelled section */}
      {showCancelled && cancelledOrders.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <h6 style={{ color: '#6b7280', fontWeight: 700 }}>🚫 Cancelled Orders ({cancelledOrders.length})</h6>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px,1fr))', gap: 12 }}>
            {cancelledOrders.map((o) => (
              <OrderCard
                key={o.id}
                order={o}
                onStatusChange={handleStatusChange}
                onMarkPaid={handleMarkPaid}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Menu Manager ───────────────────────────────────────────────────── */
function MenuManager() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [subTab, setSubTab] = useState<'items' | 'categories'>('items');
  const [editingItem, setEditingItem] = useState<Partial<MenuItem>>({});
  const [editingCat, setEditingCat] = useState<Partial<Category>>({});
  const [showItemForm, setShowItemForm] = useState(false);
  const [showCatForm, setShowCatForm] = useState(false);

  const load = useCallback(async () => {
    const [cRes, iRes] = await Promise.all([
      fetchApi<Category[]>('/api/restaurant/categories', { skipCache: true }),
      fetchApi<MenuItem[]>('/api/restaurant/items', { skipCache: true }),
    ]);
    if (cRes.success && cRes.data) setCategories(cRes.data);
    if (iRes.success && iRes.data) setItems(iRes.data);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveItem(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg('');
    try {
      const res = await fetchApi('/api/restaurant/items', {
        method: 'POST',
        body: JSON.stringify(editingItem),
      });
      setMsg(res.message || (res.success ? 'Saved!' : 'Error'));
      if (res.success) {
        setShowItemForm(false);
        setEditingItem({});
        invalidateApiCache('/api/restaurant/items');
        void load();
      }
    } finally {
      setSaving(false);
    }
  }

  async function saveCat(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg('');
    try {
      const res = await fetchApi('/api/restaurant/categories', {
        method: 'POST',
        body: JSON.stringify(editingCat),
      });
      setMsg(res.message || (res.success ? 'Saved!' : 'Error'));
      if (res.success) {
        setShowCatForm(false);
        setEditingCat({});
        invalidateApiCache('/api/restaurant/categories');
        void load();
      }
    } finally {
      setSaving(false);
    }
  }

  async function deleteItem(id: number) {
    if (!confirm('Delete this menu item?')) return;
    await fetchApi('/api/restaurant/items', { method: 'DELETE', body: JSON.stringify({ id }) });
    invalidateApiCache('/api/restaurant/items');
    void load();
  }

  async function deleteCat(id: number) {
    if (!confirm('Delete this category? All items in it will also be deleted.')) return;
    await fetchApi('/api/restaurant/categories', { method: 'DELETE', body: JSON.stringify({ id }) });
    invalidateApiCache('/api/restaurant/categories');
    void load();
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 12px',
    borderRadius: 8,
    border: '1px solid #e5e7eb',
    fontSize: '0.9rem',
    marginBottom: 12,
  };

  const btnPrimary: React.CSSProperties = {
    background: '#111827',
    color: '#fff',
    border: 'none',
    padding: '8px 20px',
    borderRadius: 20,
    fontWeight: 700,
    cursor: 'pointer',
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        {(['items', 'categories'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setSubTab(t)}
            style={{
              padding: '8px 20px',
              borderRadius: 20,
              fontWeight: 600,
              cursor: 'pointer',
              border: subTab === t ? 'none' : '1px solid #e5e7eb',
              background: subTab === t ? '#111827' : '#fff',
              color: subTab === t ? '#fff' : '#374151',
            }}
          >
            {t === 'items' ? '🍕 Menu Items' : '📂 Categories'}
          </button>
        ))}
      </div>

      {msg ? (
        <div
          className={`alert ${
            msg.includes('Error') || msg.includes('failed') ? 'alert-danger' : 'alert-success'
          } py-2`}
        >
          {msg}
        </div>
      ) : null}

      {subTab === 'items' ? (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h6 style={{ margin: 0 }}>{items.length} Menu Items</h6>
            <button
              type="button"
              style={btnPrimary}
              onClick={() => {
                setEditingItem({ is_available: 1 });
                setShowItemForm(true);
                setMsg('');
              }}
            >
              + Add Item
            </button>
          </div>

          <div className="table-responsive">
            <table className="table table-sm align-middle premium-table mb-0" style={{ fontSize: '0.88rem' }}>
              <thead>
                <tr>
                  <th style={{ width: 50 }}>Img</th>
                  <th>Item</th>
                  <th>Category</th>
                  <th>Price</th>
                  <th>Available</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      {item.image_url ? (
                        <img
                          src={item.image_url}
                          alt=""
                          style={{ width: 36, height: 36, borderRadius: 6, objectFit: 'cover' }}
                        />
                      ) : (
                        <div
                          style={{
                            width: 36,
                            height: 36,
                            borderRadius: 6,
                            background: '#f3f4f6',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '0.75rem',
                            color: '#9ca3af',
                            fontWeight: 700,
                          }}
                        >
                          {item.name.slice(0, 2).toUpperCase()}
                        </div>
                      )}
                    </td>
                    <td>
                      <strong>{item.name}</strong>
                      {item.description ? (
                        <div style={{ color: '#9ca3af', fontSize: '0.78rem' }}>{item.description}</div>
                      ) : null}
                    </td>
                    <td>
                      <span className="badge bg-light text-dark border">{item.category_name}</span>
                    </td>
                    <td style={{ fontWeight: 700, color: '#16a34a' }}>
                      GHS {Number(item.price).toFixed(2)}
                    </td>
                    <td>
                      <span className={`badge ${item.is_available ? 'bg-success' : 'bg-danger'}`}>
                        {item.is_available ? 'Yes' : 'No'}
                      </span>
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-secondary me-1"
                        onClick={() => {
                          setEditingItem({ ...item });
                          setShowItemForm(true);
                          setMsg('');
                        }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-danger"
                        onClick={() => void deleteItem(item.id)}
                      >
                        Del
                      </button>
                    </td>
                  </tr>
                ))}
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-4 text-muted">
                      No menu items yet. Click + Add Item to get started.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <PremiumModal
            open={showItemForm}
            title={editingItem.id ? 'Edit Item' : 'New Menu Item'}
            onClose={() => {
              setShowItemForm(false);
              setEditingItem({});
            }}
            size="lg"
            footer={
              <>
                <button
                  type="button"
                  className="btn btn-outline-secondary btn-sm"
                  onClick={() => {
                    setShowItemForm(false);
                    setEditingItem({});
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  form="restaurant-item-form"
                  className="btn btn-premium btn-sm"
                  disabled={saving}
                >
                  {saving ? 'Saving…' : editingItem.id ? 'Update Item' : 'Create Item'}
                </button>
              </>
            }
          >
            <form id="restaurant-item-form" onSubmit={(e) => void saveItem(e)}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#374151' }}>
                    Item Name *
                  </label>
                  <input
                    style={inputStyle}
                    value={editingItem.name || ''}
                    onChange={(e) => setEditingItem((p) => ({ ...p, name: e.target.value }))}
                    placeholder="e.g. Grilled Salmon"
                    required
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#374151' }}>
                    Category *
                  </label>
                  <select
                    style={inputStyle}
                    value={editingItem.category_id || ''}
                    onChange={(e) =>
                      setEditingItem((p) => ({ ...p, category_id: Number(e.target.value) }))
                    }
                    required
                  >
                    <option value="">Select category</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#374151' }}>
                    Price (GHS) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    style={inputStyle}
                    value={editingItem.price ?? ''}
                    onChange={(e) =>
                      setEditingItem((p) => ({ ...p, price: Number(e.target.value) }))
                    }
                    required
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#374151' }}>
                    Sort Order
                  </label>
                  <input
                    type="number"
                    style={inputStyle}
                    value={editingItem.sort_order ?? 0}
                    onChange={(e) =>
                      setEditingItem((p) => ({ ...p, sort_order: Number(e.target.value) }))
                    }
                  />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#374151' }}>
                    Description
                  </label>
                  <textarea
                    style={{ ...inputStyle, resize: 'vertical' }}
                    rows={2}
                    value={editingItem.description || ''}
                    onChange={(e) =>
                      setEditingItem((p) => ({ ...p, description: e.target.value }))
                    }
                    placeholder="Short dish description…"
                  />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <MenuImageUpload
                    imageUrl={editingItem.image_url}
                    onUpdated={(url) => setEditingItem((p) => ({ ...p, image_url: url }))}
                  />
                </div>
                <div
                  style={{
                    gridColumn: '1 / -1',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                  }}
                >
                  <input
                    type="checkbox"
                    id="avail-chk"
                    checked={editingItem.is_available === 1}
                    onChange={(e) =>
                      setEditingItem((p) => ({
                        ...p,
                        is_available: e.target.checked ? 1 : 0,
                      }))
                    }
                  />
                  <label htmlFor="avail-chk" style={{ fontSize: '0.88rem', cursor: 'pointer' }}>
                    Available for ordering
                  </label>
                </div>
              </div>
            </form>
          </PremiumModal>
        </div>
      ) : null}

      {subTab === 'categories' ? (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h6 style={{ margin: 0 }}>{categories.length} Categories</h6>
            <button
              type="button"
              style={btnPrimary}
              onClick={() => {
                setEditingCat({ is_active: 1, sort_order: 0 });
                setShowCatForm(true);
                setMsg('');
              }}
            >
              + Add Category
            </button>
          </div>

          <div className="table-responsive">
            <table className="table table-sm align-middle premium-table mb-0" style={{ fontSize: '0.88rem' }}>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Sort</th>
                  <th>Active</th>
                  <th>Items</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {categories.map((cat) => (
                  <tr key={cat.id}>
                    <td>
                      <strong>{cat.name}</strong>
                    </td>
                    <td>{cat.sort_order}</td>
                    <td>
                      <span className={`badge ${cat.is_active ? 'bg-success' : 'bg-secondary'}`}>
                        {cat.is_active ? 'Active' : 'Hidden'}
                      </span>
                    </td>
                    <td>{items.filter((i) => i.category_id === cat.id).length}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-secondary me-1"
                        onClick={() => {
                          setEditingCat({ ...cat });
                          setShowCatForm(true);
                          setMsg('');
                        }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-danger"
                        onClick={() => void deleteCat(cat.id)}
                      >
                        Del
                      </button>
                    </td>
                  </tr>
                ))}
                {categories.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-4 text-muted">
                      No categories yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <PremiumModal
            open={showCatForm}
            title={editingCat.id ? 'Edit Category' : 'New Category'}
            onClose={() => {
              setShowCatForm(false);
              setEditingCat({});
            }}
            footer={
              <>
                <button
                  type="button"
                  className="btn btn-outline-secondary btn-sm"
                  onClick={() => {
                    setShowCatForm(false);
                    setEditingCat({});
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  form="restaurant-cat-form"
                  className="btn btn-premium btn-sm"
                  disabled={saving}
                >
                  {saving ? 'Saving…' : editingCat.id ? 'Update' : 'Create'}
                </button>
              </>
            }
          >
            <form id="restaurant-cat-form" onSubmit={(e) => void saveCat(e)}>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#374151' }}>
                Category Name *
              </label>
              <input
                style={inputStyle}
                value={editingCat.name || ''}
                onChange={(e) => setEditingCat((p) => ({ ...p, name: e.target.value }))}
                placeholder="e.g. Starters"
                required
              />
              <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#374151' }}>
                Sort Order
              </label>
              <input
                type="number"
                style={inputStyle}
                value={editingCat.sort_order ?? 0}
                onChange={(e) =>
                  setEditingCat((p) => ({ ...p, sort_order: Number(e.target.value) }))
                }
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input
                  type="checkbox"
                  id="cat-active-chk"
                  checked={editingCat.is_active === 1}
                  onChange={(e) =>
                    setEditingCat((p) => ({
                      ...p,
                      is_active: e.target.checked ? 1 : 0,
                    }))
                  }
                />
                <label htmlFor="cat-active-chk" style={{ cursor: 'pointer', fontSize: '0.88rem' }}>
                  Active (visible to guests)
                </label>
              </div>
            </form>
          </PremiumModal>
        </div>
      ) : null}
    </div>
  );
}

/* ─── Main Module ────────────────────────────────────────────────────── */
export default function RestaurantModule() {
  const [tab, setTab] = useState<'orders' | 'menu'>('orders');

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h4 style={{ fontWeight: 800, margin: 0, fontSize: '1.4rem' }}>🍽️ Restaurant</h4>
        <p style={{ margin: 0, color: '#6b7280', fontSize: '0.9rem' }}>Manage your menu and process live food orders.</p>
      </div>

      {/* Main Tabs */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 24, borderBottom: '2px solid #f3f4f6' }}>
        {([
          { key: 'orders', label: '📋 Live Orders' },
          { key: 'menu',   label: '🍕 Menu Manager' },
        ] as const).map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            style={{
              padding: '10px 24px',
              border: 'none',
              background: 'none',
              fontWeight: 700,
              fontSize: '0.95rem',
              cursor: 'pointer',
              color: tab === key ? '#111827' : '#9ca3af',
              borderBottom: tab === key ? '2px solid #111827' : '2px solid transparent',
              marginBottom: -2,
              transition: 'color 0.2s',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'orders' ? <OrdersBoard /> : <MenuManager />}
    </div>
  );
}
