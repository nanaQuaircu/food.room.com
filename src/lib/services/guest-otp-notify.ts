import nodemailer from 'nodemailer';
import { findCompanyById } from '@/lib/tenant/tenant-service';
import { getEmailCredentials } from '@/lib/services/company-settings-service';

async function getTransporter(companyId: number) {
  const company = await findCompanyById(companyId);
  if (!company) throw new Error('Hotel not found.');
  const email = getEmailCredentials(company);
  if (!email.email_enabled || !email.smtp_password) {
    throw new Error('Email is not configured for this hotel.');
  }
  const secure = email.smtp_encryption === 'ssl';
  return {
    transporter: nodemailer.createTransport({
      host: email.smtp_host,
      port: email.smtp_port,
      secure,
      auth: { user: email.smtp_username, pass: email.smtp_password },
      tls: email.smtp_encryption === 'tls' ? { rejectUnauthorized: false } : undefined,
    }),
    from: `"${email.mail_from_name}" <${email.mail_from_email}>`,
  };
}

export async function sendGuestSignupOtpEmail(
  companyId: number,
  input: { email: string; name: string; otp: string; hotelName: string }
) {
  const { transporter, from } = await getTransporter(companyId);
  await transporter.sendMail({
    from,
    to: input.email,
    subject: `Your verification code — ${input.hotelName}`,
    html: `
      <div style="font-family:Segoe UI,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;">
        <h2 style="color:#171717;margin:0 0 8px;">Verify your email</h2>
        <p style="color:#475569;margin:0 0 16px;">Hi ${input.name || 'Guest'},</p>
        <p style="color:#334155;margin:0 0 12px;">
          Use this one-time code to finish creating your account at <strong>${input.hotelName}</strong>:
        </p>
        <p style="font-size:28px;letter-spacing:0.2em;font-weight:700;margin:16px 0;color:#171717;">
          ${input.otp}
        </p>
        <p style="color:#64748b;font-size:14px;margin:0;">
          This code expires in 15 minutes. If you did not request an account, you can ignore this email.
        </p>
      </div>
    `,
  });
}
