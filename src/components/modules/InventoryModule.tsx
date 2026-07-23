'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useToast } from '@/components/ui/ToastProvider';
import { useConfirm } from '@/components/ui/ConfirmProvider';
import {
  PremiumPage,
  PageHeader,
  PremiumCard,
  LoadingState,
  EmptyState,
} from '@/components/ui/premium';
import PremiumModal from '@/components/ui/PremiumModal';
import { fetchApi } from '@/lib/client/fetch-api';

type Supplier = {
  id: number;
  name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
};

type StockItem = {
  id: number;
  name: string;
  sku: string | null;
  department: string | null;
  unit: string | null;
  quantity_on_hand: number;
  reorder_level: number;
  unit_cost: number;
  supplier_id: number | null;
};

type InventoryData = {
  suppliers: Supplier[];
  items: StockItem[];
};

const emptySupplierForm = { name: '', contact_name: '', email: '', phone: '' };
const emptyItemForm = {
  name: '',
  sku: '',
  department: '',
  unit: '',
  quantity_on_hand: '',
  reorder_level: '',
  unit_cost: '',
  supplier_id: '',
};

export default function InventoryModule() {
  const toast = useToast();
  const confirm = useConfirm();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState<InventoryData | null>(null);
  const [supplierForm, setSupplierForm] = useState(emptySupplierForm);
  const [itemForm, setItemForm] = useState(emptyItemForm);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [editSupplierForm, setEditSupplierForm] = useState(emptySupplierForm);
  const [editingItem, setEditingItem] = useState<StockItem | null>(null);
  const [editItemForm, setEditItemForm] = useState({
    name: '',
    sku: '',
    department: '',
    unit: '',
    reorder_level: '',
    unit_cost: '',
    supplier_id: '',
  });
  const [adjustQty, setAdjustQty] = useState<Record<number, string>>({});
  const [purchaseOrders, setPurchaseOrders] = useState<
    Array<{
      id: number;
      po_number: string;
      status: string;
      total_amount: number;
      supplier_name: string | null;
      notes: string | null;
      created_at: string;
    }>
  >([]);
  const [poForm, setPoForm] = useState({
    supplier_id: '',
    notes: '',
    description: '',
    quantity: '1',
    unit_cost: '',
    stock_item_id: '',
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [invRes, poRes] = await Promise.all([
        fetchApi<InventoryData>('/api/inventory'),
        fetchApi<
          Array<{
            id: number;
            po_number: string;
            status: string;
            total_amount: number;
            supplier_name: string | null;
            notes: string | null;
            created_at: string;
          }>
        >('/api/inventory?view=purchase_orders'),
      ]);
      if (!invRes.success) {
        toast.error('Failed to load inventory', invRes.message);
        return;
      }
      setData(invRes.data ?? null);
      if (poRes.success && Array.isArray(poRes.data)) {
        setPurchaseOrders(poRes.data);
      }
    } catch {
      toast.error('Failed to load inventory');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  function openEditSupplier(s: Supplier) {
    setEditingSupplier(s);
    setEditSupplierForm({
      name: s.name,
      contact_name: s.contact_name || '',
      email: s.email || '',
      phone: s.phone || '',
    });
  }

  function openEditItem(item: StockItem) {
    setEditingItem(item);
    setEditItemForm({
      name: item.name,
      sku: item.sku || '',
      department: item.department || '',
      unit: item.unit || '',
      reorder_level: String(item.reorder_level ?? ''),
      unit_cost: String(item.unit_cost ?? ''),
      supplier_id: item.supplier_id ? String(item.supplier_id) : '',
    });
  }

  async function handleAddSupplier(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetchApi('/api/inventory', {
        method: 'POST',
        body: JSON.stringify({
          entity: 'supplier',
          name: supplierForm.name,
          contact_name: supplierForm.contact_name || undefined,
          email: supplierForm.email || undefined,
          phone: supplierForm.phone || undefined,
        }),
      });
      if (!res.success) {
        toast.error('Failed to add supplier', res.message);
        return;
      }
      toast.success('Supplier added');
      setSupplierForm(emptySupplierForm);
      await loadData();
    } catch {
      toast.error('Failed to add supplier');
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdateSupplier(e: FormEvent) {
    e.preventDefault();
    if (!editingSupplier) return;
    setSaving(true);
    try {
      const res = await fetchApi('/api/inventory', {
        method: 'PATCH',
        body: JSON.stringify({
          entity: 'supplier',
          id: editingSupplier.id,
          name: editSupplierForm.name,
          contact_name: editSupplierForm.contact_name,
          email: editSupplierForm.email,
          phone: editSupplierForm.phone,
        }),
      });
      if (!res.success) {
        toast.error('Failed to update supplier', res.message);
        return;
      }
      toast.success('Supplier updated');
      setEditingSupplier(null);
      await loadData();
    } catch {
      toast.error('Failed to update supplier');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteSupplier(s: Supplier) {
    const ok = await confirm({
      title: 'Delete supplier',
      message: `Delete “${s.name}”? Linked stock items will keep their data but lose this supplier link.`,
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      const res = await fetchApi('/api/inventory', {
        method: 'DELETE',
        body: JSON.stringify({ entity: 'supplier', id: s.id }),
      });
      if (!res.success) {
        toast.error('Failed to delete supplier', res.message);
        return;
      }
      toast.success('Supplier deleted');
      if (editingSupplier?.id === s.id) setEditingSupplier(null);
      await loadData();
    } catch {
      toast.error('Failed to delete supplier');
    }
  }

  async function handleAddItem(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetchApi('/api/inventory', {
        method: 'POST',
        body: JSON.stringify({
          entity: 'item',
          name: itemForm.name,
          sku: itemForm.sku || undefined,
          department: itemForm.department || undefined,
          unit: itemForm.unit || undefined,
          quantity_on_hand: itemForm.quantity_on_hand ? Number(itemForm.quantity_on_hand) : undefined,
          reorder_level: itemForm.reorder_level ? Number(itemForm.reorder_level) : undefined,
          unit_cost: itemForm.unit_cost ? Number(itemForm.unit_cost) : undefined,
          supplier_id: itemForm.supplier_id ? Number(itemForm.supplier_id) : undefined,
        }),
      });
      if (!res.success) {
        toast.error('Failed to add item', res.message);
        return;
      }
      toast.success('Stock item added');
      setItemForm(emptyItemForm);
      await loadData();
    } catch {
      toast.error('Failed to add item');
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdateItem(e: FormEvent) {
    e.preventDefault();
    if (!editingItem) return;
    setSaving(true);
    try {
      const res = await fetchApi('/api/inventory', {
        method: 'PATCH',
        body: JSON.stringify({
          entity: 'item',
          id: editingItem.id,
          name: editItemForm.name,
          sku: editItemForm.sku,
          department: editItemForm.department,
          unit: editItemForm.unit,
          reorder_level: editItemForm.reorder_level ? Number(editItemForm.reorder_level) : 0,
          unit_cost: editItemForm.unit_cost ? Number(editItemForm.unit_cost) : 0,
          supplier_id: editItemForm.supplier_id ? Number(editItemForm.supplier_id) : null,
        }),
      });
      if (!res.success) {
        toast.error('Failed to update item', res.message);
        return;
      }
      toast.success('Stock item updated');
      setEditingItem(null);
      await loadData();
    } catch {
      toast.error('Failed to update item');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteItem(item: StockItem) {
    const ok = await confirm({
      title: 'Delete stock item',
      message: `Delete “${item.name}”? This cannot be undone.`,
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      const res = await fetchApi('/api/inventory', {
        method: 'DELETE',
        body: JSON.stringify({ entity: 'item', id: item.id }),
      });
      if (!res.success) {
        toast.error('Failed to delete item', res.message);
        return;
      }
      toast.success('Stock item deleted');
      if (editingItem?.id === item.id) setEditingItem(null);
      await loadData();
    } catch {
      toast.error('Failed to delete item');
    }
  }

  async function adjustStock(itemId: number, delta: number) {
    const custom = adjustQty[itemId];
    const quantity = custom ? Number(custom) * (delta < 0 ? -1 : 1) : delta;
    if (!quantity || Number.isNaN(quantity)) {
      toast.warning('Enter a quantity to adjust');
      return;
    }
    try {
      const res = await fetchApi('/api/inventory', {
        method: 'PATCH',
        body: JSON.stringify({ id: itemId, quantity }),
      });
      if (!res.success) {
        toast.error('Stock adjustment failed', res.message);
        return;
      }
      toast.success('Stock updated');
      setAdjustQty((prev) => ({ ...prev, [itemId]: '' }));
      await loadData();
    } catch {
      toast.error('Stock adjustment failed');
    }
  }

  async function handleCreatePo(e: FormEvent) {
    e.preventDefault();
    const description = poForm.description.trim();
    const quantity = Number(poForm.quantity);
    const unitCost = Number(poForm.unit_cost);
    if (!description || !quantity || Number.isNaN(unitCost)) {
      toast.warning('Description, quantity, and unit cost are required.');
      return;
    }
    setSaving(true);
    try {
      const res = await fetchApi('/api/inventory', {
        method: 'POST',
        body: JSON.stringify({
          entity: 'purchase_order',
          supplier_id: poForm.supplier_id ? Number(poForm.supplier_id) : undefined,
          notes: poForm.notes || undefined,
          lines: [
            {
              stock_item_id: poForm.stock_item_id ? Number(poForm.stock_item_id) : undefined,
              description,
              quantity,
              unit_cost: unitCost,
            },
          ],
        }),
      });
      if (!res.success) {
        toast.error('Could not create purchase order', res.message);
        return;
      }
      toast.success('Purchase order created');
      setPoForm({
        supplier_id: '',
        notes: '',
        description: '',
        quantity: '1',
        unit_cost: '',
        stock_item_id: '',
      });
      await loadData();
    } catch {
      toast.error('Could not create purchase order');
    } finally {
      setSaving(false);
    }
  }

  async function updatePoStatus(id: number, status: string) {
    try {
      const res = await fetchApi('/api/inventory', {
        method: 'PATCH',
        body: JSON.stringify({ entity: 'purchase_order', id, status }),
      });
      if (!res.success) {
        toast.error('Could not update PO', res.message);
        return;
      }
      toast.success(`PO marked ${status}`);
      await loadData();
    } catch {
      toast.error('Could not update PO');
    }
  }

  if (loading) {
    return (
      <PremiumPage>
        <PremiumCard>
          <LoadingState label="Loading inventory…" />
        </PremiumCard>
      </PremiumPage>
    );
  }

  return (
    <PremiumPage>
      <PageHeader
        title="Inventory"
        subtitle="Suppliers, stock items, purchase orders, and quantity adjustments. Kitchen/restaurant items at or below reorder level notify kitchen staff by SMS when configured."
        icon="ti-box-seam"
      />

      <div className="row g-3 mb-3">
        <div className="col-lg-4">
          <PremiumCard title="Add Supplier">
            <form className="premium-form" onSubmit={handleAddSupplier}>
              <div className="mb-2">
                <input
                  className="form-control"
                  placeholder="Supplier name"
                  value={supplierForm.name}
                  onChange={(e) => setSupplierForm({ ...supplierForm, name: e.target.value })}
                  required
                />
              </div>
              <div className="mb-2">
                <input
                  className="form-control"
                  placeholder="Contact name"
                  value={supplierForm.contact_name}
                  onChange={(e) => setSupplierForm({ ...supplierForm, contact_name: e.target.value })}
                />
              </div>
              <div className="mb-2">
                <input
                  className="form-control"
                  placeholder="Email"
                  value={supplierForm.email}
                  onChange={(e) => setSupplierForm({ ...supplierForm, email: e.target.value })}
                />
              </div>
              <div className="mb-2">
                <input
                  className="form-control"
                  placeholder="Phone"
                  value={supplierForm.phone}
                  onChange={(e) => setSupplierForm({ ...supplierForm, phone: e.target.value })}
                />
              </div>
              <button type="submit" className="btn btn-premium btn-sm" disabled={saving}>
                Add Supplier
              </button>
            </form>
          </PremiumCard>
        </div>

        <div className="col-lg-8">
          <PremiumCard title="Suppliers" flush>
            {(data?.suppliers ?? []).length === 0 ? (
              <EmptyState message="No suppliers." icon="ti-truck" />
            ) : (
              <div className="table-responsive">
                <table className="table premium-table mb-0">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Contact</th>
                      <th>Email</th>
                      <th>Phone</th>
                      <th className="text-end">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data?.suppliers.map((s) => (
                      <tr key={s.id}>
                        <td className="fw-medium">{s.name}</td>
                        <td>{s.contact_name || '—'}</td>
                        <td>{s.email || '—'}</td>
                        <td>{s.phone || '—'}</td>
                        <td className="text-end">
                          <div className="d-flex flex-wrap gap-1 justify-content-end">
                            <button
                              type="button"
                              className="btn btn-sm btn-premium"
                              onClick={() => openEditSupplier(s)}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-danger"
                              onClick={() => void handleDeleteSupplier(s)}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </PremiumCard>
        </div>
      </div>

      <div className="row g-3">
        <div className="col-lg-4">
          <PremiumCard title="Add Stock Item">
            <form className="premium-form" onSubmit={handleAddItem}>
              <div className="mb-2">
                <input
                  className="form-control form-control-sm"
                  placeholder="Item name"
                  value={itemForm.name}
                  onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })}
                  required
                />
              </div>
              <div className="row g-2 mb-2">
                <div className="col-6">
                  <input
                    className="form-control form-control-sm"
                    placeholder="SKU"
                    value={itemForm.sku}
                    onChange={(e) => setItemForm({ ...itemForm, sku: e.target.value })}
                  />
                </div>
                <div className="col-6">
                  <input
                    className="form-control form-control-sm"
                    placeholder="Unit"
                    value={itemForm.unit}
                    onChange={(e) => setItemForm({ ...itemForm, unit: e.target.value })}
                  />
                </div>
              </div>
              <div className="mb-2">
                <input
                  className="form-control form-control-sm"
                  placeholder="Department"
                  value={itemForm.department}
                  onChange={(e) => setItemForm({ ...itemForm, department: e.target.value })}
                />
              </div>
              <div className="row g-2 mb-2">
                <div className="col-4">
                  <input
                    type="number"
                    className="form-control form-control-sm"
                    placeholder="Qty"
                    value={itemForm.quantity_on_hand}
                    onChange={(e) => setItemForm({ ...itemForm, quantity_on_hand: e.target.value })}
                  />
                </div>
                <div className="col-4">
                  <input
                    type="number"
                    className="form-control form-control-sm"
                    placeholder="Reorder"
                    value={itemForm.reorder_level}
                    onChange={(e) => setItemForm({ ...itemForm, reorder_level: e.target.value })}
                  />
                </div>
                <div className="col-4">
                  <input
                    type="number"
                    step="0.01"
                    className="form-control form-control-sm"
                    placeholder="Cost"
                    value={itemForm.unit_cost}
                    onChange={(e) => setItemForm({ ...itemForm, unit_cost: e.target.value })}
                  />
                </div>
              </div>
              <div className="mb-2">
                <select
                  className="form-select form-select-sm"
                  value={itemForm.supplier_id}
                  onChange={(e) => setItemForm({ ...itemForm, supplier_id: e.target.value })}
                >
                  <option value="">Supplier (optional)</option>
                  {(data?.suppliers ?? []).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <button type="submit" className="btn btn-premium btn-sm" disabled={saving}>
                Add Item
              </button>
            </form>
          </PremiumCard>
        </div>

        <div className="col-lg-8">
          <PremiumCard title="Stock Items" flush>
            {(data?.items ?? []).length === 0 ? (
              <EmptyState message="No stock items." icon="ti-box-seam" />
            ) : (
              <div className="table-responsive">
                <table className="table premium-table mb-0">
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>SKU</th>
                      <th>Dept</th>
                      <th>On Hand</th>
                      <th>Reorder</th>
                      <th>Adjust</th>
                      <th className="text-end">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data?.items.map((item) => {
                      const lowStock = Number(item.quantity_on_hand) <= Number(item.reorder_level);
                      return (
                        <tr key={item.id} className={lowStock ? 'table-warning' : ''}>
                          <td className="fw-medium">
                            {item.name}
                            {lowStock ? (
                              <span className="premium-badge premium-badge--danger ms-2">Low Stock</span>
                            ) : null}
                          </td>
                          <td>{item.sku || '—'}</td>
                          <td>{item.department || '—'}</td>
                          <td>
                            {item.quantity_on_hand} {item.unit || ''}
                          </td>
                          <td>{item.reorder_level}</td>
                          <td>
                            <div className="d-flex gap-1 align-items-center">
                              <input
                                type="number"
                                className="form-control form-control-sm"
                                style={{ width: 70 }}
                                placeholder="Qty"
                                value={adjustQty[item.id] ?? ''}
                                onChange={(e) =>
                                  setAdjustQty((prev) => ({ ...prev, [item.id]: e.target.value }))
                                }
                              />
                              <button
                                type="button"
                                className="btn btn-sm btn-premium-outline"
                                onClick={() => void adjustStock(item.id, 1)}
                              >
                                +
                              </button>
                              <button
                                type="button"
                                className="btn btn-sm btn-premium-outline"
                                onClick={() => void adjustStock(item.id, -1)}
                              >
                                −
                              </button>
                            </div>
                          </td>
                          <td className="text-end">
                            <div className="d-flex flex-wrap gap-1 justify-content-end">
                              <button
                                type="button"
                                className="btn btn-sm btn-premium"
                                onClick={() => openEditItem(item)}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                className="btn btn-sm btn-outline-danger"
                                onClick={() => void handleDeleteItem(item)}
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </PremiumCard>
        </div>
      </div>

      <div className="row g-3 mt-1">
        <div className="col-lg-4">
          <PremiumCard title="New Purchase Order">
            <form className="premium-form" onSubmit={handleCreatePo}>
              <div className="mb-2">
                <select
                  className="form-select form-select-sm"
                  value={poForm.supplier_id}
                  onChange={(e) => setPoForm({ ...poForm, supplier_id: e.target.value })}
                >
                  <option value="">Supplier (optional)</option>
                  {(data?.suppliers ?? []).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="mb-2">
                <select
                  className="form-select form-select-sm"
                  value={poForm.stock_item_id}
                  onChange={(e) => {
                    const id = e.target.value;
                    const item = (data?.items ?? []).find((i) => String(i.id) === id);
                    setPoForm({
                      ...poForm,
                      stock_item_id: id,
                      description: item?.name || poForm.description,
                      unit_cost:
                        item && !poForm.unit_cost ? String(item.unit_cost) : poForm.unit_cost,
                    });
                  }}
                >
                  <option value="">Link stock item (optional)</option>
                  {(data?.items ?? []).map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="mb-2">
                <input
                  className="form-control form-control-sm"
                  placeholder="Line description"
                  value={poForm.description}
                  onChange={(e) => setPoForm({ ...poForm, description: e.target.value })}
                  required
                />
              </div>
              <div className="row g-2 mb-2">
                <div className="col-6">
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    className="form-control form-control-sm"
                    placeholder="Qty"
                    value={poForm.quantity}
                    onChange={(e) => setPoForm({ ...poForm, quantity: e.target.value })}
                    required
                  />
                </div>
                <div className="col-6">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="form-control form-control-sm"
                    placeholder="Unit cost"
                    value={poForm.unit_cost}
                    onChange={(e) => setPoForm({ ...poForm, unit_cost: e.target.value })}
                    required
                  />
                </div>
              </div>
              <div className="mb-2">
                <input
                  className="form-control form-control-sm"
                  placeholder="Notes (optional)"
                  value={poForm.notes}
                  onChange={(e) => setPoForm({ ...poForm, notes: e.target.value })}
                />
              </div>
              <button type="submit" className="btn btn-premium btn-sm" disabled={saving}>
                Create PO
              </button>
            </form>
          </PremiumCard>
        </div>
        <div className="col-lg-8">
          <PremiumCard title="Purchase Orders" flush>
            {purchaseOrders.length === 0 ? (
              <EmptyState message="No purchase orders yet." icon="ti-file-invoice" />
            ) : (
              <div className="table-responsive">
                <table className="table premium-table mb-0">
                  <thead>
                    <tr>
                      <th>PO #</th>
                      <th>Supplier</th>
                      <th>Status</th>
                      <th>Total</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {purchaseOrders.map((po) => (
                      <tr key={po.id}>
                        <td className="fw-medium">{po.po_number}</td>
                        <td>{po.supplier_name || '—'}</td>
                        <td style={{ textTransform: 'capitalize' }}>{po.status}</td>
                        <td>{Number(po.total_amount).toFixed(2)}</td>
                        <td>
                          <div className="d-flex flex-wrap gap-1">
                            {po.status === 'draft' ? (
                              <button
                                type="button"
                                className="btn btn-sm btn-premium-outline"
                                onClick={() => void updatePoStatus(po.id, 'ordered')}
                              >
                                Mark ordered
                              </button>
                            ) : null}
                            {po.status === 'ordered' ? (
                              <button
                                type="button"
                                className="btn btn-sm btn-premium"
                                onClick={() => void updatePoStatus(po.id, 'received')}
                              >
                                Receive
                              </button>
                            ) : null}
                            {po.status !== 'received' && po.status !== 'cancelled' ? (
                              <button
                                type="button"
                                className="btn btn-sm btn-outline-secondary"
                                onClick={() => void updatePoStatus(po.id, 'cancelled')}
                              >
                                Cancel
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </PremiumCard>
        </div>
      </div>

      <PremiumModal
        open={Boolean(editingSupplier)}
        title={editingSupplier ? `Edit ${editingSupplier.name}` : 'Edit supplier'}
        onClose={() => setEditingSupplier(null)}
        footer={
          <>
            <button
              type="button"
              className="btn btn-outline-secondary btn-sm"
              onClick={() => setEditingSupplier(null)}
            >
              Cancel
            </button>
            <button
              type="submit"
              form="edit-supplier-form"
              className="btn btn-premium btn-sm"
              disabled={saving}
            >
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </>
        }
      >
        {editingSupplier ? (
          <form id="edit-supplier-form" className="premium-form" onSubmit={handleUpdateSupplier}>
            <div className="mb-3">
              <label className="form-label">Supplier name</label>
              <input
                className="form-control"
                value={editSupplierForm.name}
                onChange={(e) => setEditSupplierForm({ ...editSupplierForm, name: e.target.value })}
                required
              />
            </div>
            <div className="mb-3">
              <label className="form-label">Contact name</label>
              <input
                className="form-control"
                value={editSupplierForm.contact_name}
                onChange={(e) =>
                  setEditSupplierForm({ ...editSupplierForm, contact_name: e.target.value })
                }
              />
            </div>
            <div className="mb-3">
              <label className="form-label">Email</label>
              <input
                className="form-control"
                type="email"
                value={editSupplierForm.email}
                onChange={(e) => setEditSupplierForm({ ...editSupplierForm, email: e.target.value })}
              />
            </div>
            <div className="mb-3">
              <label className="form-label">Phone</label>
              <input
                className="form-control"
                value={editSupplierForm.phone}
                onChange={(e) => setEditSupplierForm({ ...editSupplierForm, phone: e.target.value })}
              />
            </div>
          </form>
        ) : null}
      </PremiumModal>

      <PremiumModal
        open={Boolean(editingItem)}
        title={editingItem ? `Edit ${editingItem.name}` : 'Edit stock item'}
        onClose={() => setEditingItem(null)}
        footer={
          <>
            <button
              type="button"
              className="btn btn-outline-secondary btn-sm"
              onClick={() => setEditingItem(null)}
            >
              Cancel
            </button>
            <button
              type="submit"
              form="edit-item-form"
              className="btn btn-premium btn-sm"
              disabled={saving}
            >
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </>
        }
      >
        {editingItem ? (
          <form id="edit-item-form" className="premium-form" onSubmit={handleUpdateItem}>
            <div className="mb-3">
              <label className="form-label">Item name</label>
              <input
                className="form-control"
                value={editItemForm.name}
                onChange={(e) => setEditItemForm({ ...editItemForm, name: e.target.value })}
                required
              />
            </div>
            <div className="row g-2 mb-3">
              <div className="col-6">
                <label className="form-label">SKU</label>
                <input
                  className="form-control"
                  value={editItemForm.sku}
                  onChange={(e) => setEditItemForm({ ...editItemForm, sku: e.target.value })}
                />
              </div>
              <div className="col-6">
                <label className="form-label">Unit</label>
                <input
                  className="form-control"
                  value={editItemForm.unit}
                  onChange={(e) => setEditItemForm({ ...editItemForm, unit: e.target.value })}
                />
              </div>
            </div>
            <div className="mb-3">
              <label className="form-label">Department</label>
              <input
                className="form-control"
                placeholder="e.g. restaurant, housekeeping"
                value={editItemForm.department}
                onChange={(e) => setEditItemForm({ ...editItemForm, department: e.target.value })}
              />
              <div className="form-text">
                Use restaurant/kitchen/food for kitchen SMS low-stock alerts.
              </div>
            </div>
            <div className="row g-2 mb-3">
              <div className="col-6">
                <label className="form-label">Reorder level</label>
                <input
                  type="number"
                  className="form-control"
                  value={editItemForm.reorder_level}
                  onChange={(e) =>
                    setEditItemForm({ ...editItemForm, reorder_level: e.target.value })
                  }
                />
              </div>
              <div className="col-6">
                <label className="form-label">Unit cost</label>
                <input
                  type="number"
                  step="0.01"
                  className="form-control"
                  value={editItemForm.unit_cost}
                  onChange={(e) => setEditItemForm({ ...editItemForm, unit_cost: e.target.value })}
                />
              </div>
            </div>
            <div className="mb-3">
              <label className="form-label">Supplier</label>
              <select
                className="form-select"
                value={editItemForm.supplier_id}
                onChange={(e) => setEditItemForm({ ...editItemForm, supplier_id: e.target.value })}
              >
                <option value="">None</option>
                {(data?.suppliers ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </form>
        ) : null}
      </PremiumModal>
    </PremiumPage>
  );
}
