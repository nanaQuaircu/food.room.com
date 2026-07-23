'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { useToast } from '@/components/ui/ToastProvider';
import {
  PremiumPage,
  PageHeader,
  PremiumCard,
  StatCard,
  LoadingState,
  EmptyState,
} from '@/components/ui/premium';
import TablePagination, { paginateSlice } from '@/components/ui/TablePagination';
import { fetchApi } from '@/lib/client/fetch-api';
import { useTenantSession } from '@/components/providers/TenantSessionProvider';
import type { OfficeReports, ReportPeriod } from '@/lib/services/hotel-service';
import {
  REPORT_HEADER_COLOR,
  buildContactLine,
  buildReportSubtitle,
  buildReportTitle,
  formatPrintedTimestamp,
  formatReportDateRange,
  formatReportNumber,
} from '@/lib/reports/document-layout';

const PAGE_SIZE = 25;

const PERIODS: Array<{ id: ReportPeriod; label: string; hint: string }> = [
  { id: 'daily', label: 'Daily', hint: 'Today' },
  { id: 'weekly', label: 'Weekly', hint: 'Last 7 days' },
  { id: 'monthly', label: 'Monthly', hint: 'Month to date' },
  { id: 'yearly', label: 'Yearly', hint: 'Year to date' },
];

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function money(n: number, currency = 'GHS') {
  return `${currency} ${Number(n).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function moneyShort(n: number) {
  return Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function defaultRange(period: ReportPeriod): { start: string; end: string } {
  const end = todayIso();
  const now = new Date();
  if (period === 'daily') return { start: end, end };
  if (period === 'weekly') {
    const s = new Date(now);
    s.setDate(s.getDate() - 6);
    return {
      start: `${s.getFullYear()}-${String(s.getMonth() + 1).padStart(2, '0')}-${String(s.getDate()).padStart(2, '0')}`,
      end,
    };
  }
  if (period === 'monthly') {
    return {
      start: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`,
      end,
    };
  }
  return { start: `${now.getFullYear()}-01-01`, end };
}

const DEFAULT_LOGO = '/assets/images/logo-icon.svg';

async function loadLogoForPdf(logoUrl?: string | null) {
  const url = logoUrl || DEFAULT_LOGO;
  const absolute = url.startsWith('http') ? url : `${window.location.origin}${url}`;
  try {
    const res = await fetch(absolute);
    if (!res.ok) return null;
    const blob = await res.blob();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });

    if (blob.type.includes('svg') || url.endsWith('.svg')) {
      return await new Promise<{ dataUrl: string; format: 'PNG' }>((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = 128;
          canvas.height = 128;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Canvas unavailable'));
            return;
          }
          ctx.drawImage(img, 0, 0, 128, 128);
          resolve({ dataUrl: canvas.toDataURL('image/png'), format: 'PNG' });
        };
        img.onerror = reject;
        img.src = dataUrl;
      });
    }

    const format: 'PNG' | 'JPEG' = blob.type.includes('png') ? 'PNG' : 'JPEG';
    return { dataUrl, format };
  } catch {
    return null;
  }
}

export default function ReportsModule() {
  const toast = useToast();
  const { hotelName, hotelLogoUrl, userName } = useTenantSession();
  const [period, setPeriod] = useState<ReportPeriod>('monthly');
  const initial = defaultRange('monthly');
  const [startDate, setStartDate] = useState(initial.start);
  const [endDate, setEndDate] = useState(initial.end);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<'pdf' | 'excel' | null>(null);
  const [data, setData] = useState<OfficeReports | null>(null);
  const [tablePage, setTablePage] = useState(1);

  const queryUrl = useMemo(() => {
    const params = new URLSearchParams({
      period,
      start: startDate,
      end: endDate,
    });
    return `/api/reports?${params.toString()}`;
  }, [period, startDate, endDate]);

  const loadData = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!opts?.silent) setLoading(true);
      try {
        const res = await fetchApi<OfficeReports>(queryUrl, { skipCache: true });
        if (!res.success) {
          toast.error('Failed to load reports', res.message);
          return;
        }
        setData(res.data ?? null);
        setTablePage(1);
      } catch {
        toast.error('Failed to load reports');
      } finally {
        if (!opts?.silent) setLoading(false);
      }
    },
    [queryUrl, toast]
  );

  useEffect(() => {
    void loadData();
  }, [loadData]);

  function applyPeriod(next: ReportPeriod) {
    const range = defaultRange(next);
    setPeriod(next);
    setStartDate(range.start);
    setEndDate(range.end);
  }

  function handleApplyDates(e: FormEvent) {
    e.preventDefault();
    if (startDate > endDate) {
      toast.error('Invalid date range', 'Start date must be on or before end date.');
      return;
    }
    void loadData();
  }

  const s = data?.summary;
  const currency = data?.currency || 'GHS';
  const rows = useMemo(() => [...(data?.rows ?? [])].reverse(), [data?.rows]);
  const rowsPaged = useMemo(
    () => paginateSlice(rows, tablePage, PAGE_SIZE),
    [rows, tablePage]
  );

  const paymentTotal = useMemo(
    () => (data?.paymentMethods ?? []).reduce((n, p) => n + p.count, 0),
    [data?.paymentMethods]
  );

  const property = data?.property;
  const brandName = property?.name || hotelName || 'Hotel';
  const contactLine = buildContactLine(property);
  const reportTitle = data
    ? buildReportTitle(data.period, data.startDate, data.endDate, data.periodLabel)
    : 'OPERATIONS REPORT';
  const reportSubtitle = data ? buildReportSubtitle(data.startDate, data.endDate) : '';
  const printedOn = formatPrintedTimestamp();

  const grandTotals = useMemo(
    () => ({
      arrivals: s?.arrivals ?? 0,
      departures: s?.departures ?? 0,
      bookings: s?.reservationsCreated ?? 0,
      cancellations: s?.cancellations ?? 0,
      payments: paymentTotal,
      revenue: s?.revenuePeriod ?? 0,
    }),
    [s, paymentTotal]
  );

  const documentTableHead = ['#', 'Date', 'Arrivals', 'Departures', 'Bookings', 'Cancels', 'Payments', 'Revenue'];

  const documentTableBody = useMemo(
    () =>
      rows.map((row, index) => [
        String(index + 1),
        row.label,
        String(row.arrivals),
        String(row.departures),
        String(row.bookings),
        String(row.cancellations),
        String(row.payments),
        formatReportNumber(row.revenue),
      ]),
    [rows]
  );

  const documentGrandTotalRow = useMemo(
    () => [
      '',
      'Grand Total',
      String(grandTotals.arrivals),
      String(grandTotals.departures),
      String(grandTotals.bookings),
      String(grandTotals.cancellations),
      String(grandTotals.payments),
      formatReportNumber(grandTotals.revenue),
    ],
    [grandTotals]
  );

  function renderReportTable(tableRows: typeof rows, variant: 'screen' | 'document' = 'screen') {
    if (variant === 'document') {
      return (
        <table className="table mb-0 reports-table reports-table--document">
          <thead>
            <tr>
              {documentTableHead.map((heading) => (
                <th
                  key={heading}
                  className={
                    heading === '#'
                      ? 'text-center'
                      : heading === 'Date'
                        ? ''
                        : 'text-end'
                  }
                >
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tableRows.map((row, index) => (
              <tr key={row.date}>
                <td className="text-muted text-center">{index + 1}</td>
                <td className="fw-medium">{row.label}</td>
                <td className="text-end">{row.arrivals}</td>
                <td className="text-end">{row.departures}</td>
                <td className="text-end">{row.bookings}</td>
                <td className="text-end">{row.cancellations}</td>
                <td className="text-end">{row.payments}</td>
                <td className="text-end fw-semibold">{formatReportNumber(row.revenue)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="reports-grand-total-row">
              <th />
              <th>Grand Total</th>
              <th className="text-end">{grandTotals.arrivals}</th>
              <th className="text-end">{grandTotals.departures}</th>
              <th className="text-end">{grandTotals.bookings}</th>
              <th className="text-end">{grandTotals.cancellations}</th>
              <th className="text-end">{grandTotals.payments}</th>
              <th className="text-end">{formatReportNumber(grandTotals.revenue)}</th>
            </tr>
          </tfoot>
        </table>
      );
    }

    return (
      <table className="table premium-table mb-0 reports-table">
        <thead>
          <tr>
            <th>Date</th>
            <th className="text-end">Arrivals</th>
            <th className="text-end">Departures</th>
            <th className="text-end">Bookings</th>
            <th className="text-end">Cancels</th>
            <th className="text-end">Payments</th>
            <th className="text-end">Revenue</th>
          </tr>
        </thead>
        <tbody>
          {tableRows.map((row) => (
            <tr key={row.date}>
              <td className="fw-medium">{row.label}</td>
              <td className="text-end">{row.arrivals}</td>
              <td className="text-end">{row.departures}</td>
              <td className="text-end">{row.bookings}</td>
              <td className="text-end">{row.cancellations}</td>
              <td className="text-end">{row.payments}</td>
              <td className="text-end fw-semibold">{money(row.revenue, currency)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th>Total / period</th>
            <th className="text-end">{s?.arrivals ?? 0}</th>
            <th className="text-end">{s?.departures ?? 0}</th>
            <th className="text-end">{s?.reservationsCreated ?? 0}</th>
            <th className="text-end">{s?.cancellations ?? 0}</th>
            <th className="text-end">{paymentTotal}</th>
            <th className="text-end">{money(s?.revenuePeriod ?? 0, currency)}</th>
          </tr>
        </tfoot>
      </table>
    );
  }

  function printReport() {
    if (!data) {
      toast.warning('Nothing to print', 'Generate a report first.');
      return;
    }
    const previousTitle = document.title;
    document.title = ' ';
    const restoreTitle = () => {
      document.title = previousTitle;
      window.removeEventListener('afterprint', restoreTitle);
    };
    window.addEventListener('afterprint', restoreTitle);
    window.print();
  }

  async function exportPdf() {
    if (!data) {
      toast.warning('Nothing to export', 'Generate a report first.');
      return;
    }
    setExporting('pdf');
    try {
      const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const logo = await loadLogoForPdf(hotelLogoUrl);
      let textX = 40;

      if (logo) {
        doc.addImage(logo.dataUrl, logo.format, 40, 26, 56, 56);
        textX = 108;
      }

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.setTextColor(20);
      doc.text(brandName.toUpperCase(), textX, 44);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(60);
      let detailY = 58;
      if (property?.address) {
        doc.text(property.address, textX, detailY);
        detailY += 12;
      }
      if (contactLine) {
        doc.text(contactLine, textX, detailY);
      }

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.setTextColor(20);
      const titleY = 108;
      doc.text(reportTitle, pageWidth / 2, titleY, { align: 'center' });
      const titleWidth = doc.getTextWidth(reportTitle);
      doc.setLineWidth(0.8);
      doc.line(pageWidth / 2 - titleWidth / 2, titleY + 4, pageWidth / 2 + titleWidth / 2, titleY + 4);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.text(reportSubtitle, pageWidth / 2, titleY + 20, { align: 'center' });

      autoTable(doc, {
        startY: titleY + 34,
        head: [documentTableHead],
        body: documentTableBody,
        foot: [documentGrandTotalRow],
        styles: { fontSize: 8.5, cellPadding: 4, lineColor: [210, 210, 210], lineWidth: 0.25 },
        headStyles: {
          fillColor: REPORT_HEADER_COLOR,
          textColor: 255,
          fontStyle: 'bold',
          halign: 'center',
        },
        footStyles: {
          fillColor: [255, 255, 255],
          textColor: 20,
          fontStyle: 'bold',
          lineWidth: { top: 1.2 },
        },
        columnStyles: {
          0: { halign: 'center', cellWidth: 28 },
          1: { halign: 'left' },
          2: { halign: 'right' },
          3: { halign: 'right' },
          4: { halign: 'right' },
          5: { halign: 'right' },
          6: { halign: 'right' },
          7: { halign: 'right' },
        },
        alternateRowStyles: { fillColor: [255, 255, 255] },
        didDrawPage: () => {
          doc.setFontSize(8);
          doc.setTextColor(100);
          doc.text(`Printed on: ${printedOn}`, 40, pageHeight - 18);
          doc.text(`Printed by: ${userName}`, pageWidth - 40, pageHeight - 18, { align: 'right' });
        },
      });

      doc.save(`hotel-report-${data.startDate}_to_${data.endDate}.pdf`);
      toast.success('PDF exported', 'The report was downloaded successfully.');
    } catch {
      toast.error('PDF export failed');
    } finally {
      setExporting(null);
    }
  }

  function exportExcel() {
    if (!data) {
      toast.warning('Nothing to export', 'Generate a report first.');
      return;
    }
    setExporting('excel');
    try {
      const sheetRows: Array<Array<string | number>> = [
        [brandName.toUpperCase()],
        [property?.address || ''],
        [contactLine],
        [],
        [reportTitle],
        [reportSubtitle],
        [],
        documentTableHead,
        ...documentTableBody,
        documentGrandTotalRow,
        [],
        [`Printed on: ${printedOn}`, '', '', '', '', '', '', `Printed by: ${userName}`],
      ];

      const ws = XLSX.utils.aoa_to_sheet(sheetRows);
      ws['!cols'] = [
        { wch: 5 },
        { wch: 24 },
        { wch: 10 },
        { wch: 12 },
        { wch: 10 },
        { wch: 10 },
        { wch: 10 },
        { wch: 14 },
      ];
      ws['!merges'] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: 7 } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: 7 } },
        { s: { r: 2, c: 0 }, e: { r: 2, c: 7 } },
        { s: { r: 4, c: 0 }, e: { r: 4, c: 7 } },
        { s: { r: 5, c: 0 }, e: { r: 5, c: 7 } },
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Operations Report');
      XLSX.writeFile(wb, `hotel-report-${data.startDate}_to_${data.endDate}.xlsx`);
      toast.success('Excel exported', 'The workbook was downloaded successfully.');
    } catch {
      toast.error('Excel export failed');
    } finally {
      setExporting(null);
    }
  }

  return (
    <PremiumPage>
      <PageHeader
        title="Reports"
        subtitle="Office operations report — filter by period and export for records."
        icon="ti-chart-bar"
      />

      <div className="reports-office-layout">
        <aside className="reports-filter-panel">
          <div className="reports-filter-panel__head">
            <h2>Filters</h2>
            <p>Choose a report type and date range.</p>
          </div>

          <div className="reports-filter-group">
            <span className="reports-filter-label">Report type</span>
            <div className="reports-type-list">
              {PERIODS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={`reports-type-btn${period === p.id ? ' is-active' : ''}`}
                  onClick={() => applyPeriod(p.id)}
                >
                  <strong>{p.label}</strong>
                  <span>{p.hint}</span>
                </button>
              ))}
            </div>
          </div>

          <form className="reports-filter-group" onSubmit={handleApplyDates}>
            <span className="reports-filter-label">Date range</span>
            <label className="reports-date-field">
              <span>From</span>
              <input
                type="date"
                className="form-control"
                value={startDate}
                max={endDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </label>
            <label className="reports-date-field">
              <span>To</span>
              <input
                type="date"
                className="form-control"
                value={endDate}
                min={startDate}
                max={todayIso()}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </label>
            <button type="submit" className="btn btn-premium w-100 mt-2" disabled={loading}>
              {loading ? 'Loading…' : 'Apply filters'}
            </button>
          </form>
        </aside>

        <div className="reports-office-main" id="reports-print-root">
          {data && rows.length > 0 ? (
            <div className="reports-print-only reports-print-sheet">
              <header className="reports-print-brand">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={hotelLogoUrl || DEFAULT_LOGO} alt="" />
                <div>
                  <h1>{brandName.toUpperCase()}</h1>
                  {property?.address ? <p>{property.address}</p> : null}
                  {contactLine ? <p>{contactLine}</p> : null}
                </div>
              </header>

              <div className="reports-print-title-block">
                <h2>{reportTitle}</h2>
                <p>{reportSubtitle}</p>
              </div>

              <div className="reports-print-table-wrap">
                {renderReportTable(rows, 'document')}
              </div>

              <footer className="reports-print-footer">
                <span>Printed on: {printedOn}</span>
                <span>Printed by: {userName}</span>
              </footer>
            </div>
          ) : null}

          <div className="reports-office-banner reports-screen-only">
            <div>
              <h2>{data?.periodLabel || 'Operations report'}</h2>
              <p>
                {data
                  ? formatReportDateRange(data.startDate, data.endDate)
                  : formatReportDateRange(startDate, endDate)}
                {data?.generatedAt
                  ? ` · Generated ${formatPrintedTimestamp(new Date(data.generatedAt))}`
                  : ''}
              </p>
            </div>
          </div>

          {loading && !data ? (
            <PremiumCard>
              <LoadingState label="Loading report…" />
            </PremiumCard>
          ) : (
            <>
              <div className="row g-3 mb-3 premium-dashboard-row reports-screen-only">
                <div className="col-6 col-xl-3">
                  <StatCard
                    label="Occupancy"
                    value={s?.occupancyRate ?? 0}
                    suffix="%"
                    icon="ti-building"
                    tone="primary"
                    featured
                    caption={`${s?.roomsOccupied ?? 0} of ${s?.roomsTotal ?? 0} rooms`}
                  />
                </div>
                <div className="col-6 col-xl-3">
                  <StatCard
                    label="Revenue"
                    value={moneyShort(s?.revenuePeriod ?? 0)}
                    suffix={currency}
                    icon="ti-wallet"
                    tone="warning"
                    caption={`${s?.arrivals ?? 0} arrivals · ${s?.departures ?? 0} departures`}
                  />
                </div>
                <div className="col-6 col-xl-3">
                  <StatCard
                    label="ADR / RevPAR"
                    value={moneyShort(s?.adr ?? 0)}
                    suffix={currency}
                    icon="ti-receipt"
                    tone="success"
                    caption={`RevPAR ${moneyShort(s?.revpar ?? 0)} ${currency}`}
                  />
                </div>
                <div className="col-6 col-xl-3">
                  <StatCard
                    label="Outstanding"
                    value={moneyShort(s?.outstandingBalance ?? 0)}
                    suffix={currency}
                    icon="ti-alert-circle"
                    tone="danger"
                    caption={`${s?.inHouse ?? 0} in-house · ${s?.reservationsCreated ?? 0} bookings`}
                  />
                </div>
              </div>

              <PremiumCard
                title="Detailed report"
                flush
                className="reports-table-card"
                actions={
                  <div className="reports-table-actions reports-screen-only">
                    <span className="reports-card-meta">
                      {rows.length} day{rows.length === 1 ? '' : 's'}
                    </span>
                    <div className="reports-export-toolbar">
                      <button
                        type="button"
                        className="btn btn-sm reports-export-btn reports-export-btn--print"
                        onClick={printReport}
                      >
                        <i className="ti ti-printer me-1" />
                        Print
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm reports-export-btn reports-export-btn--pdf"
                        onClick={() => void exportPdf()}
                        disabled={exporting !== null}
                      >
                        <i className="ti ti-file-type-pdf me-1" />
                        {exporting === 'pdf' ? 'Preparing…' : 'PDF'}
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm reports-export-btn reports-export-btn--excel"
                        onClick={exportExcel}
                        disabled={exporting !== null}
                      >
                        <i className="ti ti-file-spreadsheet me-1" />
                        {exporting === 'excel' ? 'Preparing…' : 'Excel'}
                      </button>
                    </div>
                  </div>
                }
              >
                {rows.length === 0 ? (
                  <div className="p-4">
                    <EmptyState message="No activity for this date range." icon="ti-report" />
                  </div>
                ) : (
                  <>
                    <div className="table-responsive reports-screen-only">
                      {renderReportTable(rowsPaged.items)}
                    </div>
                    <div className="reports-screen-only">
                      <TablePagination
                        page={rowsPaged.safePage}
                        pageSize={PAGE_SIZE}
                        total={rows.length}
                        onPageChange={setTablePage}
                      />
                    </div>
                  </>
                )}
              </PremiumCard>
            </>
          )}
        </div>
      </div>
    </PremiumPage>
  );
}
