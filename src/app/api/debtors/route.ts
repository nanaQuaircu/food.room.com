import { NextRequest } from 'next/server';
import { requireTenant, isTenantContext, requireTenantRoles } from '@/lib/api/tenant-context';
import { apiOk, apiFail } from '@/lib/api/json';
import {
  listCorporateAccounts,
  createCorporateAccount,
  updateCorporateAccount,
  listDebtorsMasterLedger,
  listPaymentLog,
  companySummary,
  postDebtorPayment,
  assignReservationToCorporate,
  importDebtorLedgerRows,
  type DebtorImportRow,
} from '@/lib/services/debtors-service';

export async function GET(request: NextRequest) {
  const ctx = await requireTenant();
  if (!isTenantContext(ctx)) return ctx;
  try {
    const action = request.nextUrl.searchParams.get('action') || 'ledger';

    if (action === 'accounts') {
      return apiOk(await listCorporateAccounts(ctx.db, ctx.propertyId));
    }

    if (action === 'ledger') {
      const corporateAccountId = request.nextUrl.searchParams.get('corporate_account_id');
      const status = request.nextUrl.searchParams.get('status');
      const ledger = await listDebtorsMasterLedger(ctx.db, ctx.propertyId, {
        corporate_account_id: corporateAccountId ? Number(corporateAccountId) : undefined,
        status: status || undefined,
      });
      return apiOk(ledger);
    }

    if (action === 'payments') {
      return apiOk(await listPaymentLog(ctx.db, ctx.propertyId));
    }

    if (action === 'summary') {
      return apiOk(await companySummary(ctx.db, ctx.propertyId));
    }

    return apiFail('Unknown action. Use accounts, ledger, payments, or summary.');
  } catch (e) {
    console.error(e);
    return apiFail('Failed to load debtors data', 500);
  }
}

export async function POST(request: NextRequest) {
  const ctx = await requireTenant();
  if (!isTenantContext(ctx)) return ctx;
  try {
    const body = await request.json();
    const action = String(body.action || '').trim();

    if (action === 'account') {
      const denied = requireTenantRoles(ctx, ['owner', 'admin', 'manager', 'finance']);
      if (denied) return denied;

      if (body.id) {
        await updateCorporateAccount(ctx.db, ctx.propertyId, Number(body.id), {
          name: body.name !== undefined ? String(body.name) : undefined,
          contact_name: body.contact_name !== undefined ? String(body.contact_name || '') : undefined,
          email: body.email !== undefined ? String(body.email || '') : undefined,
          phone: body.phone !== undefined ? String(body.phone || '') : undefined,
          credit_limit: body.credit_limit !== undefined ? Number(body.credit_limit) : undefined,
          notes: body.notes !== undefined ? String(body.notes || '') : undefined,
          is_active: body.is_active !== undefined ? Boolean(body.is_active) : undefined,
        });
        return apiOk({ id: Number(body.id) });
      }

      const name = String(body.name || '').trim();
      if (!name) return apiFail('name is required for a corporate account');

      const id = await createCorporateAccount(ctx.db, ctx.propertyId, {
        name,
        contact_name: body.contact_name ? String(body.contact_name) : undefined,
        email: body.email ? String(body.email) : undefined,
        phone: body.phone ? String(body.phone) : undefined,
        credit_limit: body.credit_limit !== undefined ? Number(body.credit_limit) : undefined,
        notes: body.notes ? String(body.notes) : undefined,
      });
      return apiOk({ id });
    }

    if (action === 'payment') {
      const denied = requireTenantRoles(ctx, ['owner', 'admin', 'manager', 'finance', 'front_desk']);
      if (denied) return denied;

      const folioId = Number(body.folio_id);
      const method = String(body.method || '').trim();
      const amount = Number(body.amount);
      if (!folioId || !method || !amount || Number.isNaN(amount)) {
        return apiFail('folio_id, method, and amount are required for a payment');
      }

      const balance = await postDebtorPayment(ctx.db, ctx.propertyId, folioId, ctx.session.userId, {
        method,
        amount,
        reference: body.reference ? String(body.reference) : undefined,
      });
      return apiOk({ folio_id: folioId, balance });
    }

    if (action === 'assign') {
      const denied = requireTenantRoles(ctx, ['owner', 'admin', 'manager', 'finance', 'front_desk']);
      if (denied) return denied;

      const reservationId = Number(body.reservation_id);
      const corporateAccountId = Number(body.corporate_account_id);
      if (!reservationId || !corporateAccountId) {
        return apiFail('reservation_id and corporate_account_id are required');
      }

      await assignReservationToCorporate(ctx.db, ctx.propertyId, reservationId, corporateAccountId);
      return apiOk({ reservation_id: reservationId, corporate_account_id: corporateAccountId });
    }

    if (action === 'import') {
      const denied = requireTenantRoles(ctx, ['owner', 'admin', 'manager', 'finance']);
      if (denied) return denied;

      const rows = Array.isArray(body.rows) ? (body.rows as DebtorImportRow[]) : [];
      if (rows.length === 0) {
        return apiFail('rows array is required for import');
      }
      if (rows.length > 500) {
        return apiFail('Import is limited to 500 rows at a time');
      }

      const result = await importDebtorLedgerRows(ctx.db, ctx.propertyId, ctx.session.userId, rows);
      return apiOk(result);
    }

    return apiFail('action must be account, payment, assign, or import');
  } catch (e) {
    console.error(e);
    const message = e instanceof Error ? e.message : 'Debtors action failed';
    return apiFail(message, 500);
  }
}
