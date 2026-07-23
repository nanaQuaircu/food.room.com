import { NextRequest } from 'next/server';
import { requireTenant, isTenantContext } from '@/lib/api/tenant-context';
import { apiOk, apiFail } from '@/lib/api/json';
import {
  countNewContactInquiries,
  listContactInquiries,
  updateContactInquiry,
  type ContactInquiryStatus,
} from '@/lib/services/contact-inquiries-service';

export async function GET(request: NextRequest) {
  const ctx = await requireTenant();
  if (!isTenantContext(ctx)) return ctx;

  try {
    const statusParam = (request.nextUrl.searchParams.get('status') || 'open') as
      | ContactInquiryStatus
      | 'all'
      | 'open';

    const [items, newCount] = await Promise.all([
      listContactInquiries(ctx.db, ctx.propertyId, statusParam),
      countNewContactInquiries(ctx.db, ctx.propertyId),
    ]);

    return apiOk({ items, new_count: newCount });
  } catch (e) {
    console.error(e);
    return apiFail('Failed to load contact inquiries.', 500);
  }
}

export async function PATCH(request: NextRequest) {
  const ctx = await requireTenant();
  if (!isTenantContext(ctx)) return ctx;

  try {
    const body = await request.json();
    const id = Number(body.id);
    if (!id) return apiFail('id is required.');

    const status = body.status as ContactInquiryStatus | undefined;
    if (status && !['new', 'read', 'archived'].includes(status)) {
      return apiFail('Invalid status.');
    }

    const result = await updateContactInquiry(ctx.db, ctx.propertyId, id, {
      status,
      staff_notes: body.staff_notes !== undefined ? String(body.staff_notes) : undefined,
    });

    return apiOk(result, 'Inquiry updated.');
  } catch (e) {
    console.error(e);
    const message = e instanceof Error ? e.message : 'Failed to update inquiry.';
    return apiFail(message, 400);
  }
}
