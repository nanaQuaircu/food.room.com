import { NextRequest } from 'next/server';
import { requireTenant, isTenantContext, requireTenantRoles } from '@/lib/api/tenant-context';
import { apiOk, apiFail } from '@/lib/api/json';
import { listFolios, getFolioDetail, addPayment } from '@/lib/services/hotel-service';
import {
  getCompanyBySessionId,
  getPaystackRuntimeCredentials,
} from '@/lib/services/company-settings-service';
import { paystackVerify } from '@/lib/payments/paystack-service';
import {
  addFolioChargeWithTax,
  createRefund,
  deleteTaxRate,
  generateInvoice,
  getInvoiceDetail,
  listInvoices,
  listNightAuditRuns,
  listRefunds,
  listTaxRates,
  previewNightAudit,
  runNightAudit,
  saveTaxRate,
} from '@/lib/services/billing-loop2';
import { formatLocalDateIso } from '@/lib/billing/stay-billing';
import { createRoleNotification } from '@/lib/services/in-app-notifications';

export async function GET(request: NextRequest) {
  const ctx = await requireTenant();
  if (!isTenantContext(ctx)) return ctx;
  try {
    const folioIdParam = request.nextUrl.searchParams.get('folio_id');
    const view = request.nextUrl.searchParams.get('view');

    if (view === 'tax_rates') {
      return apiOk(await listTaxRates(ctx.db, ctx.propertyId));
    }
    if (view === 'night_audit') {
      const date = request.nextUrl.searchParams.get('date') || formatLocalDateIso();
      const preview = await previewNightAudit(ctx.db, ctx.propertyId, date);
      const runs = await listNightAuditRuns(ctx.db, ctx.propertyId);
      return apiOk({ preview, runs });
    }
    if (view === 'invoices') {
      const folioId = folioIdParam ? Number(folioIdParam) : undefined;
      return apiOk(await listInvoices(ctx.db, ctx.propertyId, folioId));
    }
    if (view === 'invoice') {
      const invoiceId = Number(request.nextUrl.searchParams.get('invoice_id'));
      if (!invoiceId) return apiFail('invoice_id is required');
      return apiOk(await getInvoiceDetail(ctx.db, invoiceId));
    }

    if (folioIdParam) {
      const folioId = Number(folioIdParam);
      if (!folioId) return apiFail('Invalid folio_id');
      const data = await getFolioDetail(ctx.db, folioId);
      const refunds = await listRefunds(ctx.db, folioId);
      const invoices = await listInvoices(ctx.db, ctx.propertyId, folioId);
      return apiOk({ ...data, refunds, invoices });
    }

    const data = await listFolios(ctx.db, ctx.propertyId);
    return apiOk(data);
  } catch (e) {
    console.error(e);
    return apiFail('Failed to load billing data', 500);
  }
}

export async function POST(request: NextRequest) {
  const ctx = await requireTenant();
  if (!isTenantContext(ctx)) return ctx;
  try {
    const body = await request.json();
    const type = String(body.type || '').trim();

    if (type === 'tax_rate') {
      const denied = requireTenantRoles(ctx, ['owner', 'admin', 'finance']);
      if (denied) return denied;
      const id = await saveTaxRate(ctx.db, ctx.propertyId, {
        id: body.id ? Number(body.id) : undefined,
        name: String(body.name || '').trim(),
        rate_percent: Number(body.rate_percent),
        applies_to: body.applies_to ? String(body.applies_to) : 'all',
        is_inclusive: Boolean(body.is_inclusive),
        is_active: body.is_active !== false,
      });
      return apiOk({ id });
    }

    if (type === 'tax_rate_delete') {
      const denied = requireTenantRoles(ctx, ['owner', 'admin', 'finance']);
      if (denied) return denied;
      await deleteTaxRate(ctx.db, ctx.propertyId, Number(body.id));
      return apiOk({ deleted: true });
    }

    if (type === 'night_audit_preview') {
      const date = String(body.business_date || formatLocalDateIso()).slice(0, 10);
      return apiOk(await previewNightAudit(ctx.db, ctx.propertyId, date));
    }

    if (type === 'night_audit_run') {
      const denied = requireTenantRoles(ctx, ['owner', 'admin', 'finance', 'manager']);
      if (denied) return denied;
      const date = String(body.business_date || formatLocalDateIso()).slice(0, 10);
      const result = await runNightAudit(ctx.db, ctx.propertyId, ctx.session.userId, date);
      return apiOk(result);
    }

    const folioId = Number(body.folio_id);
    if (!folioId) {
      return apiFail('folio_id is required');
    }

    if (type === 'charge') {
      const description = String(body.description || '').trim();
      const category = String(body.category || '').trim();
      const amount = Number(body.amount);

      if (!description || !category || Number.isNaN(amount)) {
        return apiFail('description, category, and amount are required for charge');
      }

      const balance = await addFolioChargeWithTax(ctx.db, ctx.propertyId, folioId, ctx.session.userId, {
        description,
        category,
        amount,
        quantity: body.quantity ? Number(body.quantity) : undefined,
      });
      return apiOk({ folio_id: folioId, balance });
    }

    if (type === 'payment') {
      let method = String(body.method || '').trim();
      const amount = Number(body.amount);
      let reference = body.reference ? String(body.reference) : undefined;

      if (!method || Number.isNaN(amount)) {
        return apiFail('method and amount are required for payment');
      }

      if (method === 'paystack') {
        const paystackRef = String(body.reference || '').trim();
        if (!paystackRef) return apiFail('Paystack payment reference is required.');

        const companyId = ctx.session.companyId;
        if (!companyId) return apiFail('Hotel context missing.', 400);

        const company = await getCompanyBySessionId(companyId);
        if (!company) return apiFail('Hotel not found.', 404);

        const creds = getPaystackRuntimeCredentials(company);
        if (!creds.enabled || !creds.secretKey) {
          return apiFail('Paystack is not configured.', 400);
        }

        const verified = await paystackVerify(creds.secretKey, paystackRef);
        if (Math.abs(verified.amount - amount) > 0.01) {
          return apiFail('Paystack amount does not match the payment total.');
        }

        method = 'paystack';
        reference = verified.reference;
      }

      const balance = await addPayment(ctx.db, folioId, ctx.session.userId, {
        method,
        amount,
        reference,
      });
      await createRoleNotification(ctx.db, ['owner', 'admin', 'finance', 'manager'], {
        type: 'payment',
        title: 'Payment received',
        body: `${method} payment of ${amount.toFixed(2)} on folio #${folioId}`,
        link: '/billing',
      });
      return apiOk({ folio_id: folioId, balance });
    }

    if (type === 'refund') {
      const denied = requireTenantRoles(ctx, ['owner', 'admin', 'finance', 'manager']);
      if (denied) return denied;
      const amount = Number(body.amount);
      const method = String(body.method || 'cash').trim();
      if (!amount || Number.isNaN(amount)) return apiFail('amount is required for refund');
      const balance = await createRefund(ctx.db, folioId, ctx.session.userId, {
        amount,
        method,
        reason: body.reason ? String(body.reason) : undefined,
        payment_id: body.payment_id ? Number(body.payment_id) : undefined,
        reference: body.reference ? String(body.reference) : undefined,
      });
      return apiOk({ folio_id: folioId, balance });
    }

    if (type === 'invoice') {
      const invoice = await generateInvoice(ctx.db, ctx.propertyId, folioId, ctx.session.userId);
      return apiOk(invoice);
    }

    return apiFail('Unknown billing action type');
  } catch (e) {
    console.error(e);
    const message = e instanceof Error ? e.message : 'Billing action failed';
    return apiFail(message, 500);
  }
}
