import nodemailer from 'nodemailer';
import { formatDisplayDate } from '@/lib/dates/format-display-date';
import { findCompanyById } from '@/lib/tenant/tenant-service';
import {
  getSmsCredentials,
  getEmailCredentials,
} from '@/lib/services/company-settings-service';

export type CheckoutNotificationInput = {
  companyId: number;
  guestName: string;
  guestEmail?: string | null;
  guestPhone?: string | null;
  hotelName: string;
  confirmationCode: string;
  roomNumber?: string | null;
  balance?: number;
  currency?: string;
  logoUrl?: string | null;
  checkInDate?: string | null;
  checkOutDate?: string | null;
};

export type NotificationResult = {
  sms: 'sent' | 'skipped' | 'failed';
  email: 'sent' | 'skipped' | 'failed';
  errors: string[];
};

function appBaseUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '');
}

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D+/g, '');
  if (digits.startsWith('0')) return `233${digits.slice(1)}`;
  return digits;
}

function mnotifyRecipient(phone: string): string {
  const normalized = normalizePhone(phone);
  if (normalized.startsWith('233') && normalized.length === 12) {
    return `0${normalized.slice(3)}`;
  }
  return phone;
}

/** Send SMS via the hotel's mNotify credentials (Settings → Integrations). */
export async function sendStaffSms(companyId: number, phone: string, message: string): Promise<void> {
  return sendSms(companyId, phone, message);
}

async function sendSms(companyId: number, phone: string, message: string): Promise<void> {
  const company = await findCompanyById(companyId);
  if (!company) throw new Error('Hotel not found.');

  const sms = getSmsCredentials(company);
  if (!sms.enabled || !sms.apiKey || !sms.senderId) {
    throw new Error('SMS is not configured for this hotel.');
  }

  const recipient = mnotifyRecipient(phone);
  if (!recipient) throw new Error('Invalid phone number.');

  const url = `https://api.mnotify.com/api/sms/quick?key=${encodeURIComponent(sms.apiKey)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient: [recipient],
      sender: sms.senderId,
      message,
      is_schedule: false,
      schedule_date: '',
    }),
  });

  const json = (await res.json().catch(() => null)) as { status?: string; message?: string } | null;
  if (!res.ok || !json || json.status !== 'success') {
    const detail = json?.message || (await res.text().catch(() => 'Unknown error'));
    throw new Error(`mNotify SMS failed: ${detail}`);
  }
}

function checkoutSmsMessage(input: CheckoutNotificationInput) {
  const room = input.roomNumber ? ` from room ${input.roomNumber}` : '';
  return `Thank you for staying at ${input.hotelName}. You have checked out${room}. Ref: ${input.confirmationCode}. We hope to see you again soon!`;
}

function checkoutEmailHtml(input: CheckoutNotificationInput) {
  const roomLine = input.roomNumber
    ? `<p style="margin:0 0 12px;color:#334155;">Room: <strong>${input.roomNumber}</strong></p>`
    : '';
  const balance =
    input.balance !== undefined && input.balance > 0
      ? `<p style="margin:0 0 12px;color:#334155;">Outstanding balance: <strong>${input.currency || 'GHS'} ${Number(input.balance).toFixed(2)}</strong></p>`
      : '';
  const logoBlock = input.logoUrl
    ? `<img src="${appBaseUrl()}${input.logoUrl}" alt="" width="64" height="64" style="display:block;margin:0 auto 16px;border-radius:12px;" />`
    : '';

  return `
    <div style="font-family:Segoe UI,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;">
      ${logoBlock}
      <h2 style="color:#171717;margin:0 0 8px;">Thank you for your stay</h2>
      <p style="color:#475569;margin:0 0 16px;">Dear ${input.guestName},</p>
      <p style="color:#334155;margin:0 0 12px;">You have been checked out at <strong>${input.hotelName}</strong>.</p>
      ${roomLine}
      <p style="margin:0 0 12px;color:#334155;">Confirmation: <strong>${input.confirmationCode}</strong></p>
      ${balance}
      <p style="color:#64748b;font-size:14px;margin:24px 0 0;">We appreciate your visit and look forward to welcoming you again.</p>
    </div>
  `;
}

async function sendEmail(companyId: number, to: string, subject: string, html: string): Promise<void> {
  const company = await findCompanyById(companyId);
  if (!company) throw new Error('Hotel not found.');

  const email = getEmailCredentials(company);
  if (!email.email_enabled) {
    throw new Error('Email is not enabled for this hotel.');
  }
  if (!email.smtp_password) {
    throw new Error('SMTP password is not configured.');
  }

  const secure = email.smtp_encryption === 'ssl';
  const transporter = nodemailer.createTransport({
    host: email.smtp_host,
    port: email.smtp_port,
    secure,
    auth: {
      user: email.smtp_username,
      pass: email.smtp_password,
    },
    tls: email.smtp_encryption === 'tls' ? { rejectUnauthorized: false } : undefined,
  });

  await transporter.sendMail({
    from: `"${email.mail_from_name}" <${email.mail_from_email}>`,
    to,
    replyTo: email.reply_to_email,
    subject,
    html,
  });
}

function checkinSmsMessage(input: CheckoutNotificationInput) {
  const room = input.roomNumber ? ` Room ${input.roomNumber}.` : '';
  const checkout = input.checkOutDate ? ` Check-out: ${formatDisplayDate(input.checkOutDate)}.` : '';
  return `Welcome to ${input.hotelName}! You are checked in.${room} Ref: ${input.confirmationCode}.${checkout} Enjoy your stay!`;
}

function checkinEmailHtml(input: CheckoutNotificationInput) {
  const roomLine = input.roomNumber
    ? `<p style="margin:0 0 12px;color:#334155;">Room: <strong>${input.roomNumber}</strong></p>`
    : '';
  const stayLine =
    input.checkInDate || input.checkOutDate
      ? `<p style="margin:0 0 12px;color:#334155;">Stay: <strong>${formatDisplayDate(input.checkInDate)}</strong> to <strong>${formatDisplayDate(input.checkOutDate)}</strong></p>`
      : '';
  const logoBlock = input.logoUrl
    ? `<img src="${appBaseUrl()}${input.logoUrl}" alt="" width="64" height="64" style="display:block;margin:0 auto 16px;border-radius:12px;" />`
    : '';

  return `
    <div style="font-family:Segoe UI,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;">
      ${logoBlock}
      <h2 style="color:#171717;margin:0 0 8px;">Welcome — you're checked in</h2>
      <p style="color:#475569;margin:0 0 16px;">Dear ${input.guestName},</p>
      <p style="color:#334155;margin:0 0 12px;">Welcome to <strong>${input.hotelName}</strong>. Your check-in is complete.</p>
      ${roomLine}
      ${stayLine}
      <p style="margin:0 0 12px;color:#334155;">Confirmation: <strong>${input.confirmationCode}</strong></p>
      <p style="color:#64748b;font-size:14px;margin:24px 0 0;">We wish you a pleasant stay. Contact the front desk if you need anything.</p>
    </div>
  `;
}

async function dispatchNotifications(
  input: CheckoutNotificationInput,
  smsMessage: string,
  emailSubject: string,
  emailHtml: string
): Promise<NotificationResult> {
  const result: NotificationResult = { sms: 'skipped', email: 'skipped', errors: [] };

  if (input.guestPhone?.trim()) {
    try {
      await sendSms(input.companyId, input.guestPhone.trim(), smsMessage);
      result.sms = 'sent';
    } catch (error) {
      result.sms = 'failed';
      result.errors.push(error instanceof Error ? error.message : 'SMS failed');
      console.warn('Guest SMS failed:', error);
    }
  }

  if (input.guestEmail?.trim()) {
    try {
      await sendEmail(input.companyId, input.guestEmail.trim(), emailSubject, emailHtml);
      result.email = 'sent';
    } catch (error) {
      result.email = 'failed';
      result.errors.push(error instanceof Error ? error.message : 'Email failed');
      console.warn('Guest email failed:', error);
    }
  }

  return result;
}

export async function sendCheckInNotifications(
  input: CheckoutNotificationInput
): Promise<NotificationResult> {
  return dispatchNotifications(
    input,
    checkinSmsMessage(input),
    `Check-in confirmation — ${input.hotelName}`,
    checkinEmailHtml(input)
  );
}

export async function sendCheckoutNotifications(
  input: CheckoutNotificationInput
): Promise<NotificationResult> {
  return dispatchNotifications(
    input,
    checkoutSmsMessage(input),
    `Check-out confirmation — ${input.hotelName}`,
    checkoutEmailHtml(input)
  );
}

function bookingConfirmationSms(input: CheckoutNotificationInput) {
  const stay =
    input.checkInDate && input.checkOutDate
      ? ` ${formatDisplayDate(input.checkInDate)} to ${formatDisplayDate(input.checkOutDate)}.`
      : '';
  return `Booking confirmed at ${input.hotelName}! Ref: ${input.confirmationCode}.${stay} We look forward to welcoming you.`;
}

function bookingConfirmationEmailHtml(input: CheckoutNotificationInput) {
  const roomLine = input.roomNumber
    ? `<p style="margin:0 0 12px;color:#334155;">Room type: <strong>${input.roomNumber}</strong></p>`
    : '';
  const stayLine =
    input.checkInDate || input.checkOutDate
      ? `<p style="margin:0 0 12px;color:#334155;">Stay: <strong>${formatDisplayDate(input.checkInDate)}</strong> to <strong>${formatDisplayDate(input.checkOutDate)}</strong></p>`
      : '';
  const totalLine =
    input.balance !== undefined
      ? `<p style="margin:0 0 12px;color:#334155;">Total: <strong>${input.currency || 'GHS'} ${Number(input.balance).toFixed(2)}</strong></p>`
      : '';
  const logoBlock = input.logoUrl
    ? `<img src="${appBaseUrl()}${input.logoUrl}" alt="" width="64" height="64" style="display:block;margin:0 auto 16px;border-radius:12px;" />`
    : '';

  return `
    <div style="font-family:Segoe UI,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;">
      ${logoBlock}
      <h2 style="color:#171717;margin:0 0 8px;">Booking confirmed</h2>
      <p style="color:#475569;margin:0 0 16px;">Dear ${input.guestName},</p>
      <p style="color:#334155;margin:0 0 12px;">Thank you for booking with <strong>${input.hotelName}</strong>.</p>
      ${roomLine}
      ${stayLine}
      <p style="margin:0 0 12px;color:#334155;">Confirmation code: <strong>${input.confirmationCode}</strong></p>
      ${totalLine}
      <p style="color:#64748b;font-size:14px;margin:24px 0 0;">Manage your trip online or contact us if you need to modify your reservation.</p>
    </div>
  `;
}

export async function sendBookingConfirmationNotifications(
  input: CheckoutNotificationInput
): Promise<NotificationResult> {
  return dispatchNotifications(
    input,
    bookingConfirmationSms(input),
    `Booking confirmation — ${input.hotelName}`,
    bookingConfirmationEmailHtml(input)
  );
}
