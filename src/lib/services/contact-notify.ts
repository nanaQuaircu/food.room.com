import nodemailer from 'nodemailer';
import { findCompanyById } from '@/lib/tenant/tenant-service';
import { getEmailCredentials } from '@/lib/services/company-settings-service';

async function getTransporter(companyId: number) {
  const company = await findCompanyById(companyId);
  if (!company) throw new Error('Hotel not found.');
  const email = getEmailCredentials(company);
  if (!email.email_enabled || !email.smtp_password) {
    throw new Error('Email is not configured.');
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
    company,
  };
}

export async function sendContactInquiryToHotel(
  companyId: number,
  hotelEmail: string,
  input: {
    name: string;
    email: string;
    subject: string;
    message: string;
    hotelName: string;
  }
) {
  const { transporter, from } = await getTransporter(companyId);
  const html = `
    <div style="font-family:Segoe UI,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;">
      <h2>New contact inquiry — ${input.hotelName}</h2>
      <p><strong>From:</strong> ${input.name} &lt;${input.email}&gt;</p>
      <p><strong>Subject:</strong> ${input.subject}</p>
      <p style="white-space:pre-wrap;">${input.message}</p>
    </div>
  `;
  await transporter.sendMail({
    from,
    to: hotelEmail,
    replyTo: input.email,
    subject: `[Contact] ${input.subject}`,
    html,
  });
}

export async function sendContactAckToGuest(
  companyId: number,
  input: { name: string; email: string; hotelName: string }
) {
  const { transporter, from } = await getTransporter(companyId);
  await transporter.sendMail({
    from,
    to: input.email,
    subject: `We received your message — ${input.hotelName}`,
    html: `
      <div style="font-family:Segoe UI,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;">
        <h2>Thank you, ${input.name}</h2>
        <p>We received your message and will get back to you shortly.</p>
        <p style="color:#64748b;font-size:14px;">— ${input.hotelName}</p>
      </div>
    `,
  });
}
