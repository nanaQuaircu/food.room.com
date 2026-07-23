'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useToast } from '@/components/ui/ToastProvider';
import {
  PremiumPage,
  PageHeader,
  PremiumCard,
  PremiumTabs,
  LoadingState,
  EmptyState,
  StatusBadge,
} from '@/components/ui/premium';
import { fetchApi } from '@/lib/client/fetch-api';
import { formatDisplayDate } from '@/lib/dates/format-display-date';
import { formatReportNumber } from '@/lib/reports/document-layout';

function formatMoney(amount: number) {
  return formatReportNumber(amount);
}

function guestInitials(first: string, last: string) {
  return `${first.charAt(0) || ''}${last.charAt(0) || ''}`.toUpperCase() || '?';
}

function chargeCategoryIcon(category: string) {
  const icons: Record<string, string> = {
    room: 'ti-bed',
    food: 'ti-tools-kitchen-2',
    beverage: 'ti-glass',
    laundry: 'ti-shirt',
    misc: 'ti-dots',
    other: 'ti-receipt',
  };
  return icons[category] || 'ti-receipt';
}

function paymentMethodIcon(method: string) {
  if (method === 'paystack') return 'ti-credit-card';
  if (method === 'cash') return 'ti-cash';
  if (method === 'card') return 'ti-credit-card';
  if (method === 'mobile_money') return 'ti-device-mobile';
  if (method === 'bank_transfer') return 'ti-building-bank';
  return 'ti-receipt';
}

function suggestedPaymentAmount(balance: number) {
  const due = Number(balance);
  return due > 0 ? due.toFixed(2) : '';
}

type Folio = {
  id: number;
  reservation_id: number;
  status: string;
  balance: number;
  confirmation_code: string;
  reservation_status: string;
  first_name: string;
  last_name: string;
  room_number: string | null;
  email?: string | null;
};

type Charge = {
  id: number;
  description: string;
  category: string;
  amount: number;
  quantity: number;
  posted_at: string;
};

type Payment = {
  id: number;
  method: string;
  amount: number;
  reference: string | null;
  paid_at: string;
};

type FolioDetail = {
  folio: Folio;
  charges: Charge[];
  payments: Payment[];
  refunds?: Array<{
    id: number;
    amount: number;
    method: string;
    reason: string | null;
    processed_at: string;
    payment_id: number | null;
  }>;
  invoices?: Array<{
    id: number;
    invoice_number: string;
    total: number;
    status: string;
    issued_at: string;
  }>;
};

type TaxRate = {
  id: number;
  name: string;
  rate_percent: number;
  applies_to: string;
  is_inclusive: number;
  is_active: number;
};

type NightAuditPreview = {
  business_date: string;
  already_completed: boolean;
  to_post: number;
  posts: Array<{
    confirmation_code: string;
    guest_name: string;
    room_number: string | null;
    amount: number;
    already_posted: boolean;
  }>;
  exceptions: Array<{ code: string; message: string }>;
};

export default function BillingModule() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<'folios' | 'tax' | 'night_audit'>('folios');
  const [folios, setFolios] = useState<Folio[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<FolioDetail | null>(null);
  const [chargeForm, setChargeForm] = useState({ description: '', category: 'room', amount: '', quantity: '1' });
  const [paymentForm, setPaymentForm] = useState({ method: 'cash', amount: '', reference: '', email: '' });
  const [refundForm, setRefundForm] = useState({ amount: '', method: 'cash', reason: '', payment_id: '' });
  const [taxRates, setTaxRates] = useState<TaxRate[]>([]);
  const [taxForm, setTaxForm] = useState({ name: 'VAT', rate_percent: '12.5', applies_to: 'all' });
  const [auditDate, setAuditDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [auditPreview, setAuditPreview] = useState<NightAuditPreview | null>(null);
  const [paystackConfig, setPaystackConfig] = useState<{
    enabled: boolean;
    publicKey: string;
    mode: 'test' | 'live';
  } | null>(null);
  const [paystackScriptReady, setPaystackScriptReady] = useState(false);

  useEffect(() => {
    void fetchApi<{ enabled: boolean; publicKey: string; mode: 'test' | 'live' }>(
      '/api/payments/paystack/config'
    ).then((res) => {
      if (res.success && res.data) setPaystackConfig(res.data);
    });
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.PaystackPop) {
      setPaystackScriptReady(true);
      return;
    }
    const existing = document.querySelector('script[data-paystack-inline]');
    if (existing) {
      existing.addEventListener('load', () => setPaystackScriptReady(true));
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://js.paystack.co/v1/inline.js';
    script.async = true;
    script.dataset.paystackInline = 'true';
    script.onload = () => setPaystackScriptReady(true);
    document.body.appendChild(script);
  }, []);

  const loadFolios = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchApi<Folio[]>('/api/billing');
      if (!res.success) {
        toast.error('Failed to load folios', res.message);
        return;
      }
      setFolios(res.data ?? []);
    } catch {
      toast.error('Failed to load folios');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const loadDetail = useCallback(
    async (folioId: number) => {
      setDetailLoading(true);
      try {
        const res = await fetchApi<FolioDetail>(`/api/billing?folio_id=${folioId}`);
        if (!res.success) {
          toast.error('Failed to load folio', res.message);
          return;
        }
        setDetail(res.data ?? null);
        setSelectedId(folioId);
        const guestEmail = res.data?.folio?.email?.trim() ?? '';
        const balanceDue = Number(res.data?.folio?.balance ?? 0);
        setPaymentForm((prev) => ({
          ...prev,
          email: guestEmail,
          amount: suggestedPaymentAmount(balanceDue),
        }));
      } catch {
        toast.error('Failed to load folio');
      } finally {
        setDetailLoading(false);
      }
    },
    [toast]
  );

  useEffect(() => {
    void loadFolios();
  }, [loadFolios]);

  const loadTaxRates = useCallback(async () => {
    const res = await fetchApi<TaxRate[]>('/api/billing?view=tax_rates');
    if (res.success) setTaxRates(res.data ?? []);
  }, []);

  const loadNightAudit = useCallback(async (date: string) => {
    const res = await fetchApi<{ preview: NightAuditPreview }>(
      `/api/billing?view=night_audit&date=${encodeURIComponent(date)}`
    );
    if (res.success && res.data) setAuditPreview(res.data.preview);
  }, []);

  useEffect(() => {
    if (tab === 'tax') void loadTaxRates();
    if (tab === 'night_audit') void loadNightAudit(auditDate);
  }, [tab, auditDate, loadTaxRates, loadNightAudit]);

  async function handleAddCharge(e: FormEvent) {
    e.preventDefault();
    if (!selectedId) return;
    setSaving(true);
    try {
      const res = await fetchApi('/api/billing', {
        method: 'POST',
        body: JSON.stringify({
          type: 'charge',
          folio_id: selectedId,
          description: chargeForm.description,
          category: chargeForm.category,
          amount: Number(chargeForm.amount),
          quantity: Number(chargeForm.quantity),
        }),
      });
      if (!res.success) {
        toast.error('Failed to add charge', res.message);
        return;
      }
      toast.success('Charge added');
      setChargeForm({ description: '', category: 'room', amount: '', quantity: '1' });
      await loadDetail(selectedId);
      await loadFolios();
    } catch {
      toast.error('Failed to add charge');
    } finally {
      setSaving(false);
    }
  }

  async function submitPayment(paystackReference?: string) {
    if (!selectedId) return;
    setSaving(true);
    try {
      const res = await fetchApi('/api/billing', {
        method: 'POST',
        body: JSON.stringify({
          type: 'payment',
          folio_id: selectedId,
          method: paymentForm.method,
          amount: Number(paymentForm.amount),
          reference: paystackReference || paymentForm.reference || undefined,
        }),
      });
      if (!res.success) {
        toast.error('Failed to add payment', res.message);
        return;
      }
      toast.success('Payment recorded');
      setPaymentForm((prev) => ({ ...prev, reference: '' }));
      await loadDetail(selectedId);
      await loadFolios();
    } catch {
      toast.error('Failed to add payment');
    } finally {
      setSaving(false);
    }
  }

  async function handleAddPayment(e: FormEvent) {
    e.preventDefault();
    if (!selectedId) return;

    if (paymentForm.method === 'paystack') {
      if (!paystackConfig?.enabled) {
        toast.warning('Paystack unavailable', 'Enable Paystack in Settings → Integrations.');
        return;
      }
      if (!paystackScriptReady || !window.PaystackPop) {
        toast.error('Paystack is still loading', 'Please wait a moment and try again.');
        return;
      }

      const email = paymentForm.email.trim();
      if (!email) {
        toast.error('Email required', 'Guest email is required for Paystack payments.');
        return;
      }

      const amount = Number(paymentForm.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        toast.error('Invalid amount', 'Enter a valid payment amount.');
        return;
      }

      setSaving(true);
      try {
        const initRes = await fetchApi<{
          reference: string;
          public_key: string;
          amount: number;
          email: string;
        }>('/api/payments/paystack/initialize', {
          method: 'POST',
          body: JSON.stringify({
            email,
            amount,
            source: 'billing',
            folio_id: selectedId,
          }),
        });

        if (!initRes.success || !initRes.data) {
          toast.error('Paystack failed', initRes.message);
          setSaving(false);
          return;
        }

        const { reference, public_key } = initRes.data;
        window.PaystackPop.setup({
          key: public_key,
          email,
          amount: Math.round(amount * 100),
          ref: reference,
          currency: 'GHS',
          onClose: () => setSaving(false),
          callback: (response) => {
            void submitPayment(response.reference);
          },
        }).openIframe();
      } catch {
        toast.error('Paystack failed', 'Could not start payment.');
        setSaving(false);
      }
      return;
    }

    await submitPayment();
  }

  async function handleRefund(e: FormEvent) {
    e.preventDefault();
    if (!selectedId) return;
    setSaving(true);
    try {
      const res = await fetchApi('/api/billing', {
        method: 'POST',
        body: JSON.stringify({
          type: 'refund',
          folio_id: selectedId,
          amount: Number(refundForm.amount),
          method: refundForm.method,
          reason: refundForm.reason || undefined,
          payment_id: refundForm.payment_id ? Number(refundForm.payment_id) : undefined,
        }),
      });
      if (!res.success) {
        toast.error('Refund failed', res.message);
        return;
      }
      toast.success('Refund processed');
      setRefundForm({ amount: '', method: 'cash', reason: '', payment_id: '' });
      await loadDetail(selectedId);
      await loadFolios();
    } catch {
      toast.error('Refund failed');
    } finally {
      setSaving(false);
    }
  }

  async function handleGenerateInvoice() {
    if (!selectedId) return;
    setSaving(true);
    try {
      const res = await fetchApi<{
        invoice: {
          invoice_number: string;
          subtotal: number;
          tax_total: number;
          total: number;
          paid_total: number;
          first_name: string;
          last_name: string;
          confirmation_code: string;
          property_name: string;
          currency: string;
        };
        lines: Array<{ description: string; quantity: number; unit_amount: number; line_total: number; category: string }>;
      }>('/api/billing', {
        method: 'POST',
        body: JSON.stringify({ type: 'invoice', folio_id: selectedId }),
      });
      if (!res.success || !res.data) {
        toast.error('Invoice failed', res.message);
        return;
      }
      const { invoice, lines } = res.data;
      const { jsPDF } = await import('jspdf');
      const autoTable = (await import('jspdf-autotable')).default;
      const doc = new jsPDF({ unit: 'pt', format: 'a4' });
      doc.setFontSize(16);
      doc.text(invoice.property_name || 'Invoice', 40, 48);
      doc.setFontSize(11);
      doc.text(`Invoice ${invoice.invoice_number}`, 40, 70);
      doc.text(`Guest: ${invoice.first_name} ${invoice.last_name}`, 40, 88);
      doc.text(`Confirmation: ${invoice.confirmation_code}`, 40, 106);
      autoTable(doc, {
        startY: 124,
        head: [['Description', 'Qty', 'Amount', 'Total']],
        body: lines.map((l) => [
          l.description,
          String(l.quantity),
          Number(l.unit_amount).toFixed(2),
          Number(l.line_total).toFixed(2),
        ]),
      });
      const finalY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 200;
      doc.text(`Subtotal: ${Number(invoice.subtotal).toFixed(2)}`, 40, finalY + 24);
      doc.text(`Tax: ${Number(invoice.tax_total).toFixed(2)}`, 40, finalY + 42);
      doc.text(`Total: ${Number(invoice.total).toFixed(2)} ${invoice.currency || 'GHS'}`, 40, finalY + 60);
      doc.text(`Paid: ${Number(invoice.paid_total).toFixed(2)}`, 40, finalY + 78);
      doc.save(`${invoice.invoice_number}.pdf`);
      toast.success('Invoice generated');
      await loadDetail(selectedId);
    } catch {
      toast.error('Invoice failed');
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveTax(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetchApi('/api/billing', {
        method: 'POST',
        body: JSON.stringify({
          type: 'tax_rate',
          name: taxForm.name,
          rate_percent: Number(taxForm.rate_percent),
          applies_to: taxForm.applies_to,
        }),
      });
      if (!res.success) {
        toast.error('Could not save tax rate', res.message);
        return;
      }
      toast.success('Tax rate saved');
      setTaxForm({ name: 'VAT', rate_percent: '12.5', applies_to: 'all' });
      await loadTaxRates();
    } catch {
      toast.error('Could not save tax rate');
    } finally {
      setSaving(false);
    }
  }

  async function handleRunNightAudit() {
    setSaving(true);
    try {
      const res = await fetchApi('/api/billing', {
        method: 'POST',
        body: JSON.stringify({ type: 'night_audit_run', business_date: auditDate }),
      });
      if (!res.success) {
        toast.error('Night audit failed', res.message);
        return;
      }
      toast.success('Night audit completed');
      await loadNightAudit(auditDate);
      await loadFolios();
    } catch {
      toast.error('Night audit failed');
    } finally {
      setSaving(false);
    }
  }

  const selectedFolio = folios.find((f) => f.id === selectedId);

  const folioTotals = useMemo(() => {
    if (!detail) return null;
    const chargesTotal = detail.charges.reduce(
      (sum, c) => sum + Number(c.amount) * Number(c.quantity),
      0
    );
    const paymentsTotal = detail.payments.reduce((sum, p) => sum + Number(p.amount), 0);
    const balance = Number(detail.folio.balance ?? 0);
    return { chargesTotal, paymentsTotal, balance };
  }, [detail]);

  return (
    <PremiumPage>
      <PageHeader
        title="Billing"
        subtitle="Folios, tax, invoices, refunds, and night audit."
        icon="ti-receipt"
      />

      <PremiumTabs
        tabs={[
          { id: 'folios', label: 'Folios' },
          { id: 'tax', label: 'Tax rates' },
          { id: 'night_audit', label: 'Night audit' },
        ]}
        active={tab}
        onChange={(id) => setTab(id as typeof tab)}
      />

      {tab === 'tax' ? (
        <div className="row g-3">
          <div className="col-md-5">
            <PremiumCard title="Add tax rate">
              <form className="premium-form" onSubmit={handleSaveTax}>
                <div className="mb-2">
                  <input
                    className="form-control"
                    value={taxForm.name}
                    onChange={(e) => setTaxForm({ ...taxForm, name: e.target.value })}
                    placeholder="Tax name"
                    required
                  />
                </div>
                <div className="mb-2">
                  <input
                    type="number"
                    step="0.01"
                    className="form-control"
                    value={taxForm.rate_percent}
                    onChange={(e) => setTaxForm({ ...taxForm, rate_percent: e.target.value })}
                    placeholder="Rate %"
                    required
                  />
                </div>
                <div className="mb-3">
                  <select
                    className="form-select"
                    value={taxForm.applies_to}
                    onChange={(e) => setTaxForm({ ...taxForm, applies_to: e.target.value })}
                  >
                    <option value="all">All charges</option>
                    <option value="room">Room only</option>
                    <option value="service">Services only</option>
                  </select>
                </div>
                <button className="btn btn-primary" type="submit" disabled={saving}>
                  Save tax rate
                </button>
              </form>
            </PremiumCard>
          </div>
          <div className="col-md-7">
            <PremiumCard title="Active tax rates" flush>
              {taxRates.length === 0 ? (
                <EmptyState message="No tax rates configured." icon="ti-percentage" />
              ) : (
                <div className="table-responsive">
                  <table className="table premium-table mb-0">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Rate</th>
                        <th>Applies</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {taxRates.map((t) => (
                        <tr key={t.id}>
                          <td>{t.name}</td>
                          <td>{Number(t.rate_percent).toFixed(2)}%</td>
                          <td className="text-capitalize">{t.applies_to}</td>
                          <td className="text-end">
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-danger"
                              disabled={saving}
                              onClick={async () => {
                                setSaving(true);
                                const res = await fetchApi('/api/billing', {
                                  method: 'POST',
                                  body: JSON.stringify({ type: 'tax_rate_delete', id: t.id }),
                                });
                                setSaving(false);
                                if (!res.success) {
                                  toast.error('Delete failed', res.message);
                                  return;
                                }
                                toast.success('Tax rate removed');
                                await loadTaxRates();
                              }}
                            >
                              Remove
                            </button>
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
      ) : null}

      {tab === 'night_audit' ? (
        <div className="row g-3">
          <div className="col-lg-4">
            <PremiumCard title="Run night audit">
              <div className="mb-3">
                <label className="form-label">Business date</label>
                <input
                  type="date"
                  className="form-control"
                  value={auditDate}
                  onChange={(e) => setAuditDate(e.target.value)}
                />
              </div>
              <button
                type="button"
                className="btn btn-outline-secondary me-2"
                onClick={() => void loadNightAudit(auditDate)}
                disabled={saving}
              >
                Preview
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => void handleRunNightAudit()}
                disabled={saving || auditPreview?.already_completed}
              >
                Post room nights
              </button>
            </PremiumCard>
          </div>
          <div className="col-lg-8">
            <PremiumCard title="Preview">
              {!auditPreview ? (
                <EmptyState message="Load a preview for the selected date." icon="ti-moon-stars" />
              ) : (
                <>
                  <p className="small text-muted mb-2">
                    {auditPreview.already_completed
                      ? 'Already completed for this date.'
                      : `${auditPreview.to_post} room night(s) ready to post.`}
                  </p>
                  {auditPreview.exceptions.length > 0 ? (
                    <div className="alert alert-warning py-2">
                      {auditPreview.exceptions.map((ex) => (
                        <div key={ex.code}>
                          <code>{ex.code}</code>: {ex.message}
                        </div>
                      ))}
                    </div>
                  ) : null}
                  <div className="table-responsive">
                    <table className="table premium-table mb-0">
                      <thead>
                        <tr>
                          <th>Guest</th>
                          <th>Room</th>
                          <th>Rate</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {auditPreview.posts.map((p) => (
                          <tr key={p.confirmation_code}>
                            <td>
                              {p.guest_name}
                              <br />
                              <small>
                                <code>{p.confirmation_code}</code>
                              </small>
                            </td>
                            <td>{p.room_number || '—'}</td>
                            <td>{Number(p.amount).toFixed(2)}</td>
                            <td>{p.already_posted ? 'Posted' : 'Pending'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </PremiumCard>
          </div>
        </div>
      ) : null}

      {tab === 'folios' ? (
      <div className="row g-3">
        <div className="col-lg-5">
          <PremiumCard title="Folios" flush>
            {loading ? (
              <LoadingState label="Loading folios…" />
            ) : folios.length === 0 ? (
              <EmptyState message="No folios." icon="ti-receipt" />
            ) : (
              <div className="table-responsive folios-table-scroll">
                <table className="table premium-table mb-0 table-hover">
                  <thead>
                    <tr>
                      <th>Guest</th>
                      <th>Room</th>
                      <th>Balance</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {folios.map((f) => (
                      <tr
                        key={f.id}
                        role="button"
                        className={selectedId === f.id ? 'table-active' : ''}
                        onClick={() => void loadDetail(f.id)}
                      >
                        <td>
                          {f.first_name} {f.last_name}
                          <br />
                          <small className="text-muted">
                            <code>{f.confirmation_code}</code>
                          </small>
                        </td>
                        <td>{f.room_number || '—'}</td>
                        <td className={Number(f.balance) > 0 ? 'text-danger fw-medium' : 'text-success'}>
                          {Number(f.balance).toFixed(2)}
                        </td>
                        <td>
                          <StatusBadge status={f.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </PremiumCard>
        </div>

        <div className="col-lg-7">
          {!selectedId ? (
            <PremiumCard>
              <EmptyState message="Select a folio to view charges and payments." icon="ti-click" />
            </PremiumCard>
          ) : detailLoading ? (
            <PremiumCard>
              <LoadingState label="Loading folio…" />
            </PremiumCard>
          ) : (
            <>
              <PremiumCard className="folio-detail-card">
                <div className="folio-detail-card__hero">
                  <div className="folio-detail-card__guest">
                    <div className="folio-detail-card__avatar" aria-hidden="true">
                      {guestInitials(detail!.folio.first_name, detail!.folio.last_name)}
                    </div>
                    <div>
                      <h2 className="folio-detail-card__name">
                        {detail?.folio.first_name} {detail?.folio.last_name}
                      </h2>
                      <div className="folio-detail-card__meta">
                        <code>{detail?.folio.confirmation_code}</code>
                        {selectedFolio?.room_number ? (
                          <span className="folio-detail-card__meta-item">
                            <i className="ti ti-door" aria-hidden="true" />
                            Room {selectedFolio.room_number}
                          </span>
                        ) : null}
                        <span className="folio-detail-card__status">
                          <StatusBadge status={detail?.folio.status ?? 'open'} />
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {folioTotals ? (
                  <div className="folio-detail-card__stats">
                    <div className="folio-detail-stat">
                      <span className="folio-detail-stat__label">Total charges</span>
                      <span className="folio-detail-stat__value">
                        {formatMoney(folioTotals.chargesTotal)}
                        <span className="folio-detail-stat__unit">GHS</span>
                      </span>
                    </div>
                    <div className="folio-detail-stat folio-detail-stat--paid">
                      <span className="folio-detail-stat__label">Total paid</span>
                      <span className="folio-detail-stat__value">
                        {formatMoney(folioTotals.paymentsTotal)}
                        <span className="folio-detail-stat__unit">GHS</span>
                      </span>
                    </div>
                    <div
                      className={`folio-detail-stat folio-detail-stat--balance${
                        folioTotals.balance <= 0 ? ' folio-detail-stat--settled' : ''
                      }`}
                    >
                      <span className="folio-detail-stat__label">Balance due</span>
                      <span className="folio-detail-stat__value">
                        {formatMoney(Math.max(0, folioTotals.balance))}
                        <span className="folio-detail-stat__unit">GHS</span>
                      </span>
                    </div>
                  </div>
                ) : null}

                <div className="folio-detail-card__body">
                  <section className="folio-detail-section" aria-label="Charges">
                    <div className="folio-detail-section__head">
                      <h3 className="folio-detail-section__title">
                        <i className="ti ti-receipt" aria-hidden="true" />
                        Charges
                      </h3>
                      <span className="folio-detail-section__count">
                        {(detail?.charges ?? []).length} item
                        {(detail?.charges ?? []).length === 1 ? '' : 's'}
                      </span>
                    </div>
                    {(detail?.charges ?? []).length === 0 ? (
                      <div className="folio-detail-empty">
                        <i className="ti ti-receipt-off" aria-hidden="true" />
                        No charges posted yet.
                      </div>
                    ) : (
                      <ul className="folio-ledger">
                        {detail?.charges.map((c) => {
                          const lineTotal = Number(c.amount) * Number(c.quantity);
                          const isCredit = lineTotal < 0;
                          return (
                            <li key={c.id} className="folio-ledger__item">
                              <div
                                className={`folio-ledger__icon${isCredit ? ' folio-ledger__icon--refund' : ''}`}
                                aria-hidden="true"
                              >
                                <i className={`ti ${chargeCategoryIcon(c.category)}`} />
                              </div>
                              <div className="folio-ledger__main">
                                <div className="folio-ledger__row">
                                  <div>
                                    <p className="folio-ledger__desc">{c.description}</p>
                                    <div className="folio-ledger__sub">
                                      <span className="folio-ledger__badge">{c.category}</span>
                                      <span>
                                        {Number(c.quantity) === 1
                                          ? '1 unit'
                                          : `${formatReportNumber(Number(c.quantity), 0)} × ${formatMoney(Number(c.amount))}`}
                                      </span>
                                      {c.posted_at ? (
                                        <span>{formatDisplayDate(c.posted_at)}</span>
                                      ) : null}
                                    </div>
                                  </div>
                                  <span
                                    className={`folio-ledger__amount${
                                      isCredit ? ' folio-ledger__amount--credit' : ' folio-ledger__amount--charge'
                                    }`}
                                  >
                                    {isCredit ? '−' : '+'}
                                    {formatMoney(Math.abs(lineTotal))}
                                  </span>
                                </div>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </section>

                  <section className="folio-detail-section" aria-label="Payments">
                    <div className="folio-detail-section__head">
                      <h3 className="folio-detail-section__title">
                        <i className="ti ti-cash" aria-hidden="true" />
                        Payments
                      </h3>
                      <span className="folio-detail-section__count">
                        {(detail?.payments ?? []).length} payment
                        {(detail?.payments ?? []).length === 1 ? '' : 's'}
                      </span>
                    </div>
                    {(detail?.payments ?? []).length === 0 ? (
                      <div className="folio-detail-empty">
                        <i className="ti ti-wallet-off" aria-hidden="true" />
                        No payments recorded yet.
                      </div>
                    ) : (
                      <ul className="folio-ledger">
                        {detail?.payments.map((p) => (
                          <li key={p.id} className="folio-ledger__item">
                            <div className="folio-ledger__icon folio-ledger__icon--payment" aria-hidden="true">
                              <i className={`ti ${paymentMethodIcon(p.method)}`} />
                            </div>
                            <div className="folio-ledger__main">
                              <div className="folio-ledger__row">
                                <div>
                                  <p className="folio-ledger__desc text-capitalize">{p.method}</p>
                                  <div className="folio-ledger__sub">
                                    {p.reference ? (
                                      <span>
                                        Ref: <code>{p.reference}</code>
                                      </span>
                                    ) : (
                                      <span>No reference</span>
                                    )}
                                    {p.paid_at ? (
                                      <span>{formatDisplayDate(p.paid_at)}</span>
                                    ) : null}
                                  </div>
                                </div>
                                <span className="folio-ledger__amount folio-ledger__amount--payment">
                                  −{formatMoney(Number(p.amount))}
                                </span>
                              </div>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                </div>
              </PremiumCard>

              <div className="row g-3">
                <div className="col-md-6">
                  <PremiumCard title="Add Charge">
                    <form className="premium-form" onSubmit={handleAddCharge}>
                      <div className="mb-2">
                        <input
                          className="form-control form-control-sm"
                          placeholder="Description"
                          value={chargeForm.description}
                          onChange={(e) => setChargeForm({ ...chargeForm, description: e.target.value })}
                          required
                        />
                      </div>
                      <div className="mb-2">
                        <select
                          className="form-select form-select-sm"
                          value={chargeForm.category}
                          onChange={(e) => setChargeForm({ ...chargeForm, category: e.target.value })}
                        >
                          <option value="room">Room</option>
                          <option value="food">Food</option>
                          <option value="beverage">Beverage</option>
                          <option value="laundry">Laundry</option>
                          <option value="service">Service</option>
                          <option value="minibar">Minibar</option>
                          <option value="restaurant">Restaurant</option>
                          <option value="misc">Misc</option>
                          <option value="other">Other</option>
                          <option value="tax">Tax (manual)</option>
                        </select>
                      </div>
                      <div className="row g-2 mb-2">
                        <div className="col-6">
                          <input
                            type="number"
                            step="0.01"
                            className="form-control form-control-sm"
                            placeholder="Amount"
                            value={chargeForm.amount}
                            onChange={(e) => setChargeForm({ ...chargeForm, amount: e.target.value })}
                            required
                          />
                        </div>
                        <div className="col-6">
                          <input
                            type="number"
                            className="form-control form-control-sm"
                            placeholder="Qty"
                            value={chargeForm.quantity}
                            onChange={(e) => setChargeForm({ ...chargeForm, quantity: e.target.value })}
                          />
                        </div>
                      </div>
                      <button type="submit" className="btn btn-premium btn-sm" disabled={saving}>
                        Add Charge
                      </button>
                    </form>
                  </PremiumCard>
                </div>
                <div className="col-md-6">
                  <PremiumCard title="Add Payment">
                    <form className="premium-form" onSubmit={handleAddPayment}>
                      <div className="mb-2">
                        <select
                          className="form-select form-select-sm"
                          value={paymentForm.method}
                          onChange={(e) => setPaymentForm({ ...paymentForm, method: e.target.value })}
                        >
                          <option value="cash">Cash</option>
                          <option value="card">Card</option>
                          <option value="mobile_money">Mobile money</option>
                          <option value="bank_transfer">Bank transfer</option>
                          {paystackConfig?.enabled ? (
                            <option value="paystack">Paystack</option>
                          ) : null}
                        </select>
                      </div>
                      {paymentForm.method === 'paystack' ? (
                        <div className="mb-2">
                          <input
                            type="email"
                            className="form-control form-control-sm"
                            placeholder="Guest email"
                            value={paymentForm.email}
                            onChange={(e) => setPaymentForm({ ...paymentForm, email: e.target.value })}
                            required
                          />
                          <small className="text-muted">
                            Opens the Paystack payment window.
                          </small>
                        </div>
                      ) : (
                        <div className="mb-2">
                          <input
                            className="form-control form-control-sm"
                            placeholder="Reference (optional)"
                            value={paymentForm.reference}
                            onChange={(e) => setPaymentForm({ ...paymentForm, reference: e.target.value })}
                          />
                        </div>
                      )}
                      <div className="mb-2">
                        <input
                          type="number"
                          step="0.01"
                          className="form-control form-control-sm"
                          placeholder="Amount"
                          value={paymentForm.amount}
                          onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })}
                          required
                        />
                        {folioTotals && folioTotals.balance > 0 ? (
                          <small className="text-muted">
                            Pre-filled with balance due ({formatMoney(folioTotals.balance)} GHS). Edit for a partial payment.
                          </small>
                        ) : null}
                      </div>
                      <button type="submit" className="btn btn-premium btn-sm" disabled={saving}>
                        {paymentForm.method === 'paystack' ? 'Pay with Paystack' : 'Record Payment'}
                      </button>
                    </form>
                  </PremiumCard>
                </div>
                <div className="col-md-6">
                  <PremiumCard title="Refund">
                    <form className="premium-form" onSubmit={handleRefund}>
                      <div className="mb-2">
                        <select
                          className="form-select form-select-sm"
                          value={refundForm.payment_id}
                          onChange={(e) => setRefundForm({ ...refundForm, payment_id: e.target.value })}
                        >
                          <option value="">Any / unlinked</option>
                          {(detail?.payments ?? []).map((p) => (
                            <option key={p.id} value={p.id}>
                              #{p.id} {p.method} — {Number(p.amount).toFixed(2)}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="mb-2">
                        <select
                          className="form-select form-select-sm"
                          value={refundForm.method}
                          onChange={(e) => setRefundForm({ ...refundForm, method: e.target.value })}
                        >
                          <option value="cash">Cash</option>
                          <option value="card">Card</option>
                          <option value="mobile_money">Mobile money</option>
                          <option value="bank_transfer">Bank transfer</option>
                        </select>
                      </div>
                      <div className="mb-2">
                        <input
                          type="number"
                          step="0.01"
                          className="form-control form-control-sm"
                          placeholder="Amount"
                          value={refundForm.amount}
                          onChange={(e) => setRefundForm({ ...refundForm, amount: e.target.value })}
                          required
                        />
                      </div>
                      <div className="mb-2">
                        <input
                          className="form-control form-control-sm"
                          placeholder="Reason"
                          value={refundForm.reason}
                          onChange={(e) => setRefundForm({ ...refundForm, reason: e.target.value })}
                        />
                      </div>
                      <button type="submit" className="btn btn-outline-danger btn-sm" disabled={saving}>
                        Process refund
                      </button>
                    </form>
                  </PremiumCard>
                </div>
                <div className="col-md-6">
                  <PremiumCard title="Invoice">
                    <p className="small text-muted">Generate a PDF invoice from this folio&apos;s charges.</p>
                    <button
                      type="button"
                      className="btn btn-premium btn-sm"
                      disabled={saving}
                      onClick={() => void handleGenerateInvoice()}
                    >
                      Generate invoice PDF
                    </button>
                    {(detail?.invoices?.length ?? 0) > 0 ? (
                      <ul className="mt-3 mb-0 small">
                        {detail?.invoices?.map((inv) => (
                          <li key={inv.id}>
                            <code>{inv.invoice_number}</code> — {Number(inv.total).toFixed(2)} ({inv.status})
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </PremiumCard>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
      ) : null}
    </PremiumPage>
  );
}
