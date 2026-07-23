'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useToast } from '@/components/ui/ToastProvider';
import { useConfirm } from '@/components/ui/ConfirmProvider';
import {
  PremiumPage,
  PageHeader,
  PremiumCard,
  PremiumTabs,
  StatCard,
  LoadingState,
  EmptyState,
} from '@/components/ui/premium';
import PremiumModal from '@/components/ui/PremiumModal';
import TablePagination, { paginateSlice } from '@/components/ui/TablePagination';
import { fetchApi } from '@/lib/client/fetch-api';

type Location = {
  id: number;
  code: string;
  name: string;
  sort_order: number;
  is_active: number;
};

type WarehouseItem = {
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
  is_low_stock: boolean;
  balances: Record<number, number>;
};

type Supplier = { id: number; name: string };

type PurchaseLine = { item_id: number; item_name: string; quantity: number; unit_cost: number; line_total: number };
type Purchase = {
  id: number;
  reference: string;
  purchase_date: string;
  total_amount: number;
  notes: string | null;
  supplier_id?: number | null;
  location_name: string;
  supplier_name: string | null;
  lines: PurchaseLine[];
};

type TransferLine = { item_id: number; item_name: string; quantity: number };
type Transfer = {
  id: number;
  reference: string;
  transfer_date: string;
  notes: string | null;
  from_location_name: string;
  to_location_name: string;
  lines: TransferLine[];
};

type UsageLog = {
  id: number;
  quantity: number;
  usage_date: string;
  notes: string | null;
  location_name: string;
  item_name: string;
  unit: string;
};

type Conversion = {
  id: number;
  item_id: number | null;
  item_name: string | null;
  from_unit: string;
  to_unit: string;
  factor: number;
};

type DashboardStats = {
  total_items: number;
  low_stock_count: number;
  stock_value: number;
  purchase_count: number;
  transfer_count: number;
  usage_count: number;
  location_totals: Array<{ location_id: number; location_name: string; total_quantity: number; total_value: number }>;
};

const PAGE_SIZE = 10;

const TABS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'stock', label: 'Stock' },
  { id: 'purchases', label: 'Purchases' },
  { id: 'transfers', label: 'Transfers' },
  { id: 'usage', label: 'Usage' },
  { id: 'conversions', label: 'Conversions' },
];

const todayIso = () => new Date().toISOString().slice(0, 10);

function money(n: number) {
  return `GHS ${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const emptyEditItemForm = {
  name: '',
  sku: '',
  category: '',
  department: '',
  unit: '',
  purchase_unit: '',
  usage_unit: '',
  conversion_factor: '',
  reorder_level: '',
  unit_cost: '',
};

export default function WarehouseModule() {
  const toast = useToast();
  const confirm = useConfirm();
  const [tab, setTab] = useState('dashboard');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [dashboard, setDashboard] = useState<DashboardStats | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [items, setItems] = useState<WarehouseItem[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [usage, setUsage] = useState<UsageLog[]>([]);
  const [conversions, setConversions] = useState<Conversion[]>([]);

  const [itemsPage, setItemsPage] = useState(1);
  const [purchasesPage, setPurchasesPage] = useState(1);
  const [transfersPage, setTransfersPage] = useState(1);
  const [usagePage, setUsagePage] = useState(1);
  const [conversionsPage, setConversionsPage] = useState(1);

  const [itemForm, setItemForm] = useState({
    name: '',
    sku: '',
    category: '',
    department: '',
    unit: '',
    purchase_unit: '',
    usage_unit: '',
    conversion_factor: '',
    quantity_on_hand: '',
    reorder_level: '',
    unit_cost: '',
  });

  const [purchaseForm, setPurchaseForm] = useState({
    location_id: '',
    supplier_id: '',
    purchase_date: todayIso(),
    notes: '',
  });
  const [purchaseLines, setPurchaseLines] = useState<Array<{ item_id: string; quantity: string; unit_cost: string }>>([]);
  const [purchaseLineDraft, setPurchaseLineDraft] = useState({ item_id: '', quantity: '', unit_cost: '' });

  const [transferForm, setTransferForm] = useState({
    from_location_id: '',
    to_location_id: '',
    transfer_date: todayIso(),
    notes: '',
  });
  const [transferLines, setTransferLines] = useState<Array<{ item_id: string; quantity: string }>>([]);
  const [transferLineDraft, setTransferLineDraft] = useState({ item_id: '', quantity: '' });

  const [usageForm, setUsageForm] = useState({ location_id: '', usage_date: todayIso(), notes: '' });
  const [usageLines, setUsageLines] = useState<Array<{ item_id: string; quantity: string }>>([]);
  const [usageLineDraft, setUsageLineDraft] = useState({ item_id: '', quantity: '' });

  const [conversionForm, setConversionForm] = useState({ item_id: '', from_unit: '', to_unit: '', factor: '' });

  const [editingItem, setEditingItem] = useState<WarehouseItem | null>(null);
  const [editItemForm, setEditItemForm] = useState(emptyEditItemForm);
  const [editingPurchase, setEditingPurchase] = useState<Purchase | null>(null);
  const [editPurchaseForm, setEditPurchaseForm] = useState({
    purchase_date: '',
    notes: '',
    supplier_id: '',
  });
  const [editingTransfer, setEditingTransfer] = useState<Transfer | null>(null);
  const [editTransferForm, setEditTransferForm] = useState({ transfer_date: '', notes: '' });
  const [editingUsage, setEditingUsage] = useState<UsageLog | null>(null);
  const [editUsageForm, setEditUsageForm] = useState({ usage_date: '', notes: '', quantity: '' });
  const [editingConversion, setEditingConversion] = useState<Conversion | null>(null);
  const [editConversionForm, setEditConversionForm] = useState({
    item_id: '',
    from_unit: '',
    to_unit: '',
    factor: '',
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [dashRes, locRes, itemsRes, purchRes, trRes, usageRes, convRes, invRes] = await Promise.all([
        fetchApi<DashboardStats>('/api/warehouse?view=dashboard'),
        fetchApi<Location[]>('/api/warehouse?view=locations'),
        fetchApi<WarehouseItem[]>('/api/warehouse?view=items'),
        fetchApi<Purchase[]>('/api/warehouse?view=purchases'),
        fetchApi<Transfer[]>('/api/warehouse?view=transfers'),
        fetchApi<UsageLog[]>('/api/warehouse?view=usage'),
        fetchApi<Conversion[]>('/api/warehouse?view=conversions'),
        fetchApi<{ suppliers: Supplier[] }>('/api/inventory'),
      ]);

      if (dashRes.success) setDashboard(dashRes.data ?? null);
      if (locRes.success) setLocations(locRes.data ?? []);
      if (itemsRes.success) setItems(itemsRes.data ?? []);
      if (purchRes.success) setPurchases(purchRes.data ?? []);
      if (trRes.success) setTransfers(trRes.data ?? []);
      if (usageRes.success) setUsage(usageRes.data ?? []);
      if (convRes.success) setConversions(convRes.data ?? []);
      if (invRes.success) setSuppliers(invRes.data?.suppliers ?? []);
      setItemsPage(1);
      setPurchasesPage(1);
      setTransfersPage(1);
      setUsagePage(1);
      setConversionsPage(1);
    } catch {
      toast.error('Failed to load warehouse data');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    setItemsPage(1);
    setPurchasesPage(1);
    setTransfersPage(1);
    setUsagePage(1);
    setConversionsPage(1);
  }, [tab]);

  const itemsPaged = useMemo(() => paginateSlice(items, itemsPage, PAGE_SIZE), [items, itemsPage]);
  const purchasesPaged = useMemo(
    () => paginateSlice(purchases, purchasesPage, PAGE_SIZE),
    [purchases, purchasesPage]
  );
  const transfersPaged = useMemo(
    () => paginateSlice(transfers, transfersPage, PAGE_SIZE),
    [transfers, transfersPage]
  );
  const usagePaged = useMemo(() => paginateSlice(usage, usagePage, PAGE_SIZE), [usage, usagePage]);
  const conversionsPaged = useMemo(
    () => paginateSlice(conversions, conversionsPage, PAGE_SIZE),
    [conversions, conversionsPage]
  );

  const warehouseLocationId = locations.find((l) => l.code === 'warehouse')?.id;

  function itemName(id: string | number) {
    return items.find((i) => i.id === Number(id))?.name || `#${id}`;
  }

  async function handleAddItem(e: FormEvent) {
    e.preventDefault();
    if (!itemForm.name.trim()) {
      toast.warning('Item name is required');
      return;
    }
    setSaving(true);
    try {
      const res = await fetchApi('/api/warehouse', {
        method: 'POST',
        body: JSON.stringify({
          entity: 'item',
          name: itemForm.name,
          sku: itemForm.sku || undefined,
          category: itemForm.category || undefined,
          department: itemForm.department || undefined,
          unit: itemForm.unit || undefined,
          purchase_unit: itemForm.purchase_unit || undefined,
          usage_unit: itemForm.usage_unit || undefined,
          conversion_factor: itemForm.conversion_factor ? Number(itemForm.conversion_factor) : undefined,
          quantity_on_hand: itemForm.quantity_on_hand ? Number(itemForm.quantity_on_hand) : undefined,
          reorder_level: itemForm.reorder_level ? Number(itemForm.reorder_level) : undefined,
          unit_cost: itemForm.unit_cost ? Number(itemForm.unit_cost) : undefined,
        }),
      });
      if (!res.success) {
        toast.error('Failed to add item', res.message);
        return;
      }
      toast.success('Stock item added');
      setItemForm({
        name: '',
        sku: '',
        category: '',
        department: '',
        unit: '',
        purchase_unit: '',
        usage_unit: '',
        conversion_factor: '',
        quantity_on_hand: '',
        reorder_level: '',
        unit_cost: '',
      });
      await loadData();
    } catch {
      toast.error('Failed to add item');
    } finally {
      setSaving(false);
    }
  }

  function addPurchaseLine() {
    if (!purchaseLineDraft.item_id || !purchaseLineDraft.quantity || !purchaseLineDraft.unit_cost) {
      toast.warning('Select an item, quantity, and unit cost');
      return;
    }
    setPurchaseLines((prev) => [...prev, purchaseLineDraft]);
    setPurchaseLineDraft({ item_id: '', quantity: '', unit_cost: '' });
  }

  async function handleCreatePurchase(e: FormEvent) {
    e.preventDefault();
    if (!purchaseLines.length) {
      toast.warning('Add at least one line to the purchase');
      return;
    }
    setSaving(true);
    try {
      const res = await fetchApi('/api/warehouse', {
        method: 'POST',
        body: JSON.stringify({
          entity: 'purchase',
          location_id: purchaseForm.location_id ? Number(purchaseForm.location_id) : undefined,
          supplier_id: purchaseForm.supplier_id ? Number(purchaseForm.supplier_id) : undefined,
          purchase_date: purchaseForm.purchase_date,
          notes: purchaseForm.notes || undefined,
          lines: purchaseLines.map((l) => ({
            item_id: Number(l.item_id),
            quantity: Number(l.quantity),
            unit_cost: Number(l.unit_cost),
          })),
        }),
      });
      if (!res.success) {
        toast.error('Failed to record purchase', res.message);
        return;
      }
      toast.success('Purchase recorded');
      setPurchaseLines([]);
      setPurchaseForm({ location_id: '', supplier_id: '', purchase_date: todayIso(), notes: '' });
      await loadData();
    } catch {
      toast.error('Failed to record purchase');
    } finally {
      setSaving(false);
    }
  }

  function addTransferLine() {
    if (!transferLineDraft.item_id || !transferLineDraft.quantity) {
      toast.warning('Select an item and quantity');
      return;
    }
    setTransferLines((prev) => [...prev, transferLineDraft]);
    setTransferLineDraft({ item_id: '', quantity: '' });
  }

  async function handleCreateTransfer(e: FormEvent) {
    e.preventDefault();
    if (!transferForm.from_location_id || !transferForm.to_location_id) {
      toast.warning('Select both from and to locations');
      return;
    }
    if (!transferLines.length) {
      toast.warning('Add at least one line to the transfer');
      return;
    }
    setSaving(true);
    try {
      const res = await fetchApi('/api/warehouse', {
        method: 'POST',
        body: JSON.stringify({
          entity: 'transfer',
          from_location_id: Number(transferForm.from_location_id),
          to_location_id: Number(transferForm.to_location_id),
          transfer_date: transferForm.transfer_date,
          notes: transferForm.notes || undefined,
          lines: transferLines.map((l) => ({ item_id: Number(l.item_id), quantity: Number(l.quantity) })),
        }),
      });
      if (!res.success) {
        toast.error('Failed to record transfer', res.message);
        return;
      }
      toast.success('Transfer recorded');
      setTransferLines([]);
      setTransferForm({ from_location_id: '', to_location_id: '', transfer_date: todayIso(), notes: '' });
      await loadData();
    } catch {
      toast.error('Failed to record transfer');
    } finally {
      setSaving(false);
    }
  }

  function addUsageLine() {
    if (!usageLineDraft.item_id || !usageLineDraft.quantity) {
      toast.warning('Select an item and quantity');
      return;
    }
    setUsageLines((prev) => [...prev, usageLineDraft]);
    setUsageLineDraft({ item_id: '', quantity: '' });
  }

  async function handleLogUsage(e: FormEvent) {
    e.preventDefault();
    if (!usageForm.location_id) {
      toast.warning('Select a location');
      return;
    }
    if (!usageLines.length) {
      toast.warning('Add at least one line to the usage log');
      return;
    }
    setSaving(true);
    try {
      const res = await fetchApi('/api/warehouse', {
        method: 'POST',
        body: JSON.stringify({
          entity: 'usage',
          location_id: Number(usageForm.location_id),
          usage_date: usageForm.usage_date,
          notes: usageForm.notes || undefined,
          lines: usageLines.map((l) => ({ item_id: Number(l.item_id), quantity: Number(l.quantity) })),
        }),
      });
      if (!res.success) {
        toast.error('Failed to log usage', res.message);
        return;
      }
      toast.success('Usage logged');
      setUsageLines([]);
      setUsageForm({ location_id: '', usage_date: todayIso(), notes: '' });
      await loadData();
    } catch {
      toast.error('Failed to log usage');
    } finally {
      setSaving(false);
    }
  }

  async function handleUpsertConversion(e: FormEvent) {
    e.preventDefault();
    if (!conversionForm.from_unit || !conversionForm.to_unit || !conversionForm.factor) {
      toast.warning('From unit, to unit, and factor are required');
      return;
    }
    setSaving(true);
    try {
      const res = await fetchApi('/api/warehouse', {
        method: 'POST',
        body: JSON.stringify({
          entity: 'conversion',
          item_id: conversionForm.item_id ? Number(conversionForm.item_id) : undefined,
          from_unit: conversionForm.from_unit,
          to_unit: conversionForm.to_unit,
          factor: Number(conversionForm.factor),
        }),
      });
      if (!res.success) {
        toast.error('Failed to save conversion', res.message);
        return;
      }
      toast.success('Conversion saved');
      setConversionForm({ item_id: '', from_unit: '', to_unit: '', factor: '' });
      await loadData();
    } catch {
      toast.error('Failed to save conversion');
    } finally {
      setSaving(false);
    }
  }

  function openEditItem(item: WarehouseItem) {
    setEditingItem(item);
    setEditItemForm({
      name: item.name,
      sku: item.sku || '',
      category: item.category || '',
      department: item.department || '',
      unit: item.unit || '',
      purchase_unit: item.purchase_unit || '',
      usage_unit: item.usage_unit || '',
      conversion_factor: String(item.conversion_factor ?? ''),
      reorder_level: String(item.reorder_level ?? ''),
      unit_cost: String(item.unit_cost ?? ''),
    });
  }

  function openEditPurchase(p: Purchase) {
    setEditingPurchase(p);
    setEditPurchaseForm({
      purchase_date: p.purchase_date,
      notes: p.notes || '',
      supplier_id: p.supplier_id ? String(p.supplier_id) : '',
    });
  }

  function openEditTransfer(t: Transfer) {
    setEditingTransfer(t);
    setEditTransferForm({
      transfer_date: t.transfer_date,
      notes: t.notes || '',
    });
  }

  function openEditUsage(u: UsageLog) {
    setEditingUsage(u);
    setEditUsageForm({
      usage_date: u.usage_date,
      notes: u.notes || '',
      quantity: String(u.quantity ?? ''),
    });
  }

  function openEditConversion(c: Conversion) {
    setEditingConversion(c);
    setEditConversionForm({
      item_id: c.item_id ? String(c.item_id) : '',
      from_unit: c.from_unit,
      to_unit: c.to_unit,
      factor: String(c.factor ?? ''),
    });
  }

  async function handleUpdateItem(e: FormEvent) {
    e.preventDefault();
    if (!editingItem) return;
    setSaving(true);
    try {
      const res = await fetchApi('/api/warehouse', {
        method: 'PATCH',
        body: JSON.stringify({
          entity: 'item',
          id: editingItem.id,
          name: editItemForm.name,
          sku: editItemForm.sku,
          category: editItemForm.category,
          department: editItemForm.department,
          unit: editItemForm.unit,
          purchase_unit: editItemForm.purchase_unit,
          usage_unit: editItemForm.usage_unit,
          conversion_factor: editItemForm.conversion_factor ? Number(editItemForm.conversion_factor) : 0,
          reorder_level: editItemForm.reorder_level ? Number(editItemForm.reorder_level) : 0,
          unit_cost: editItemForm.unit_cost ? Number(editItemForm.unit_cost) : 0,
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

  async function handleDeleteItem(item: WarehouseItem) {
    const ok = await confirm({
      title: 'Delete stock item',
      message: `Delete "${item.name}"? This cannot be undone.`,
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      const res = await fetchApi('/api/warehouse', {
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

  async function handleUpdatePurchase(e: FormEvent) {
    e.preventDefault();
    if (!editingPurchase) return;
    setSaving(true);
    try {
      const res = await fetchApi('/api/warehouse', {
        method: 'PATCH',
        body: JSON.stringify({
          entity: 'purchase',
          id: editingPurchase.id,
          purchase_date: editPurchaseForm.purchase_date,
          notes: editPurchaseForm.notes,
          supplier_id: editPurchaseForm.supplier_id ? Number(editPurchaseForm.supplier_id) : null,
        }),
      });
      if (!res.success) {
        toast.error('Failed to update purchase', res.message);
        return;
      }
      toast.success('Purchase updated');
      setEditingPurchase(null);
      await loadData();
    } catch {
      toast.error('Failed to update purchase');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeletePurchase(p: Purchase) {
    const ok = await confirm({
      title: 'Delete purchase',
      message: `Delete purchase "${p.reference}"? Stock quantities will be reversed.`,
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      const res = await fetchApi('/api/warehouse', {
        method: 'DELETE',
        body: JSON.stringify({ entity: 'purchase', id: p.id }),
      });
      if (!res.success) {
        toast.error('Failed to delete purchase', res.message);
        return;
      }
      toast.success('Purchase deleted');
      if (editingPurchase?.id === p.id) setEditingPurchase(null);
      await loadData();
    } catch {
      toast.error('Failed to delete purchase');
    }
  }

  async function handleUpdateTransfer(e: FormEvent) {
    e.preventDefault();
    if (!editingTransfer) return;
    setSaving(true);
    try {
      const res = await fetchApi('/api/warehouse', {
        method: 'PATCH',
        body: JSON.stringify({
          entity: 'transfer',
          id: editingTransfer.id,
          transfer_date: editTransferForm.transfer_date,
          notes: editTransferForm.notes,
        }),
      });
      if (!res.success) {
        toast.error('Failed to update transfer', res.message);
        return;
      }
      toast.success('Transfer updated');
      setEditingTransfer(null);
      await loadData();
    } catch {
      toast.error('Failed to update transfer');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteTransfer(t: Transfer) {
    const ok = await confirm({
      title: 'Delete transfer',
      message: `Delete transfer "${t.reference}"? Stock balances will be reversed.`,
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      const res = await fetchApi('/api/warehouse', {
        method: 'DELETE',
        body: JSON.stringify({ entity: 'transfer', id: t.id }),
      });
      if (!res.success) {
        toast.error('Failed to delete transfer', res.message);
        return;
      }
      toast.success('Transfer deleted');
      if (editingTransfer?.id === t.id) setEditingTransfer(null);
      await loadData();
    } catch {
      toast.error('Failed to delete transfer');
    }
  }

  async function handleUpdateUsage(e: FormEvent) {
    e.preventDefault();
    if (!editingUsage) return;
    setSaving(true);
    try {
      const res = await fetchApi('/api/warehouse', {
        method: 'PATCH',
        body: JSON.stringify({
          entity: 'usage',
          id: editingUsage.id,
          usage_date: editUsageForm.usage_date,
          notes: editUsageForm.notes,
          quantity: editUsageForm.quantity ? Number(editUsageForm.quantity) : undefined,
        }),
      });
      if (!res.success) {
        toast.error('Failed to update usage log', res.message);
        return;
      }
      toast.success('Usage log updated');
      setEditingUsage(null);
      await loadData();
    } catch {
      toast.error('Failed to update usage log');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteUsage(u: UsageLog) {
    const ok = await confirm({
      title: 'Delete usage log',
      message: `Delete usage of ${u.quantity} ${u.unit} for "${u.item_name}"? Stock will be restored.`,
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      const res = await fetchApi('/api/warehouse', {
        method: 'DELETE',
        body: JSON.stringify({ entity: 'usage', id: u.id }),
      });
      if (!res.success) {
        toast.error('Failed to delete usage log', res.message);
        return;
      }
      toast.success('Usage log deleted');
      if (editingUsage?.id === u.id) setEditingUsage(null);
      await loadData();
    } catch {
      toast.error('Failed to delete usage log');
    }
  }

  async function handleUpdateConversion(e: FormEvent) {
    e.preventDefault();
    if (!editingConversion) return;
    setSaving(true);
    try {
      const res = await fetchApi('/api/warehouse', {
        method: 'PATCH',
        body: JSON.stringify({
          entity: 'conversion',
          id: editingConversion.id,
          item_id: editConversionForm.item_id ? Number(editConversionForm.item_id) : null,
          from_unit: editConversionForm.from_unit,
          to_unit: editConversionForm.to_unit,
          factor: Number(editConversionForm.factor),
        }),
      });
      if (!res.success) {
        toast.error('Failed to update conversion', res.message);
        return;
      }
      toast.success('Conversion updated');
      setEditingConversion(null);
      await loadData();
    } catch {
      toast.error('Failed to update conversion');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteConversion(c: Conversion) {
    const label = c.item_name
      ? `${c.from_unit} → ${c.to_unit} (${c.item_name})`
      : `${c.from_unit} → ${c.to_unit}`;
    const ok = await confirm({
      title: 'Delete conversion',
      message: `Delete conversion "${label}"?`,
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      const res = await fetchApi('/api/warehouse', {
        method: 'DELETE',
        body: JSON.stringify({ entity: 'conversion', id: c.id }),
      });
      if (!res.success) {
        toast.error('Failed to delete conversion', res.message);
        return;
      }
      toast.success('Conversion deleted');
      if (editingConversion?.id === c.id) setEditingConversion(null);
      await loadData();
    } catch {
      toast.error('Failed to delete conversion');
    }
  }

  if (loading) {
    return (
      <PremiumPage>
        <PremiumCard>
          <LoadingState label="Loading warehouse…" />
        </PremiumCard>
      </PremiumPage>
    );
  }

  return (
    <PremiumPage>
      <PageHeader
        title="Warehouse"
        subtitle="Multi-location inventory across warehouse, kitchen, cleaners, and front office."
        icon="ti-building-warehouse"
      />

      <div className="mb-3">
        <PremiumTabs tabs={TABS} active={tab} onChange={setTab} />
      </div>

      {tab === 'dashboard' ? (
        <>
          <div className="row g-3 mb-3">
            <div className="col-md-4 col-sm-6">
              <StatCard
                label="Stock Value"
                value={money(dashboard?.stock_value ?? 0)}
                icon="ti-currency-dollar"
                tone="primary"
                featured
              />
            </div>
            <div className="col-md-4 col-sm-6">
              <StatCard label="Total Items" value={dashboard?.total_items ?? 0} icon="ti-box-seam" tone="info" />
            </div>
            <div className="col-md-4 col-sm-6">
              <StatCard
                label="Low Stock"
                value={dashboard?.low_stock_count ?? 0}
                icon="ti-alert-triangle"
                tone="danger"
              />
            </div>
            <div className="col-md-4 col-sm-6">
              <StatCard label="Purchases" value={dashboard?.purchase_count ?? 0} icon="ti-truck" tone="success" />
            </div>
            <div className="col-md-4 col-sm-6">
              <StatCard
                label="Transfers"
                value={dashboard?.transfer_count ?? 0}
                icon="ti-transfer"
                tone="violet"
              />
            </div>
            <div className="col-md-4 col-sm-6">
              <StatCard label="Usage Logs" value={dashboard?.usage_count ?? 0} icon="ti-clipboard-list" tone="warning" />
            </div>
          </div>

          <PremiumCard title="Stock by Location" flush>
            {(dashboard?.location_totals ?? []).length === 0 ? (
              <EmptyState message="No locations yet." icon="ti-building-warehouse" />
            ) : (
              <div className="table-responsive">
                <table className="table premium-table mb-0">
                  <thead>
                    <tr>
                      <th>Location</th>
                      <th>Total Quantity</th>
                      <th>Total Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dashboard?.location_totals.map((lt) => (
                      <tr key={lt.location_id}>
                        <td className="fw-medium">{lt.location_name}</td>
                        <td>{Number(lt.total_quantity).toLocaleString()}</td>
                        <td>{money(lt.total_value)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </PremiumCard>
        </>
      ) : null}

      {tab === 'stock' ? (
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
                      placeholder="Category"
                      value={itemForm.category}
                      onChange={(e) => setItemForm({ ...itemForm, category: e.target.value })}
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
                      className="form-control form-control-sm"
                      placeholder="Base unit"
                      value={itemForm.unit}
                      onChange={(e) => setItemForm({ ...itemForm, unit: e.target.value })}
                    />
                  </div>
                  <div className="col-4">
                    <input
                      className="form-control form-control-sm"
                      placeholder="Purchase unit"
                      value={itemForm.purchase_unit}
                      onChange={(e) => setItemForm({ ...itemForm, purchase_unit: e.target.value })}
                    />
                  </div>
                  <div className="col-4">
                    <input
                      className="form-control form-control-sm"
                      placeholder="Usage unit"
                      value={itemForm.usage_unit}
                      onChange={(e) => setItemForm({ ...itemForm, usage_unit: e.target.value })}
                    />
                  </div>
                </div>
                <div className="row g-2 mb-2">
                  <div className="col-6">
                    <input
                      type="number"
                      step="0.0001"
                      className="form-control form-control-sm"
                      placeholder="Conversion factor"
                      value={itemForm.conversion_factor}
                      onChange={(e) => setItemForm({ ...itemForm, conversion_factor: e.target.value })}
                    />
                  </div>
                  <div className="col-6">
                    <input
                      type="number"
                      className="form-control form-control-sm"
                      placeholder="Reorder level"
                      value={itemForm.reorder_level}
                      onChange={(e) => setItemForm({ ...itemForm, reorder_level: e.target.value })}
                    />
                  </div>
                </div>
                <div className="row g-2 mb-2">
                  <div className="col-6">
                    <input
                      type="number"
                      className="form-control form-control-sm"
                      placeholder="Opening qty (warehouse)"
                      value={itemForm.quantity_on_hand}
                      onChange={(e) => setItemForm({ ...itemForm, quantity_on_hand: e.target.value })}
                    />
                  </div>
                  <div className="col-6">
                    <input
                      type="number"
                      step="0.01"
                      className="form-control form-control-sm"
                      placeholder="Unit cost"
                      value={itemForm.unit_cost}
                      onChange={(e) => setItemForm({ ...itemForm, unit_cost: e.target.value })}
                    />
                  </div>
                </div>
                <button type="submit" className="btn btn-premium btn-sm" disabled={saving}>
                  Add Item
                </button>
              </form>
            </PremiumCard>
          </div>

          <div className="col-lg-8">
            <PremiumCard title="Stock Items" flush>
              {items.length === 0 ? (
                <EmptyState message="No stock items." icon="ti-box-seam" />
              ) : (
                <div className="table-responsive">
                  <table className="table premium-table mb-0">
                    <thead>
                      <tr>
                        <th>Item</th>
                        <th>Category</th>
                        {locations.map((loc) => (
                          <th key={loc.id}>{loc.name}</th>
                        ))}
                        <th>Total</th>
                        <th>Reorder</th>
                        <th className="text-end">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {itemsPaged.items.map((item) => (
                        <tr key={item.id} className={item.is_low_stock ? 'table-warning' : ''}>
                          <td className="fw-medium">
                            {item.name}
                            {item.is_low_stock ? (
                              <span className="premium-badge premium-badge--danger ms-2">Low Stock</span>
                            ) : null}
                          </td>
                          <td>{item.category || '—'}</td>
                          {locations.map((loc) => (
                            <td key={loc.id}>{Number(item.balances[loc.id] ?? 0).toLocaleString()}</td>
                          ))}
                          <td>
                            {Number(item.quantity_on_hand).toLocaleString()} {item.unit}
                          </td>
                          <td>{item.reorder_level}</td>
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
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {items.length > 0 ? (
                <TablePagination
                  page={itemsPaged.safePage}
                  pageSize={PAGE_SIZE}
                  total={items.length}
                  onPageChange={setItemsPage}
                />
              ) : null}
            </PremiumCard>
          </div>
        </div>
      ) : null}

      {tab === 'purchases' ? (
        <div className="row g-3">
          <div className="col-lg-4">
            <PremiumCard title="Record Purchase">
              <form className="premium-form" onSubmit={handleCreatePurchase}>
                <div className="row g-2 mb-2">
                  <div className="col-6">
                    <select
                      className="form-select form-select-sm"
                      value={purchaseForm.location_id}
                      onChange={(e) => setPurchaseForm({ ...purchaseForm, location_id: e.target.value })}
                    >
                      <option value="">Warehouse (default)</option>
                      {locations.map((loc) => (
                        <option key={loc.id} value={loc.id}>
                          {loc.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-6">
                    <input
                      type="date"
                      className="form-control form-control-sm"
                      value={purchaseForm.purchase_date}
                      onChange={(e) => setPurchaseForm({ ...purchaseForm, purchase_date: e.target.value })}
                    />
                  </div>
                </div>
                <div className="mb-2">
                  <select
                    className="form-select form-select-sm"
                    value={purchaseForm.supplier_id}
                    onChange={(e) => setPurchaseForm({ ...purchaseForm, supplier_id: e.target.value })}
                  >
                    <option value="">Supplier (optional)</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="mb-2">
                  <input
                    className="form-control form-control-sm"
                    placeholder="Notes"
                    value={purchaseForm.notes}
                    onChange={(e) => setPurchaseForm({ ...purchaseForm, notes: e.target.value })}
                  />
                </div>

                <hr />
                <p className="premium-form__label mb-1">Add line</p>
                <div className="row g-2 mb-2">
                  <div className="col-12">
                    <select
                      className="form-select form-select-sm"
                      value={purchaseLineDraft.item_id}
                      onChange={(e) => setPurchaseLineDraft({ ...purchaseLineDraft, item_id: e.target.value })}
                    >
                      <option value="">Select item…</option>
                      {items.map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-6">
                    <input
                      type="number"
                      step="0.0001"
                      className="form-control form-control-sm"
                      placeholder="Quantity"
                      value={purchaseLineDraft.quantity}
                      onChange={(e) => setPurchaseLineDraft({ ...purchaseLineDraft, quantity: e.target.value })}
                    />
                  </div>
                  <div className="col-6">
                    <input
                      type="number"
                      step="0.01"
                      className="form-control form-control-sm"
                      placeholder="Unit cost"
                      value={purchaseLineDraft.unit_cost}
                      onChange={(e) => setPurchaseLineDraft({ ...purchaseLineDraft, unit_cost: e.target.value })}
                    />
                  </div>
                </div>
                <button type="button" className="btn btn-premium-outline btn-sm mb-3" onClick={addPurchaseLine}>
                  <i className="ti ti-plus me-1" /> Add line
                </button>

                {purchaseLines.length > 0 ? (
                  <ul className="list-unstyled small mb-3">
                    {purchaseLines.map((l, idx) => (
                      <li key={idx} className="d-flex justify-content-between border-bottom py-1">
                        <span>
                          {itemName(l.item_id)} × {l.quantity} @ {l.unit_cost}
                        </span>
                        <button
                          type="button"
                          className="btn btn-sm btn-link text-danger p-0"
                          onClick={() => setPurchaseLines((prev) => prev.filter((_, i) => i !== idx))}
                        >
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}

                <button type="submit" className="btn btn-premium btn-sm" disabled={saving}>
                  Save Purchase
                </button>
              </form>
            </PremiumCard>
          </div>

          <div className="col-lg-8">
            <PremiumCard title="Purchase History" flush>
              {purchases.length === 0 ? (
                <EmptyState message="No purchases recorded." icon="ti-truck" />
              ) : (
                <div className="table-responsive">
                  <table className="table premium-table mb-0">
                    <thead>
                      <tr>
                        <th>Reference</th>
                        <th>Date</th>
                        <th>Location</th>
                        <th>Supplier</th>
                        <th>Lines</th>
                        <th>Total</th>
                        <th className="text-end">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {purchasesPaged.items.map((p) => (
                        <tr key={p.id}>
                          <td className="fw-medium">{p.reference}</td>
                          <td>{p.purchase_date}</td>
                          <td>{p.location_name}</td>
                          <td>{p.supplier_name || '—'}</td>
                          <td>{p.lines.map((l) => `${l.item_name} (${l.quantity})`).join(', ')}</td>
                          <td>{money(p.total_amount)}</td>
                          <td className="text-end">
                            <div className="d-flex flex-wrap gap-1 justify-content-end">
                              <button
                                type="button"
                                className="btn btn-sm btn-premium"
                                onClick={() => openEditPurchase(p)}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                className="btn btn-sm btn-outline-danger"
                                onClick={() => void handleDeletePurchase(p)}
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
              {purchases.length > 0 ? (
                <TablePagination
                  page={purchasesPaged.safePage}
                  pageSize={PAGE_SIZE}
                  total={purchases.length}
                  onPageChange={setPurchasesPage}
                />
              ) : null}
            </PremiumCard>
          </div>
        </div>
      ) : null}

      {tab === 'transfers' ? (
        <div className="row g-3">
          <div className="col-lg-4">
            <PremiumCard title="Record Transfer">
              <form className="premium-form" onSubmit={handleCreateTransfer}>
                <div className="row g-2 mb-2">
                  <div className="col-6">
                    <select
                      className="form-select form-select-sm"
                      value={transferForm.from_location_id}
                      onChange={(e) => setTransferForm({ ...transferForm, from_location_id: e.target.value })}
                      required
                    >
                      <option value="">From…</option>
                      {locations.map((loc) => (
                        <option key={loc.id} value={loc.id}>
                          {loc.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-6">
                    <select
                      className="form-select form-select-sm"
                      value={transferForm.to_location_id}
                      onChange={(e) => setTransferForm({ ...transferForm, to_location_id: e.target.value })}
                      required
                    >
                      <option value="">To…</option>
                      {locations.map((loc) => (
                        <option key={loc.id} value={loc.id}>
                          {loc.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="mb-2">
                  <input
                    type="date"
                    className="form-control form-control-sm"
                    value={transferForm.transfer_date}
                    onChange={(e) => setTransferForm({ ...transferForm, transfer_date: e.target.value })}
                  />
                </div>
                <div className="mb-2">
                  <input
                    className="form-control form-control-sm"
                    placeholder="Notes"
                    value={transferForm.notes}
                    onChange={(e) => setTransferForm({ ...transferForm, notes: e.target.value })}
                  />
                </div>

                <hr />
                <p className="premium-form__label mb-1">Add line</p>
                <div className="row g-2 mb-2">
                  <div className="col-12">
                    <select
                      className="form-select form-select-sm"
                      value={transferLineDraft.item_id}
                      onChange={(e) => setTransferLineDraft({ ...transferLineDraft, item_id: e.target.value })}
                    >
                      <option value="">Select item…</option>
                      {items.map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.name}
                          {warehouseLocationId ? ` (WH: ${Number(i.balances[warehouseLocationId] ?? 0)})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-12">
                    <input
                      type="number"
                      step="0.0001"
                      className="form-control form-control-sm"
                      placeholder="Quantity"
                      value={transferLineDraft.quantity}
                      onChange={(e) => setTransferLineDraft({ ...transferLineDraft, quantity: e.target.value })}
                    />
                  </div>
                </div>
                <button type="button" className="btn btn-premium-outline btn-sm mb-3" onClick={addTransferLine}>
                  <i className="ti ti-plus me-1" /> Add line
                </button>

                {transferLines.length > 0 ? (
                  <ul className="list-unstyled small mb-3">
                    {transferLines.map((l, idx) => (
                      <li key={idx} className="d-flex justify-content-between border-bottom py-1">
                        <span>
                          {itemName(l.item_id)} × {l.quantity}
                        </span>
                        <button
                          type="button"
                          className="btn btn-sm btn-link text-danger p-0"
                          onClick={() => setTransferLines((prev) => prev.filter((_, i) => i !== idx))}
                        >
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}

                <button type="submit" className="btn btn-premium btn-sm" disabled={saving}>
                  Save Transfer
                </button>
              </form>
            </PremiumCard>
          </div>

          <div className="col-lg-8">
            <PremiumCard title="Transfer History" flush>
              {transfers.length === 0 ? (
                <EmptyState message="No transfers recorded." icon="ti-transfer" />
              ) : (
                <div className="table-responsive">
                  <table className="table premium-table mb-0">
                    <thead>
                      <tr>
                        <th>Reference</th>
                        <th>Date</th>
                        <th>From</th>
                        <th>To</th>
                        <th>Lines</th>
                        <th className="text-end">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {transfersPaged.items.map((t) => (
                        <tr key={t.id}>
                          <td className="fw-medium">{t.reference}</td>
                          <td>{t.transfer_date}</td>
                          <td>{t.from_location_name}</td>
                          <td>{t.to_location_name}</td>
                          <td>{t.lines.map((l) => `${l.item_name} (${l.quantity})`).join(', ')}</td>
                          <td className="text-end">
                            <div className="d-flex flex-wrap gap-1 justify-content-end">
                              <button
                                type="button"
                                className="btn btn-sm btn-premium"
                                onClick={() => openEditTransfer(t)}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                className="btn btn-sm btn-outline-danger"
                                onClick={() => void handleDeleteTransfer(t)}
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
              {transfers.length > 0 ? (
                <TablePagination
                  page={transfersPaged.safePage}
                  pageSize={PAGE_SIZE}
                  total={transfers.length}
                  onPageChange={setTransfersPage}
                />
              ) : null}
            </PremiumCard>
          </div>
        </div>
      ) : null}

      {tab === 'usage' ? (
        <div className="row g-3">
          <div className="col-lg-4">
            <PremiumCard title="Log Usage">
              <form className="premium-form" onSubmit={handleLogUsage}>
                <div className="row g-2 mb-2">
                  <div className="col-6">
                    <select
                      className="form-select form-select-sm"
                      value={usageForm.location_id}
                      onChange={(e) => setUsageForm({ ...usageForm, location_id: e.target.value })}
                      required
                    >
                      <option value="">Location…</option>
                      {locations
                        .filter((l) => l.code !== 'warehouse')
                        .map((loc) => (
                          <option key={loc.id} value={loc.id}>
                            {loc.name}
                          </option>
                        ))}
                    </select>
                  </div>
                  <div className="col-6">
                    <input
                      type="date"
                      className="form-control form-control-sm"
                      value={usageForm.usage_date}
                      onChange={(e) => setUsageForm({ ...usageForm, usage_date: e.target.value })}
                    />
                  </div>
                </div>
                <div className="mb-2">
                  <input
                    className="form-control form-control-sm"
                    placeholder="Notes"
                    value={usageForm.notes}
                    onChange={(e) => setUsageForm({ ...usageForm, notes: e.target.value })}
                  />
                </div>

                <hr />
                <p className="premium-form__label mb-1">Add line</p>
                <div className="row g-2 mb-2">
                  <div className="col-12">
                    <select
                      className="form-select form-select-sm"
                      value={usageLineDraft.item_id}
                      onChange={(e) => setUsageLineDraft({ ...usageLineDraft, item_id: e.target.value })}
                    >
                      <option value="">Select item…</option>
                      {items.map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-12">
                    <input
                      type="number"
                      step="0.0001"
                      className="form-control form-control-sm"
                      placeholder="Quantity used"
                      value={usageLineDraft.quantity}
                      onChange={(e) => setUsageLineDraft({ ...usageLineDraft, quantity: e.target.value })}
                    />
                  </div>
                </div>
                <button type="button" className="btn btn-premium-outline btn-sm mb-3" onClick={addUsageLine}>
                  <i className="ti ti-plus me-1" /> Add line
                </button>

                {usageLines.length > 0 ? (
                  <ul className="list-unstyled small mb-3">
                    {usageLines.map((l, idx) => (
                      <li key={idx} className="d-flex justify-content-between border-bottom py-1">
                        <span>
                          {itemName(l.item_id)} × {l.quantity}
                        </span>
                        <button
                          type="button"
                          className="btn btn-sm btn-link text-danger p-0"
                          onClick={() => setUsageLines((prev) => prev.filter((_, i) => i !== idx))}
                        >
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}

                <button type="submit" className="btn btn-premium btn-sm" disabled={saving}>
                  Save Usage
                </button>
              </form>
            </PremiumCard>
          </div>

          <div className="col-lg-8">
            <PremiumCard title="Usage History" flush>
              {usage.length === 0 ? (
                <EmptyState message="No usage logged." icon="ti-clipboard-list" />
              ) : (
                <div className="table-responsive">
                  <table className="table premium-table mb-0">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Location</th>
                        <th>Item</th>
                        <th>Quantity</th>
                        <th>Notes</th>
                        <th className="text-end">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {usagePaged.items.map((u) => (
                        <tr key={u.id}>
                          <td>{u.usage_date}</td>
                          <td>{u.location_name}</td>
                          <td className="fw-medium">{u.item_name}</td>
                          <td>
                            {u.quantity} {u.unit}
                          </td>
                          <td>{u.notes || '—'}</td>
                          <td className="text-end">
                            <div className="d-flex flex-wrap gap-1 justify-content-end">
                              <button
                                type="button"
                                className="btn btn-sm btn-premium"
                                onClick={() => openEditUsage(u)}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                className="btn btn-sm btn-outline-danger"
                                onClick={() => void handleDeleteUsage(u)}
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
              {usage.length > 0 ? (
                <TablePagination
                  page={usagePaged.safePage}
                  pageSize={PAGE_SIZE}
                  total={usage.length}
                  onPageChange={setUsagePage}
                />
              ) : null}
            </PremiumCard>
          </div>
        </div>
      ) : null}

      {tab === 'conversions' ? (
        <div className="row g-3">
          <div className="col-lg-4">
            <PremiumCard title="Add Unit Conversion">
              <form className="premium-form" onSubmit={handleUpsertConversion}>
                <div className="mb-2">
                  <select
                    className="form-select form-select-sm"
                    value={conversionForm.item_id}
                    onChange={(e) => setConversionForm({ ...conversionForm, item_id: e.target.value })}
                  >
                    <option value="">Global (all items)</option>
                    {items.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="row g-2 mb-2">
                  <div className="col-6">
                    <input
                      className="form-control form-control-sm"
                      placeholder="From unit (e.g. carton)"
                      value={conversionForm.from_unit}
                      onChange={(e) => setConversionForm({ ...conversionForm, from_unit: e.target.value })}
                      required
                    />
                  </div>
                  <div className="col-6">
                    <input
                      className="form-control form-control-sm"
                      placeholder="To unit (e.g. bottle)"
                      value={conversionForm.to_unit}
                      onChange={(e) => setConversionForm({ ...conversionForm, to_unit: e.target.value })}
                      required
                    />
                  </div>
                </div>
                <div className="mb-2">
                  <input
                    type="number"
                    step="0.000001"
                    className="form-control form-control-sm"
                    placeholder="Factor (1 from-unit = N to-units)"
                    value={conversionForm.factor}
                    onChange={(e) => setConversionForm({ ...conversionForm, factor: e.target.value })}
                    required
                  />
                </div>
                <button type="submit" className="btn btn-premium btn-sm" disabled={saving}>
                  Save Conversion
                </button>
              </form>
            </PremiumCard>
          </div>

          <div className="col-lg-8">
            <PremiumCard title="Unit Conversions" flush>
              {conversions.length === 0 ? (
                <EmptyState message="No conversions defined." icon="ti-arrows-exchange" />
              ) : (
                <div className="table-responsive">
                  <table className="table premium-table mb-0">
                    <thead>
                      <tr>
                        <th>Item</th>
                        <th>From</th>
                        <th>To</th>
                        <th>Factor</th>
                        <th className="text-end">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {conversionsPaged.items.map((c) => (
                        <tr key={c.id}>
                          <td className="fw-medium">{c.item_name || 'All items'}</td>
                          <td>{c.from_unit}</td>
                          <td>{c.to_unit}</td>
                          <td>{c.factor}</td>
                          <td className="text-end">
                            <div className="d-flex flex-wrap gap-1 justify-content-end">
                              <button
                                type="button"
                                className="btn btn-sm btn-premium"
                                onClick={() => openEditConversion(c)}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                className="btn btn-sm btn-outline-danger"
                                onClick={() => void handleDeleteConversion(c)}
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
              {conversions.length > 0 ? (
                <TablePagination
                  page={conversionsPaged.safePage}
                  pageSize={PAGE_SIZE}
                  total={conversions.length}
                  onPageChange={setConversionsPage}
                />
              ) : null}
            </PremiumCard>
          </div>
        </div>
      ) : null}

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
              form="edit-warehouse-item-form"
              className="btn btn-premium btn-sm"
              disabled={saving}
            >
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </>
        }
      >
        {editingItem ? (
          <form id="edit-warehouse-item-form" className="premium-form" onSubmit={handleUpdateItem}>
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
                <label className="form-label">Category</label>
                <input
                  className="form-control"
                  value={editItemForm.category}
                  onChange={(e) => setEditItemForm({ ...editItemForm, category: e.target.value })}
                />
              </div>
            </div>
            <div className="mb-3">
              <label className="form-label">Department</label>
              <input
                className="form-control"
                value={editItemForm.department}
                onChange={(e) => setEditItemForm({ ...editItemForm, department: e.target.value })}
              />
            </div>
            <div className="row g-2 mb-3">
              <div className="col-4">
                <label className="form-label">Base unit</label>
                <input
                  className="form-control"
                  value={editItemForm.unit}
                  onChange={(e) => setEditItemForm({ ...editItemForm, unit: e.target.value })}
                />
              </div>
              <div className="col-4">
                <label className="form-label">Purchase unit</label>
                <input
                  className="form-control"
                  value={editItemForm.purchase_unit}
                  onChange={(e) => setEditItemForm({ ...editItemForm, purchase_unit: e.target.value })}
                />
              </div>
              <div className="col-4">
                <label className="form-label">Usage unit</label>
                <input
                  className="form-control"
                  value={editItemForm.usage_unit}
                  onChange={(e) => setEditItemForm({ ...editItemForm, usage_unit: e.target.value })}
                />
              </div>
            </div>
            <div className="row g-2 mb-3">
              <div className="col-4">
                <label className="form-label">Conversion factor</label>
                <input
                  type="number"
                  step="0.0001"
                  className="form-control"
                  value={editItemForm.conversion_factor}
                  onChange={(e) => setEditItemForm({ ...editItemForm, conversion_factor: e.target.value })}
                />
              </div>
              <div className="col-4">
                <label className="form-label">Reorder level</label>
                <input
                  type="number"
                  className="form-control"
                  value={editItemForm.reorder_level}
                  onChange={(e) => setEditItemForm({ ...editItemForm, reorder_level: e.target.value })}
                />
              </div>
              <div className="col-4">
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
          </form>
        ) : null}
      </PremiumModal>

      <PremiumModal
        open={Boolean(editingPurchase)}
        title={editingPurchase ? `Edit ${editingPurchase.reference}` : 'Edit purchase'}
        onClose={() => setEditingPurchase(null)}
        footer={
          <>
            <button
              type="button"
              className="btn btn-outline-secondary btn-sm"
              onClick={() => setEditingPurchase(null)}
            >
              Cancel
            </button>
            <button
              type="submit"
              form="edit-purchase-form"
              className="btn btn-premium btn-sm"
              disabled={saving}
            >
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </>
        }
      >
        {editingPurchase ? (
          <form id="edit-purchase-form" className="premium-form" onSubmit={handleUpdatePurchase}>
            <div className="mb-3">
              <label className="form-label">Purchase date</label>
              <input
                type="date"
                className="form-control"
                value={editPurchaseForm.purchase_date}
                onChange={(e) => setEditPurchaseForm({ ...editPurchaseForm, purchase_date: e.target.value })}
                required
              />
            </div>
            <div className="mb-3">
              <label className="form-label">Supplier</label>
              <select
                className="form-select"
                value={editPurchaseForm.supplier_id}
                onChange={(e) => setEditPurchaseForm({ ...editPurchaseForm, supplier_id: e.target.value })}
              >
                <option value="">None</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="mb-3">
              <label className="form-label">Notes</label>
              <input
                className="form-control"
                value={editPurchaseForm.notes}
                onChange={(e) => setEditPurchaseForm({ ...editPurchaseForm, notes: e.target.value })}
              />
            </div>
            <div className="mb-0">
              <label className="form-label">Lines (read-only)</label>
              <ul className="list-unstyled small mb-0 border rounded p-2 bg-light">
                {editingPurchase.lines.map((l, idx) => (
                  <li key={idx} className="py-1 border-bottom">
                    {l.item_name} × {l.quantity} @ {money(l.unit_cost)} = {money(l.line_total)}
                  </li>
                ))}
              </ul>
            </div>
          </form>
        ) : null}
      </PremiumModal>

      <PremiumModal
        open={Boolean(editingTransfer)}
        title={editingTransfer ? `Edit ${editingTransfer.reference}` : 'Edit transfer'}
        onClose={() => setEditingTransfer(null)}
        footer={
          <>
            <button
              type="button"
              className="btn btn-outline-secondary btn-sm"
              onClick={() => setEditingTransfer(null)}
            >
              Cancel
            </button>
            <button
              type="submit"
              form="edit-transfer-form"
              className="btn btn-premium btn-sm"
              disabled={saving}
            >
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </>
        }
      >
        {editingTransfer ? (
          <form id="edit-transfer-form" className="premium-form" onSubmit={handleUpdateTransfer}>
            <div className="mb-3">
              <label className="form-label">Transfer date</label>
              <input
                type="date"
                className="form-control"
                value={editTransferForm.transfer_date}
                onChange={(e) => setEditTransferForm({ ...editTransferForm, transfer_date: e.target.value })}
                required
              />
            </div>
            <div className="mb-3">
              <label className="form-label">Notes</label>
              <input
                className="form-control"
                value={editTransferForm.notes}
                onChange={(e) => setEditTransferForm({ ...editTransferForm, notes: e.target.value })}
              />
            </div>
            <div className="mb-0">
              <label className="form-label">Lines (read-only)</label>
              <p className="small text-muted mb-1">
                {editingTransfer.from_location_name} → {editingTransfer.to_location_name}
              </p>
              <ul className="list-unstyled small mb-0 border rounded p-2 bg-light">
                {editingTransfer.lines.map((l, idx) => (
                  <li key={idx} className="py-1 border-bottom">
                    {l.item_name} × {l.quantity}
                  </li>
                ))}
              </ul>
            </div>
          </form>
        ) : null}
      </PremiumModal>

      <PremiumModal
        open={Boolean(editingUsage)}
        title={editingUsage ? `Edit usage — ${editingUsage.item_name}` : 'Edit usage log'}
        onClose={() => setEditingUsage(null)}
        footer={
          <>
            <button
              type="button"
              className="btn btn-outline-secondary btn-sm"
              onClick={() => setEditingUsage(null)}
            >
              Cancel
            </button>
            <button
              type="submit"
              form="edit-usage-form"
              className="btn btn-premium btn-sm"
              disabled={saving}
            >
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </>
        }
      >
        {editingUsage ? (
          <form id="edit-usage-form" className="premium-form" onSubmit={handleUpdateUsage}>
            <div className="mb-3">
              <label className="form-label">Usage date</label>
              <input
                type="date"
                className="form-control"
                value={editUsageForm.usage_date}
                onChange={(e) => setEditUsageForm({ ...editUsageForm, usage_date: e.target.value })}
                required
              />
            </div>
            <div className="mb-3">
              <label className="form-label">Quantity ({editingUsage.unit})</label>
              <input
                type="number"
                step="0.0001"
                className="form-control"
                value={editUsageForm.quantity}
                onChange={(e) => setEditUsageForm({ ...editUsageForm, quantity: e.target.value })}
                required
              />
            </div>
            <div className="mb-3">
              <label className="form-label">Notes</label>
              <input
                className="form-control"
                value={editUsageForm.notes}
                onChange={(e) => setEditUsageForm({ ...editUsageForm, notes: e.target.value })}
              />
            </div>
            <p className="small text-muted mb-0">
              Location: {editingUsage.location_name} · Item: {editingUsage.item_name}
            </p>
          </form>
        ) : null}
      </PremiumModal>

      <PremiumModal
        open={Boolean(editingConversion)}
        title="Edit unit conversion"
        onClose={() => setEditingConversion(null)}
        footer={
          <>
            <button
              type="button"
              className="btn btn-outline-secondary btn-sm"
              onClick={() => setEditingConversion(null)}
            >
              Cancel
            </button>
            <button
              type="submit"
              form="edit-conversion-form"
              className="btn btn-premium btn-sm"
              disabled={saving}
            >
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </>
        }
      >
        {editingConversion ? (
          <form id="edit-conversion-form" className="premium-form" onSubmit={handleUpdateConversion}>
            <div className="mb-3">
              <label className="form-label">Item</label>
              <select
                className="form-select"
                value={editConversionForm.item_id}
                onChange={(e) => setEditConversionForm({ ...editConversionForm, item_id: e.target.value })}
              >
                <option value="">Global (all items)</option>
                {items.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="row g-2 mb-3">
              <div className="col-6">
                <label className="form-label">From unit</label>
                <input
                  className="form-control"
                  value={editConversionForm.from_unit}
                  onChange={(e) => setEditConversionForm({ ...editConversionForm, from_unit: e.target.value })}
                  required
                />
              </div>
              <div className="col-6">
                <label className="form-label">To unit</label>
                <input
                  className="form-control"
                  value={editConversionForm.to_unit}
                  onChange={(e) => setEditConversionForm({ ...editConversionForm, to_unit: e.target.value })}
                  required
                />
              </div>
            </div>
            <div className="mb-0">
              <label className="form-label">Factor</label>
              <input
                type="number"
                step="0.000001"
                className="form-control"
                value={editConversionForm.factor}
                onChange={(e) => setEditConversionForm({ ...editConversionForm, factor: e.target.value })}
                required
              />
            </div>
          </form>
        ) : null}
      </PremiumModal>
    </PremiumPage>
  );
}
