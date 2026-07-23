import type { DbConfig } from '@/lib/db/central';
import { executeTenant, queryTenant } from '@/lib/db/tenant';
import { hashPassword, verifyPassword } from '@/lib/auth/credentials';
import { createGuest } from '@/lib/services/hotel-service';
import { sendGuestSignupOtpEmail } from '@/lib/services/guest-otp-notify';

function generateOtp(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function otpExpirySql() {
  return new Date(Date.now() + 15 * 60 * 1000);
}

export async function registerGuestAccount(
  db: DbConfig,
  input: {
    first_name: string;
    last_name: string;
    email: string;
    phone?: string;
    password: string;
  },
  notify?: { companyId: number; hotelName: string }
) {
  const email = input.email.trim().toLowerCase();
  const existing = await queryTenant<Array<{ id: number; email_verified: number }>>(
    db,
    `SELECT id, COALESCE(email_verified, 0) AS email_verified FROM guest_accounts WHERE email = :email LIMIT 1`,
    { email }
  );
  if (existing[0]?.email_verified) {
    throw new Error('An account with this email already exists.');
  }

  let guestRows = await queryTenant<Array<{ id: number }>>(
    db,
    `SELECT id FROM guests WHERE LOWER(email) = :email LIMIT 1`,
    { email }
  );
  let guestId = guestRows[0]?.id;
  if (!guestId) {
    guestId = await createGuest(db, {
      first_name: input.first_name,
      last_name: input.last_name,
      email,
      phone: input.phone,
    });
  } else {
    await executeTenant(
      db,
      `UPDATE guests SET first_name = :firstName, last_name = :lastName, phone = COALESCE(:phone, phone)
       WHERE id = :guestId`,
      {
        guestId,
        firstName: input.first_name,
        lastName: input.last_name,
        phone: input.phone || null,
      }
    );
  }

  const passwordHash = await hashPassword(input.password);
  const otp = generateOtp();
  const otpExpires = otpExpirySql();

  let accountId: number;
  if (existing[0]) {
    accountId = existing[0].id;
    await executeTenant(
      db,
      `UPDATE guest_accounts
       SET guest_id = :guestId, password_hash = :hash, is_active = 1,
           email_verified = 0, otp_code = :otp, otp_expires_at = :expires
       WHERE id = :id`,
      { guestId, hash: passwordHash, otp, expires: otpExpires, id: accountId }
    );
  } else {
    const result = await executeTenant(
      db,
      `INSERT INTO guest_accounts
         (guest_id, email, password_hash, email_verified, otp_code, otp_expires_at)
       VALUES (:guestId, :email, :hash, 0, :otp, :expires)`,
      { guestId, email, hash: passwordHash, otp, expires: otpExpires }
    );
    accountId = Number((result as { insertId?: number }).insertId);
  }

  const name = `${input.first_name} ${input.last_name}`.trim();
  if (notify) {
    await sendGuestSignupOtpEmail(notify.companyId, {
      email,
      name,
      otp,
      hotelName: notify.hotelName,
    });
  }

  return {
    accountId,
    guestId,
    email,
    name,
    requiresOtp: true as const,
  };
}

export async function verifyGuestSignupOtp(
  db: DbConfig,
  email: string,
  otp: string
) {
  const normalized = email.trim().toLowerCase();
  const code = otp.trim();
  const rows = await queryTenant<
    Array<{
      id: number;
      guest_id: number;
      email: string;
      otp_code: string | null;
      otp_expires_at: Date | string | null;
      first_name: string;
      last_name: string;
    }>
  >(
    db,
    `SELECT ga.id, ga.guest_id, ga.email, ga.otp_code, ga.otp_expires_at,
            g.first_name, g.last_name
     FROM guest_accounts ga
     INNER JOIN guests g ON g.id = ga.guest_id
     WHERE ga.email = :email AND ga.is_active = 1 LIMIT 1`,
    { email: normalized }
  );
  const row = rows[0];
  if (!row) throw new Error('Account not found.');
  if (!row.otp_code || row.otp_code !== code) throw new Error('Invalid verification code.');
  const expires = row.otp_expires_at ? new Date(row.otp_expires_at).getTime() : 0;
  if (!expires || expires < Date.now()) throw new Error('Verification code has expired. Please register again.');

  await executeTenant(
    db,
    `UPDATE guest_accounts
     SET email_verified = 1, otp_code = NULL, otp_expires_at = NULL
     WHERE id = :id`,
    { id: row.id }
  );

  return {
    accountId: row.id,
    guestId: row.guest_id,
    email: row.email,
    name: `${row.first_name} ${row.last_name}`.trim(),
  };
}

export async function resendGuestSignupOtp(
  db: DbConfig,
  email: string,
  notify: { companyId: number; hotelName: string }
) {
  const normalized = email.trim().toLowerCase();
  const rows = await queryTenant<
    Array<{ id: number; email_verified: number; first_name: string; last_name: string }>
  >(
    db,
    `SELECT ga.id, COALESCE(ga.email_verified, 0) AS email_verified, g.first_name, g.last_name
     FROM guest_accounts ga
     INNER JOIN guests g ON g.id = ga.guest_id
     WHERE ga.email = :email AND ga.is_active = 1 LIMIT 1`,
    { email: normalized }
  );
  const row = rows[0];
  if (!row) throw new Error('Account not found.');
  if (row.email_verified) throw new Error('This email is already verified. Please sign in.');

  const otp = generateOtp();
  const otpExpires = otpExpirySql();
  await executeTenant(
    db,
    `UPDATE guest_accounts SET otp_code = :otp, otp_expires_at = :expires WHERE id = :id`,
    { otp, expires: otpExpires, id: row.id }
  );

  const name = `${row.first_name} ${row.last_name}`.trim();
  await sendGuestSignupOtpEmail(notify.companyId, {
    email: normalized,
    name,
    otp,
    hotelName: notify.hotelName,
  });

  return { email: normalized, name };
}

export async function loginGuestAccount(db: DbConfig, email: string, password: string) {
  const normalized = email.trim().toLowerCase();
  const rows = await queryTenant<
    Array<{
      id: number;
      guest_id: number;
      email: string;
      password_hash: string;
      is_active: number;
      email_verified: number;
      first_name: string;
      last_name: string;
    }>
  >(
    db,
    `SELECT ga.id, ga.guest_id, ga.email, ga.password_hash, ga.is_active,
            COALESCE(ga.email_verified, 1) AS email_verified,
            g.first_name, g.last_name
     FROM guest_accounts ga
     INNER JOIN guests g ON g.id = ga.guest_id
     WHERE ga.email = :email LIMIT 1`,
    { email: normalized }
  );
  const row = rows[0];
  if (!row || !row.is_active) return null;
  if (!(await verifyPassword(password, row.password_hash))) return null;
  if (!row.email_verified) {
    return {
      accountId: row.id,
      guestId: row.guest_id,
      email: row.email,
      name: `${row.first_name} ${row.last_name}`.trim(),
      requiresOtp: true as const,
    };
  }

  return {
    accountId: row.id,
    guestId: row.guest_id,
    email: row.email,
    name: `${row.first_name} ${row.last_name}`.trim(),
    requiresOtp: false as const,
  };
}

export async function getGuestAccountById(db: DbConfig, accountId: number) {
  const rows = await queryTenant<
    Array<{ id: number; guest_id: number; email: string; first_name: string; last_name: string }>
  >(
    db,
    `SELECT ga.id, ga.guest_id, ga.email, g.first_name, g.last_name
     FROM guest_accounts ga
     INNER JOIN guests g ON g.id = ga.guest_id
     WHERE ga.id = :id AND ga.is_active = 1 AND COALESCE(ga.email_verified, 1) = 1 LIMIT 1`,
    { id: accountId }
  );
  const row = rows[0];
  if (!row) return null;
  return {
    accountId: row.id,
    guestId: row.guest_id,
    email: row.email,
    name: `${row.first_name} ${row.last_name}`.trim(),
  };
}
