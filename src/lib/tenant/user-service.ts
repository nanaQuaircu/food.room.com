import { DEFAULT_PASSWORD } from '@/lib/config';
import { hashPassword } from '@/lib/auth/credentials';
import { executeTenant, queryTenant } from '@/lib/db/tenant';
import type { DbConfig } from '@/lib/db/central';

export type StaffRole =
  | 'admin'
  | 'manager'
  | 'front_desk'
  | 'housekeeping'
  | 'finance'
  | 'cook'
  | 'chef'
  | 'kitchen_supervisor'
  | 'security'
  | 'driver';

export async function createStaffUser(
  dbConfig: DbConfig,
  input: {
    propertyId: number;
    name: string;
    email: string;
    role: StaffRole;
    phone?: string | null;
  }
) {
  const email = input.email.trim().toLowerCase();
  const temporaryPassword = DEFAULT_PASSWORD;
  const passwordHash = await hashPassword(temporaryPassword);
  const phone = input.phone?.trim() || null;

  try {
    const result = await executeTenant(
      dbConfig,
      `INSERT INTO users (property_id, name, email, phone, password_hash, role, is_active, must_change_password)
       VALUES (:propertyId, :name, :email, :phone, :passwordHash, :role, 1, 1)`,
      {
        propertyId: input.propertyId,
        name: input.name.trim(),
        email,
        phone,
        passwordHash,
        role: input.role,
      }
    );

    return {
      defaultPassword: temporaryPassword,
      insertId: Number((result as { insertId?: number }).insertId ?? 0),
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('Duplicate') || message.includes('duplicate')) {
      throw new Error('A user with this email already exists for this hotel.');
    }
    throw err;
  }
}

export async function resetUserPassword(dbConfig: DbConfig, userId: number) {
  const temporaryPassword = DEFAULT_PASSWORD;
  const passwordHash = await hashPassword(temporaryPassword);
  await executeTenant(
    dbConfig,
    `UPDATE users SET password_hash = :passwordHash, must_change_password = 1 WHERE id = :userId`,
    { passwordHash, userId }
  );
  return temporaryPassword;
}

export async function updateStaffUser(
  dbConfig: DbConfig,
  propertyId: number,
  userId: number,
  input: {
    name: string;
    email: string;
    role: StaffRole | 'owner';
    phone?: string | null;
    is_active?: boolean;
  }
) {
  const rows = await queryTenant<Array<{ id: number; role: string }>>(
    dbConfig,
    `SELECT id, role FROM users WHERE id = :userId AND property_id = :propertyId LIMIT 1`,
    { userId, propertyId }
  );
  const existing = rows[0];
  if (!existing) {
    throw new Error('Staff user not found.');
  }

  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();
  const phone = input.phone !== undefined ? input.phone?.trim() || null : undefined;
  // Preserve owner role — cannot demote/promote via staff edit
  const role = existing.role === 'owner' ? 'owner' : input.role;
  if (
    role !== 'owner' &&
    ![
      'admin',
      'manager',
      'front_desk',
      'housekeeping',
      'finance',
      'cook',
      'chef',
      'kitchen_supervisor',
      'security',
      'driver',
    ].includes(role)
  ) {
    throw new Error('Invalid role.');
  }

  try {
    if (input.is_active !== undefined) {
      await executeTenant(
        dbConfig,
        phone !== undefined
          ? `UPDATE users
             SET name = :name, email = :email, phone = :phone, role = :role, is_active = :isActive
             WHERE id = :userId AND property_id = :propertyId`
          : `UPDATE users
             SET name = :name, email = :email, role = :role, is_active = :isActive
             WHERE id = :userId AND property_id = :propertyId`,
        {
          name,
          email,
          ...(phone !== undefined ? { phone } : {}),
          role,
          isActive: input.is_active ? 1 : 0,
          userId,
          propertyId,
        }
      );
    } else {
      await executeTenant(
        dbConfig,
        phone !== undefined
          ? `UPDATE users
             SET name = :name, email = :email, phone = :phone, role = :role
             WHERE id = :userId AND property_id = :propertyId`
          : `UPDATE users
             SET name = :name, email = :email, role = :role
             WHERE id = :userId AND property_id = :propertyId`,
        {
          name,
          email,
          ...(phone !== undefined ? { phone } : {}),
          role,
          userId,
          propertyId,
        }
      );
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('Duplicate') || message.includes('duplicate')) {
      throw new Error('A user with this email already exists for this hotel.');
    }
    throw err;
  }
}

export async function getUserProfile(dbConfig: DbConfig, userId: number) {
  const rows = await queryTenant<
    Array<{
      id: number;
      name: string;
      email: string;
      role: string;
      avatar_url: string | null;
    }>
  >(
    dbConfig,
    `SELECT id, name, email, role, avatar_url FROM users WHERE id = :userId LIMIT 1`,
    { userId }
  );
  return rows[0] ?? null;
}

export async function updateUserProfile(
  dbConfig: DbConfig,
  userId: number,
  input: { name?: string; avatarUrl?: string | null }
) {
  const sets: string[] = [];
  const params: Record<string, string | number | null> = { userId };

  if (input.name !== undefined) {
    sets.push('name = :name');
    params.name = input.name.trim();
  }
  if (input.avatarUrl !== undefined) {
    sets.push('avatar_url = :avatarUrl');
    params.avatarUrl = input.avatarUrl;
  }

  if (sets.length === 0) return;

  await executeTenant(dbConfig, `UPDATE users SET ${sets.join(', ')} WHERE id = :userId`, params);
}
