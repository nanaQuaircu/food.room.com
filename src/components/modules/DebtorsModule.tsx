'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
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
import TablePagination, { paginateSlice } from '@/components/ui/TablePagination';

function formatMoney(amount: number) {
  return formatReportNumber(Number(amount) || 0);
}

type CorporateAccount = {
  id: number;
  name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  credit_limit: number;
  notes: string | null;
  is_active: number;
};

type LedgerRow = {
  reservation_id: number;
  confirmation_code: string;
  reservation_status: string;
  check_in_date: string;
  check_out_date: string;
  folio_id: number;
  folio_status: string;
  first_name: string;
  last_name: string;
  corporate_account_id: number | null;
  company_name: string | null;
  owed: number;
  paid: number;
  balance: number;
  status: 'Outstanding' | 'Partial' | 'Paid';
};

type PaymentRow = {
  id: number;
  folio_id: number;
  method: string;
  amount: number;
  reference: string | null;
  paid_at: string;
  confirmation_code: string;
  first_name: string;
  last_name: string;
  company_name: string | null;
};

type SummaryRow = {
  id: number;
  name: string;
  bookings: number;
  owed: number;
  paid: number;
  balance: number;
};

type TabId = 'ledger' | 'payments' | 'companies' | 'summary';

const STATUS_TONE: Record<string, string> = {
  Outstanding: 'danger',
  Partial: 'warning',
  Paid: 'success',
};

const PAGE_SIZE = 10;

function DebtorStatusBadge({ status }: { status: string }) {
  const tone = STATUS_TONE[status] || 'muted';
  return <span className={`premium-badge premium-badge--${tone}`}>{status}</span>;
}

export default function DebtorsModule() {
  const toast = useToast();
  const [tab, setTab] = useState<TabId>('ledger');
  const [saving, setSaving] = useState(false);

  const [ledgerLoading, setLedgerLoading] = useState(true);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [ledgerStatusFilter, setLedgerStatusFilter] = useState<string>('');
  const [ledgerCompanyFilter, setLedgerCompanyFilter] = useState<string>('');

  const [paymentsLoading, setPaymentsLoading] = useState(true);
  const [payments, setPayments] = useState<PaymentRow[]>([]);

  const [accountsLoading, setAccountsLoading] = useState(true);
  const [accounts, setAccounts] = useState<CorporateAccount[]>([]);
  const [accountForm, setAccountForm] = useState({
    name: '',
    contact_name: '',
    email: '',
    phone: '',
    credit_limit: '',
    notes: '',
  });

  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summary, setSummary] = useState<SummaryRow[]>([]);

  const [paymentForm, setPaymentForm] = useState({ folio_id: '', method: 'cash', amount: '', reference: '' });
  const [importing, setImporting] = useState(false);
  const [ledgerPage, setLedgerPage] = useState(1);
  const [paymentsPage, setPaymentsPage] = useState(1);
  const [companiesPage, setCompaniesPage] = useState(1);
  const [summaryPage, setSummaryPage] = useState(1);

  const loadLedger = useCallback(async () => {
    setLedgerLoading(true);
    try {
      const res = await fetchApi<LedgerRow[]>('/api/debtors?action=ledger');
      if (!res.success) {
        toast.error('Failed to load master ledger', res.message);
        return;
      }
      setLedger(res.data ?? []);
    } catch {
      toast.error('Failed to load master ledger');
    } finally {
      setLedgerLoading(false);
    }
  }, [toast]);

  const loadPayments = useCallback(async () => {
    setPaymentsLoading(true);
    try {
      const res = await fetchApi<PaymentRow[]>('/api/debtors?action=payments');
      if (!res.success) {
        toast.error('Failed to load payment log', res.message);
        return;
      }
      setPayments(res.data ?? []);
    } catch {
      toast.error('Failed to load payment log');
    } finally {
      setPaymentsLoading(false);
    }
  }, [toast]);

  const loadAccounts = useCallback(async () => {
    setAccountsLoading(true);
    try {
      const res = await fetchApi<CorporateAccount[]>('/api/debtors?action=accounts');
      if (!res.success) {
        toast.error('Failed to load companies', res.message);
        return;
      }
      setAccounts(res.data ?? []);
    } catch {
      toast.error('Failed to load companies');
    } finally {
      setAccountsLoading(false);
    }
  }, [toast]);

  const loadSummary = useCallback(async () => {
    setSummaryLoading(true);
    try {
      const res = await fetchApi<SummaryRow[]>('/api/debtors?action=summary');
      if (!res.success) {
        toast.error('Failed to load company summary', res.message);
        return;
      }
      setSummary(res.data ?? []);
    } catch {
      toast.error('Failed to load company summary');
    } finally {
      setSummaryLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void loadLedger();
    void loadAccounts();
  }, [loadLedger, loadAccounts]);

  useEffect(() => {
    if (tab === 'payments') void loadPayments();
    if (tab === 'summary') void loadSummary();
  }, [tab, loadPayments, loadSummary]);

  async function handleCreateAccount(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetchApi('/api/debtors', {
        method: 'POST',
        body: JSON.stringify({
          action: 'account',
          name: accountForm.name,
          contact_name: accountForm.contact_name || undefined,
          email: accountForm.email || undefined,
          phone: accountForm.phone || undefined,
          credit_limit: accountForm.credit_limit ? Number(accountForm.credit_limit) : undefined,
          notes: accountForm.notes || undefined,
        }),
      });
      if (!res.success) {
        toast.error('Failed to add company', res.message);
        return;
      }
      toast.success('Company added');
      setAccountForm({ name: '', contact_name: '', email: '', phone: '', credit_limit: '', notes: '' });
      await loadAccounts();
    } catch {
      toast.error('Failed to add company');
    } finally {
      setSaving(false);
    }
  }

  async function toggleAccountActive(account: CorporateAccount) {
    setSaving(true);
    try {
      const res = await fetchApi('/api/debtors', {
        method: 'POST',
        body: JSON.stringify({ action: 'account', id: account.id, is_active: account.is_active ? 0 : 1 }),
      });
      if (!res.success) {
        toast.error('Failed to update company', res.message);
        return;
      }
      toast.success(account.is_active ? 'Company deactivated' : 'Company activated');
      await loadAccounts();
    } catch {
      toast.error('Failed to update company');
    } finally {
      setSaving(false);
    }
  }

  async function handleRecordPayment(e: FormEvent) {
    e.preventDefault();
    const folioId = Number(paymentForm.folio_id);
    const amount = Number(paymentForm.amount);
    if (!folioId) {
      toast.warning('Select a debtor folio to pay against');
      return;
    }
    if (!amount || Number.isNaN(amount) || amount <= 0) {
      toast.warning('Enter a valid payment amount');
      return;
    }
    setSaving(true);
    try {
      const res = await fetchApi('/api/debtors', {
        method: 'POST',
        body: JSON.stringify({
          action: 'payment',
          folio_id: folioId,
          method: paymentForm.method,
          amount,
          reference: paymentForm.reference || undefined,
        }),
      });
      if (!res.success) {
        toast.error('Failed to record payment', res.message);
        return;
      }
      toast.success('Payment recorded');
      setPaymentForm({ folio_id: '', method: 'cash', amount: '', reference: '' });
      await Promise.all([loadPayments(), loadLedger()]);
    } catch {
      toast.error('Failed to record payment');
    } finally {
      setSaving(false);
    }
  }

  async function handleImportExcel(file: File | null) {
    if (!file) return;
    setImporting(true);
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
      const sheetName =
        workbook.SheetNames.find((n) => /master\s*ledger/i.test(n)) ||
        workbook.SheetNames.find((n) => /ledger/i.test(n)) ||
        workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) {
        toast.error('No sheet found in workbook');
        return;
      }

      const matrix = XLSX.utils.sheet_to_json<(string | number | Date | null)[]>(sheet, {
        header: 1,
        defval: null,
        raw: false,
      });

      let headerIdx = -1;
      for (let i = 0; i < Math.min(matrix.length, 20); i += 1) {
        const row = matrix[i] || [];
        const joined = row.map((c) => String(c || '').toLowerCase()).join('|');
        if (joined.includes('booking') && joined.includes('guest') && joined.includes('company')) {
          headerIdx = i;
          break;
        }
      }
      if (headerIdx < 0) {
        toast.error('Could not find MASTER LEDGER header row (BOOKING REF / GUEST / COMPANY)');
        return;
      }

      const headers = (matrix[headerIdx] || []).map((h) => String(h || '').trim().toLowerCase());
      const col = (names: string[]) =>
        headers.findIndex((h) => names.some((n) => h.includes(n) || h === n));

      const idx = {
        booking: col(['booking ref', 'booking']),
        guest: col(['guest name', 'guest']),
        company: col(['company']),
        checkIn: col(['check-in', 'check in']),
        checkOut: col(['check-out', 'check out']),
        nights: col(['nights']),
        rate: col(['rate']),
        owed: col(['total owed', 'owed']),
        paid: col(['total paid', 'paid']),
        room: col(['room']),
        notes: col(['notes']),
      };

      if (idx.booking < 0 || idx.guest < 0 || idx.company < 0 || idx.owed < 0) {
        toast.error('Ledger is missing required columns');
        return;
      }

      const rows = [];
      for (let i = headerIdx + 1; i < matrix.length; i += 1) {
        const row = matrix[i] || [];
        const booking_ref = String(row[idx.booking] ?? '').trim();
        if (!booking_ref || /^grand\s*total/i.test(booking_ref) || booking_ref === '#') continue;
        const guest_name = String(row[idx.guest] ?? '').trim();
        const company = String(row[idx.company] ?? '').trim();
        const total_owed = Number(String(row[idx.owed] ?? '').replace(/,/g, ''));
        if (!guest_name || !company || !Number.isFinite(total_owed) || total_owed <= 0) continue;

        rows.push({
          booking_ref,
          guest_name,
          company,
          check_in: idx.checkIn >= 0 ? row[idx.checkIn] : undefined,
          check_out: idx.checkOut >= 0 ? row[idx.checkOut] : undefined,
          nights: idx.nights >= 0 ? Number(row[idx.nights]) : undefined,
          rate: idx.rate >= 0 ? Number(String(row[idx.rate] ?? '').replace(/,/g, '')) : undefined,
          total_owed,
          total_paid:
            idx.paid >= 0 ? Number(String(row[idx.paid] ?? '0').replace(/,/g, '')) || 0 : 0,
          room: idx.room >= 0 ? String(row[idx.room] ?? '') : undefined,
          notes: idx.notes >= 0 ? String(row[idx.notes] ?? '') : undefined,
        });
      }

      if (rows.length === 0) {
        toast.error('No importable debtor rows found');
        return;
      }

      const res = await fetchApi<{ imported: number; skipped: number; errors: string[] }>(
        '/api/debtors',
        {
          method: 'POST',
          body: JSON.stringify({ action: 'import', rows }),
        }
      );
      if (!res.success) {
        toast.error('Import failed', res.message);
        return;
      }
      const data = res.data;
      toast.success(
        `Imported ${data?.imported ?? 0} · skipped ${data?.skipped ?? 0}${
          data?.errors?.length ? ` · ${data.errors.length} errors` : ''
        }`
      );
      if (data?.errors?.length) {
        console.warn('Debtors import errors', data.errors);
      }
      await Promise.all([loadLedger(), loadAccounts(), loadSummary(), loadPayments()]);
    } catch (e) {
      console.error(e);
      toast.error('Could not read Excel file');
    } finally {
      setImporting(false);
    }
  }

  const filteredLedger = useMemo(() => {
    return ledger.filter((row) => {
      if (ledgerStatusFilter && row.status !== ledgerStatusFilter) return false;
      if (ledgerCompanyFilter && String(row.corporate_account_id ?? '') !== ledgerCompanyFilter) return false;
      return true;
    });
  }, [ledger, ledgerStatusFilter, ledgerCompanyFilter]);

  useEffect(() => {
    setLedgerPage(1);
  }, [ledgerStatusFilter, ledgerCompanyFilter, ledger.length]);

  useEffect(() => {
    setPaymentsPage(1);
  }, [payments.length]);

  useEffect(() => {
    setCompaniesPage(1);
  }, [accounts.length]);

  useEffect(() => {
    setSummaryPage(1);
  }, [summary.length]);

  const pagedLedger = useMemo(
    () => paginateSlice(filteredLedger, ledgerPage, PAGE_SIZE),
    [filteredLedger, ledgerPage]
  );
  const pagedPayments = useMemo(
    () => paginateSlice(payments, paymentsPage, PAGE_SIZE),
    [payments, paymentsPage]
  );
  const pagedAccounts = useMemo(
    () => paginateSlice(accounts, companiesPage, PAGE_SIZE),
    [accounts, companiesPage]
  );
  const pagedSummary = useMemo(
    () => paginateSlice(summary, summaryPage, PAGE_SIZE),
    [summary, summaryPage]
  );

  const debtorFolioOptions = useMemo(
    () => ledger.filter((row) => row.balance > 0),
    [ledger]
  );

  const ledgerTotals = useMemo(() => {
    return filteredLedger.reduce(
      (acc, row) => ({
        owed: acc.owed + row.owed,
        paid: acc.paid + row.paid,
        balance: acc.balance + row.balance,
      }),
      { owed: 0, paid: 0, balance: 0 }
    );
  }, [filteredLedger]);

  return (
    <PremiumPage>
      <PageHeader
        title="Debtors"
        subtitle="Corporate accounts receivable — Excel-style ledger for Messiah."
        icon="ti-building-bank"
        actions={
          <label className="btn btn-outline-primary mb-0">
            {importing ? 'Importing…' : 'Import Excel ledger'}
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              hidden
              disabled={importing}
              onChange={(e) => {
                const file = e.target.files?.[0] ?? null;
                e.target.value = '';
                void handleImportExcel(file);
              }}
            />
          </label>
        }
      />

      <PremiumTabs
        tabs={[
          { id: 'ledger', label: 'Master Ledger' },
          { id: 'payments', label: 'Payment Log' },
          { id: 'companies', label: 'Companies' },
          { id: 'summary', label: 'Summary' },
        ]}
        active={tab}
        onChange={(id) => setTab(id as TabId)}
      />

      <div className="mt-3">
        {tab === 'ledger' ? (
          <PremiumCard title="Master Ledger" flush>
            <div className="d-flex flex-wrap gap-2 p-3 pb-0">
              <select
                className="form-select form-select-sm w-auto"
                value={ledgerStatusFilter}
                onChange={(e) => setLedgerStatusFilter(e.target.value)}
              >
                <option value="">All statuses</option>
                <option value="Outstanding">Outstanding</option>
                <option value="Partial">Partial</option>
                <option value="Paid">Paid</option>
              </select>
              <select
                className="form-select form-select-sm w-auto"
                value={ledgerCompanyFilter}
                onChange={(e) => setLedgerCompanyFilter(e.target.value)}
              >
                <option value="">All companies</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
              {(ledgerStatusFilter || ledgerCompanyFilter) ? (
                <button
                  type="button"
                  className="btn btn-sm btn-outline-secondary"
                  onClick={() => {
                    setLedgerStatusFilter('');
                    setLedgerCompanyFilter('');
                  }}
                >
                  Clear filters
                </button>
              ) : null}
              <div className="ms-auto small text-muted d-flex align-items-center gap-3">
                <span>
                  Owed <strong>{formatMoney(ledgerTotals.owed)}</strong>
                </span>
                <span>
                  Paid <strong>{formatMoney(ledgerTotals.paid)}</strong>
                </span>
                <span>
                  Balance <strong>{formatMoney(ledgerTotals.balance)}</strong>
                </span>
              </div>
            </div>

            {ledgerLoading ? (
              <LoadingState label="Loading master ledger…" />
            ) : filteredLedger.length === 0 ? (
              <EmptyState message="No corporate-billed bookings yet." icon="ti-building-bank" />
            ) : (
              <>
                <div className="table-responsive">
                  <table className="table premium-table mb-0">
                    <thead>
                      <tr>
                        <th>Booking</th>
                        <th>Guest</th>
                        <th>Company</th>
                        <th>Stay</th>
                        <th className="text-end">Owed</th>
                        <th className="text-end">Paid</th>
                        <th className="text-end">Balance</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagedLedger.items.map((row) => (
                        <tr key={row.reservation_id}>
                          <td>
                            <code>{row.confirmation_code}</code>
                            <br />
                            <StatusBadge status={row.reservation_status} />
                          </td>
                          <td>
                            {row.first_name} {row.last_name}
                          </td>
                          <td>{row.company_name || '—'}</td>
                          <td>
                            {formatDisplayDate(row.check_in_date)} → {formatDisplayDate(row.check_out_date)}
                          </td>
                          <td className="text-end">{formatMoney(row.owed)}</td>
                          <td className="text-end">{formatMoney(row.paid)}</td>
                          <td className={`text-end fw-medium${row.balance > 0 ? ' text-danger' : ' text-success'}`}>
                            {formatMoney(row.balance)}
                          </td>
                          <td>
                            <DebtorStatusBadge status={row.status} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <TablePagination
                  page={pagedLedger.safePage}
                  pageSize={PAGE_SIZE}
                  total={filteredLedger.length}
                  onPageChange={setLedgerPage}
                />
              </>
            )}
          </PremiumCard>
        ) : null}

        {tab === 'payments' ? (
          <div className="row g-3">
            <div className="col-lg-4">
              <PremiumCard title="Record a Payment">
                <p className="small text-muted">
                  Payments are only ever entered here — balances on the Master Ledger update automatically.
                </p>
                <form className="premium-form" onSubmit={handleRecordPayment}>
                  <div className="mb-2">
                    <label className="form-label">Debtor folio</label>
                    <select
                      className="form-select form-select-sm"
                      value={paymentForm.folio_id}
                      onChange={(e) => setPaymentForm({ ...paymentForm, folio_id: e.target.value })}
                      required
                    >
                      <option value="">Select booking with balance…</option>
                      {debtorFolioOptions.map((row) => (
                        <option key={row.folio_id} value={row.folio_id}>
                          {row.confirmation_code} — {row.first_name} {row.last_name}
                          {row.company_name ? ` (${row.company_name})` : ''} — bal {formatMoney(row.balance)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="mb-2">
                    <label className="form-label">Method</label>
                    <select
                      className="form-select form-select-sm"
                      value={paymentForm.method}
                      onChange={(e) => setPaymentForm({ ...paymentForm, method: e.target.value })}
                    >
                      <option value="cash">Cash</option>
                      <option value="card">Card</option>
                      <option value="mobile_money">Mobile money</option>
                      <option value="bank_transfer">Bank transfer</option>
                      <option value="cheque">Cheque</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <div className="mb-2">
                    <label className="form-label">Amount</label>
                    <input
                      type="number"
                      step="0.01"
                      className="form-control form-control-sm"
                      placeholder="Amount"
                      value={paymentForm.amount}
                      onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })}
                      required
                    />
                  </div>
                  <div className="mb-3">
                    <label className="form-label">Reference (optional)</label>
                    <input
                      className="form-control form-control-sm"
                      placeholder="Cheque no. / transfer ref"
                      value={paymentForm.reference}
                      onChange={(e) => setPaymentForm({ ...paymentForm, reference: e.target.value })}
                    />
                  </div>
                  <button type="submit" className="btn btn-premium btn-sm" disabled={saving}>
                    Record Payment
                  </button>
                </form>
              </PremiumCard>
            </div>

            <div className="col-lg-8">
              <PremiumCard title="Payment History" flush>
                {paymentsLoading ? (
                  <LoadingState label="Loading payment log…" />
                ) : payments.length === 0 ? (
                  <EmptyState message="No corporate payments recorded yet." icon="ti-cash" />
                ) : (
                  <>
                    <div className="table-responsive">
                      <table className="table premium-table mb-0">
                        <thead>
                          <tr>
                            <th>Date</th>
                            <th>Booking</th>
                            <th>Guest</th>
                            <th>Company</th>
                            <th>Method</th>
                            <th>Reference</th>
                            <th className="text-end">Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {pagedPayments.items.map((p) => (
                            <tr key={p.id}>
                              <td>{formatDisplayDate(p.paid_at)}</td>
                              <td>
                                <code>{p.confirmation_code}</code>
                              </td>
                              <td>
                                {p.first_name} {p.last_name}
                              </td>
                              <td>{p.company_name || '—'}</td>
                              <td className="text-capitalize">{p.method.replace(/_/g, ' ')}</td>
                              <td>{p.reference || '—'}</td>
                              <td className="text-end">{formatMoney(p.amount)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <TablePagination
                      page={pagedPayments.safePage}
                      pageSize={PAGE_SIZE}
                      total={payments.length}
                      onPageChange={setPaymentsPage}
                    />
                  </>
                )}
              </PremiumCard>
            </div>
          </div>
        ) : null}

        {tab === 'companies' ? (
          <div className="row g-3">
            <div className="col-lg-4">
              <PremiumCard title="Add Company">
                <form className="premium-form" onSubmit={handleCreateAccount}>
                  <div className="mb-2">
                    <input
                      className="form-control form-control-sm"
                      placeholder="Company name"
                      value={accountForm.name}
                      onChange={(e) => setAccountForm({ ...accountForm, name: e.target.value })}
                      required
                    />
                  </div>
                  <div className="mb-2">
                    <input
                      className="form-control form-control-sm"
                      placeholder="Contact name"
                      value={accountForm.contact_name}
                      onChange={(e) => setAccountForm({ ...accountForm, contact_name: e.target.value })}
                    />
                  </div>
                  <div className="row g-2 mb-2">
                    <div className="col-6">
                      <input
                        className="form-control form-control-sm"
                        placeholder="Email"
                        value={accountForm.email}
                        onChange={(e) => setAccountForm({ ...accountForm, email: e.target.value })}
                      />
                    </div>
                    <div className="col-6">
                      <input
                        className="form-control form-control-sm"
                        placeholder="Phone"
                        value={accountForm.phone}
                        onChange={(e) => setAccountForm({ ...accountForm, phone: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="mb-2">
                    <input
                      type="number"
                      step="0.01"
                      className="form-control form-control-sm"
                      placeholder="Credit limit"
                      value={accountForm.credit_limit}
                      onChange={(e) => setAccountForm({ ...accountForm, credit_limit: e.target.value })}
                    />
                  </div>
                  <div className="mb-2">
                    <textarea
                      className="form-control form-control-sm"
                      placeholder="Notes"
                      rows={2}
                      value={accountForm.notes}
                      onChange={(e) => setAccountForm({ ...accountForm, notes: e.target.value })}
                    />
                  </div>
                  <button type="submit" className="btn btn-premium btn-sm" disabled={saving}>
                    Add Company
                  </button>
                </form>
              </PremiumCard>
            </div>

            <div className="col-lg-8">
              <PremiumCard title="Companies" flush>
                {accountsLoading ? (
                  <LoadingState label="Loading companies…" />
                ) : accounts.length === 0 ? (
                  <EmptyState message="No corporate accounts yet." icon="ti-building-bank" />
                ) : (
                  <>
                    <div className="table-responsive">
                      <table className="table premium-table mb-0">
                        <thead>
                          <tr>
                            <th>Name</th>
                            <th>Contact</th>
                            <th>Email</th>
                            <th>Phone</th>
                            <th className="text-end">Credit limit</th>
                            <th>Status</th>
                            <th />
                          </tr>
                        </thead>
                        <tbody>
                          {pagedAccounts.items.map((a) => (
                            <tr key={a.id}>
                              <td className="fw-medium">{a.name}</td>
                              <td>{a.contact_name || '—'}</td>
                              <td>{a.email || '—'}</td>
                              <td>{a.phone || '—'}</td>
                              <td className="text-end">{formatMoney(a.credit_limit)}</td>
                              <td>
                                <span className={`premium-badge premium-badge--${a.is_active ? 'success' : 'muted'}`}>
                                  {a.is_active ? 'Active' : 'Inactive'}
                                </span>
                              </td>
                              <td className="text-end">
                                <button
                                  type="button"
                                  className="btn btn-sm btn-premium-outline"
                                  disabled={saving}
                                  onClick={() => void toggleAccountActive(a)}
                                >
                                  {a.is_active ? 'Deactivate' : 'Activate'}
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <TablePagination
                      page={pagedAccounts.safePage}
                      pageSize={PAGE_SIZE}
                      total={accounts.length}
                      onPageChange={setCompaniesPage}
                    />
                  </>
                )}
              </PremiumCard>
            </div>
          </div>
        ) : null}

        {tab === 'summary' ? (
          <PremiumCard title="Company Summary" flush>
            {summaryLoading ? (
              <LoadingState label="Loading company summary…" />
            ) : summary.length === 0 ? (
              <EmptyState message="No corporate accounts yet." icon="ti-report-money" />
            ) : (
              <>
                <div className="table-responsive">
                  <table className="table premium-table mb-0">
                    <thead>
                      <tr>
                        <th>Company</th>
                        <th className="text-end">Bookings</th>
                        <th className="text-end">Owed</th>
                        <th className="text-end">Paid</th>
                        <th className="text-end">Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagedSummary.items.map((row) => (
                        <tr key={row.id}>
                          <td className="fw-medium">{row.name}</td>
                          <td className="text-end">{row.bookings}</td>
                          <td className="text-end">{formatMoney(row.owed)}</td>
                          <td className="text-end">{formatMoney(row.paid)}</td>
                          <td className={`text-end fw-medium${row.balance > 0 ? ' text-danger' : ' text-success'}`}>
                            {formatMoney(row.balance)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td className="fw-semibold">Total</td>
                        <td className="text-end fw-semibold">
                          {summary.reduce((sum, r) => sum + r.bookings, 0)}
                        </td>
                        <td className="text-end fw-semibold">
                          {formatMoney(summary.reduce((sum, r) => sum + r.owed, 0))}
                        </td>
                        <td className="text-end fw-semibold">
                          {formatMoney(summary.reduce((sum, r) => sum + r.paid, 0))}
                        </td>
                        <td className="text-end fw-semibold">
                          {formatMoney(summary.reduce((sum, r) => sum + r.balance, 0))}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
                <TablePagination
                  page={pagedSummary.safePage}
                  pageSize={PAGE_SIZE}
                  total={summary.length}
                  onPageChange={setSummaryPage}
                />
              </>
            )}
          </PremiumCard>
        ) : null}
      </div>
    </PremiumPage>
  );
}
