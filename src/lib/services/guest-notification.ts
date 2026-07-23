import type { DbConfig } from '@/lib/db/central';
import type { TenantContext } from '@/lib/api/tenant-context';
import {
  getReservationNotificationDetails,
  type CheckoutNotificationDetails,
} from '@/lib/services/hotel-service';
import {
  sendCheckInNotifications,
  sendCheckoutNotifications,
  type NotificationResult,
} from '@/lib/services/notification-service';
import { findCompanyById } from '@/lib/tenant/tenant-service';

function buildNotificationPayload(
  ctx: TenantContext,
  details: CheckoutNotificationDetails,
  logoUrl?: string | null
) {
  return {
    companyId: ctx.session.companyId!,
    guestName: details.guest_name,
    guestEmail: details.guest_email,
    guestPhone: details.guest_phone,
    hotelName: ctx.session.companyName || details.property_name,
    confirmationCode: details.confirmation_code,
    roomNumber: details.room_number,
    balance: Number(details.balance),
    currency: details.currency,
    logoUrl,
    checkInDate: details.check_in_date,
    checkOutDate: details.check_out_date,
  };
}

export async function notifyGuestCheckIn(
  ctx: TenantContext,
  db: DbConfig,
  propertyId: number,
  reservationId: number
): Promise<NotificationResult | null> {
  if (!ctx.session.companyId) return null;

  const details = await getReservationNotificationDetails(db, propertyId, reservationId);
  if (!details) return null;

  const company = await findCompanyById(ctx.session.companyId);
  return sendCheckInNotifications(buildNotificationPayload(ctx, details, company?.logo_path));
}

export async function notifyGuestCheckOut(
  ctx: TenantContext,
  db: DbConfig,
  propertyId: number,
  reservationId: number
): Promise<NotificationResult | null> {
  if (!ctx.session.companyId) return null;

  const details = await getReservationNotificationDetails(db, propertyId, reservationId);
  if (!details) return null;

  const company = await findCompanyById(ctx.session.companyId);
  return sendCheckoutNotifications(buildNotificationPayload(ctx, details, company?.logo_path));
}
