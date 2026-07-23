'use client';

import { useCallback, useState } from 'react';
import { motion } from 'framer-motion';

export type FoodReceiptOrder = {
  id: number;
  order_type: string;
  delivery_type: string | null;
  delivery_address?: string | null;
  room_number: string | null;
  status: string;
  payment_status: string;
  payment_method: string | null;
  total_amount: number;
  delivery_fee: number;
  notes?: string | null;
  created_at: string;
  lines: Array<{
    item_name: string;
    quantity: number;
    unit_price?: number;
    line_total: number;
  }>;
};

type Props = {
  order: FoodReceiptOrder;
  currency: string;
  hotelName?: string;
  hotelAddress?: string | null;
  hotelLogoUrl?: string | null;
  compact?: boolean;
  className?: string;
};

function money(amount: number, currency: string) {
  return `${currency} ${Number(amount || 0).toFixed(2)}`;
}

function formatWhen(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function orderTypeLabel(order: FoodReceiptOrder) {
  if (order.order_type === 'room_service' || order.delivery_type === 'room_service') {
    return order.room_number ? `Room service · Rm ${order.room_number}` : 'Room service';
  }
  if (order.delivery_type === 'hubtel') return 'Delivery';
  if (order.order_type === 'restaurant') return 'Dine-in / Pickup';
  return order.order_type.replace(/_/g, ' ');
}

function absoluteAssetUrl(url: string) {
  if (!url) return '';
  if (/^https?:\/\//i.test(url) || url.startsWith('data:')) return url;
  if (typeof window === 'undefined') return url;
  return `${window.location.origin}${url.startsWith('/') ? '' : '/'}${url}`;
}

async function loadImageDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(absoluteAssetUrl(url), { cache: 'force-cache' });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function imageFormatFromDataUrl(dataUrl: string): 'PNG' | 'JPEG' | 'WEBP' {
  if (dataUrl.startsWith('data:image/png')) return 'PNG';
  if (dataUrl.startsWith('data:image/webp')) return 'WEBP';
  return 'JPEG';
}

export default function GuestFoodOrderReceipt({
  order,
  currency,
  hotelName = 'Hotel',
  hotelAddress,
  hotelLogoUrl,
  compact = false,
  className = '',
}: Props) {
  const [downloading, setDownloading] = useState(false);
  const subtotal = Math.max(0, Number(order.total_amount) - Number(order.delivery_fee || 0));
  const logoSrc = hotelLogoUrl ? absoluteAssetUrl(hotelLogoUrl) : '';

  const downloadPdf = useCallback(async () => {
    setDownloading(true);
    try {
      const { jsPDF } = await import('jspdf');
      const autoTable = (await import('jspdf-autotable')).default;
      const doc = new jsPDF({ unit: 'pt', format: 'a4' });
      let y = 48;

      if (hotelLogoUrl) {
        const dataUrl = await loadImageDataUrl(hotelLogoUrl);
        if (dataUrl) {
          try {
            doc.addImage(dataUrl, imageFormatFromDataUrl(dataUrl), 40, y - 8, 54, 54);
          } catch {
            /* logo optional */
          }
        }
      }

      const textX = hotelLogoUrl ? 108 : 40;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.setTextColor(30, 23, 20);
      doc.text(hotelName, textX, y + 10);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(107, 94, 86);
      if (hotelAddress) {
        doc.text(hotelAddress, textX, y + 26, { maxWidth: 420 });
      }
      doc.text('Food order receipt', textX, y + (hotelAddress ? 44 : 28));

      y = hotelLogoUrl ? 118 : 100;
      doc.setDrawColor(239, 230, 223);
      doc.line(40, y, 555, y);
      y += 28;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(18);
      doc.setTextColor(30, 23, 20);
      doc.text(`Order #${order.id}`, 40, y);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(107, 94, 86);
      doc.text(`Completed · ${formatWhen(order.created_at)}`, 40, y + 16);

      y += 42;
      const meta = [
        ['Service', orderTypeLabel(order)],
        ...(order.delivery_address ? [['Address', order.delivery_address] as const] : []),
        [
          'Payment',
          `${(order.payment_method || 'cash').replace(/_/g, ' ')} · ${order.payment_status}`,
        ],
        ...(order.notes ? [['Notes', order.notes] as const] : []),
      ];
      for (const [label, value] of meta) {
        doc.setFontSize(9);
        doc.setTextColor(125, 111, 103);
        doc.text(label.toUpperCase(), 40, y);
        doc.setFontSize(11);
        doc.setTextColor(30, 23, 20);
        doc.text(String(value), 140, y, { maxWidth: 400 });
        y += 18;
      }

      autoTable(doc, {
        startY: y + 8,
        head: [['Item', 'Qty', 'Amount']],
        body: order.lines.map((line) => [
          line.item_name,
          String(line.quantity),
          money(line.line_total, currency),
        ]),
        styles: { fontSize: 10, cellPadding: 6 },
        headStyles: { fillColor: [30, 23, 20], textColor: 255 },
        columnStyles: {
          1: { halign: 'center', cellWidth: 48 },
          2: { halign: 'right', cellWidth: 110 },
        },
        margin: { left: 40, right: 40 },
      });

      const finalY =
        (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 40;
      let totalsY = finalY + 24;
      doc.setFontSize(11);
      doc.setTextColor(92, 83, 77);
      doc.text('Subtotal', 40, totalsY);
      doc.text(money(subtotal, currency), 555, totalsY, { align: 'right' });
      totalsY += 18;
      if (Number(order.delivery_fee) > 0) {
        doc.text('Delivery', 40, totalsY);
        doc.text(money(order.delivery_fee, currency), 555, totalsY, { align: 'right' });
        totalsY += 18;
      }
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.setTextColor(203, 134, 112);
      doc.text('Total', 40, totalsY);
      doc.text(money(order.total_amount, currency), 555, totalsY, { align: 'right' });

      totalsY += 36;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(138, 116, 104);
      doc.text(`Thank you for ordering with ${hotelName}.`, 297.5, totalsY, { align: 'center' });

      doc.save(`food-receipt-${order.id}.pdf`);
    } catch {
      window.alert('Could not generate the PDF receipt. Please try again.');
    } finally {
      setDownloading(false);
    }
  }, [order, currency, hotelName, hotelAddress, hotelLogoUrl, subtotal]);

  return (
    <motion.div
      className={`guest-food-receipt${compact ? ' guest-food-receipt--compact' : ''} ${className}`.trim()}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
    >
      <div className="guest-food-receipt__head">
        <div className="guest-food-receipt__brand">
          {logoSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoSrc}
              alt={`${hotelName} logo`}
              className="guest-food-receipt__logo"
            />
          ) : null}
          <div>
            <p className="guest-food-receipt__eyebrow">Receipt</p>
            <p className="guest-food-receipt__code">Order #{order.id}</p>
            <p className="guest-food-receipt__meta">
              {hotelName} · {formatWhen(order.created_at)}
            </p>
          </div>
        </div>
        <span className="guest-food-receipt__badge">Completed</span>
      </div>

      <dl className="guest-food-receipt__details">
        <div>
          <dt>Service</dt>
          <dd>{orderTypeLabel(order)}</dd>
        </div>
        {order.delivery_address ? (
          <div>
            <dt>Address</dt>
            <dd>{order.delivery_address}</dd>
          </div>
        ) : null}
        <div>
          <dt>Payment</dt>
          <dd style={{ textTransform: 'capitalize' }}>
            {(order.payment_method || 'cash').replace(/_/g, ' ')} · {order.payment_status}
          </dd>
        </div>
      </dl>

      <ul className="guest-food-receipt__lines">
        {order.lines.map((line, idx) => (
          <li key={`${line.item_name}-${idx}`}>
            <span>
              {line.quantity}× {line.item_name}
            </span>
            <strong>{money(line.line_total, currency)}</strong>
          </li>
        ))}
      </ul>

      <div className="guest-food-receipt__totals">
        <div>
          <span>Subtotal</span>
          <strong>{money(subtotal, currency)}</strong>
        </div>
        {Number(order.delivery_fee) > 0 ? (
          <div>
            <span>Delivery</span>
            <strong>{money(order.delivery_fee, currency)}</strong>
          </div>
        ) : null}
        <div className="guest-food-receipt__grand">
          <span>Total</span>
          <strong>{money(order.total_amount, currency)}</strong>
        </div>
      </div>

      <div className="guest-food-receipt__actions">
        <button
          type="button"
          className="guest-food-receipt__btn guest-food-receipt__btn--primary"
          onClick={() => void downloadPdf()}
          disabled={downloading}
        >
          {downloading ? 'Preparing PDF…' : 'Download PDF'}
        </button>
      </div>
    </motion.div>
  );
}
