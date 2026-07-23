import { executeTenant, queryTenant } from '@/lib/db/tenant';
import type { DbConfig } from '@/lib/db/central';

export type CreateNotificationInput = {
  userId?: number | null;
  role?: string | null;
  type: string;
  title: string;
  body?: string | null;
  link?: string | null;
};

export async function createNotification(db: DbConfig, input: CreateNotificationInput) {
  await executeTenant(
    db,
    `INSERT INTO notifications (user_id, role, type, title, body, link)
     VALUES (:userId, :role, :type, :title, :body, :link)`,
    {
      userId: input.userId ?? null,
      role: input.role ?? null,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      link: input.link ?? null,
    }
  );
}

export async function createRoleNotification(
  db: DbConfig,
  roles: string[],
  input: Omit<CreateNotificationInput, 'userId' | 'role'>
) {
  for (const role of roles) {
    await createNotification(db, { ...input, role });
  }
}

export async function listNotificationsForUser(
  db: DbConfig,
  userId: number,
  role: string | undefined,
  limit = 30
) {
  return queryTenant<
    Array<{
      id: number;
      type: string;
      title: string;
      body: string | null;
      link: string | null;
      read_at: string | null;
      created_at: string;
    }>
  >(
    db,
    `SELECT id, type, title, body, link, read_at, created_at
     FROM notifications
     WHERE (user_id = :userId OR (user_id IS NULL AND (:role = '' OR role IS NULL OR role = :role)))
     ORDER BY created_at DESC
     LIMIT ${Math.min(Math.max(limit, 1), 100)}`,
    { userId, role: role || '' }
  );
}

export async function countUnreadNotifications(
  db: DbConfig,
  userId: number,
  role: string | undefined
) {
  const rows = await queryTenant<Array<{ c: number }>>(
    db,
    `SELECT COUNT(*) AS c FROM notifications
     WHERE read_at IS NULL
       AND (user_id = :userId OR (user_id IS NULL AND (:role = '' OR role IS NULL OR role = :role)))`,
    { userId, role: role || '' }
  );
  return Number(rows[0]?.c ?? 0);
}

export async function markNotificationRead(db: DbConfig, id: number, userId: number, role?: string) {
  await executeTenant(
    db,
    `UPDATE notifications SET read_at = CURRENT_TIMESTAMP
     WHERE id = :id
       AND read_at IS NULL
       AND (user_id = :userId OR (user_id IS NULL AND (:role = '' OR role IS NULL OR role = :role)))`,
    { id, userId, role: role || '' }
  );
}

export async function markAllNotificationsRead(db: DbConfig, userId: number, role?: string) {
  await executeTenant(
    db,
    `UPDATE notifications SET read_at = CURRENT_TIMESTAMP
     WHERE read_at IS NULL
       AND (user_id = :userId OR (user_id IS NULL AND (:role = '' OR role IS NULL OR role = :role)))`,
    { userId, role: role || '' }
  );
}
