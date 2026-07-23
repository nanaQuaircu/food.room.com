import type { DbConfig } from '@/lib/db/central';
import { executeTenant, queryTenant } from '@/lib/db/tenant';

export type ContactInquiryStatus = 'new' | 'read' | 'archived';

export type ContactInquiry = {
  id: number;
  name: string;
  email: string;
  subject: string | null;
  message: string;
  status: ContactInquiryStatus;
  staff_notes: string | null;
  handled_at: string | null;
  created_at: string;
};

export async function listContactInquiries(
  db: DbConfig,
  propertyId: number,
  status?: ContactInquiryStatus | 'all' | 'open'
) {
  let filter = "AND status <> 'archived'";
  let statusParam: string | null = null;

  if (status === 'all') {
    filter = '';
  } else if (status === 'new' || status === 'read' || status === 'archived') {
    filter = 'AND status = :status';
    statusParam = status;
  }

  const rows = await queryTenant<ContactInquiry[]>(
    db,
    `SELECT id, name, email, subject, message, status, staff_notes,
            handled_at, created_at
     FROM guest_contact_inquiries
     WHERE property_id = :propertyId ${filter}
     ORDER BY
       FIELD(status, 'new', 'read', 'archived'),
       created_at DESC
     LIMIT 200`,
    { propertyId, status: statusParam }
  );

  return rows;
}

export async function countNewContactInquiries(db: DbConfig, propertyId: number) {
  const rows = await queryTenant<Array<{ c: number }>>(
    db,
    `SELECT COUNT(*) AS c FROM guest_contact_inquiries
     WHERE property_id = :propertyId AND status = 'new'`,
    { propertyId }
  );
  return Number(rows[0]?.c ?? 0);
}

export async function updateContactInquiry(
  db: DbConfig,
  propertyId: number,
  id: number,
  input: { status?: ContactInquiryStatus; staff_notes?: string | null }
) {
  const existing = await queryTenant<Array<{ id: number; status: string }>>(
    db,
    `SELECT id, status FROM guest_contact_inquiries
     WHERE id = :id AND property_id = :propertyId LIMIT 1`,
    { id, propertyId }
  );
  if (!existing[0]) throw new Error('Inquiry not found.');

  const nextStatus = input.status ?? existing[0].status;
  const markHandled = nextStatus === 'read' || nextStatus === 'archived';

  await executeTenant(
    db,
    `UPDATE guest_contact_inquiries
     SET status = :status,
         staff_notes = COALESCE(:notes, staff_notes),
         handled_at = CASE
           WHEN :markHandled = 1 THEN COALESCE(handled_at, CURRENT_TIMESTAMP)
           ELSE handled_at
         END
     WHERE id = :id AND property_id = :propertyId`,
    {
      id,
      propertyId,
      status: nextStatus,
      notes: input.staff_notes === undefined ? null : input.staff_notes,
      markHandled: markHandled ? 1 : 0,
    }
  );

  return { id, status: nextStatus };
}
