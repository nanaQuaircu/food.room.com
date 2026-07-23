-- Contact inquiries: status + staff notes (safe re-run)

SET @col_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'guest_contact_inquiries'
    AND COLUMN_NAME = 'status'
);
SET @sql = IF(
  @col_exists = 0,
  'ALTER TABLE `guest_contact_inquiries` ADD COLUMN `status` ENUM(''new'',''read'',''archived'') NOT NULL DEFAULT ''new'' AFTER `message`',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'guest_contact_inquiries'
    AND COLUMN_NAME = 'staff_notes'
);
SET @sql = IF(
  @col_exists = 0,
  'ALTER TABLE `guest_contact_inquiries` ADD COLUMN `staff_notes` TEXT NULL AFTER `status`',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'guest_contact_inquiries'
    AND COLUMN_NAME = 'handled_at'
);
SET @sql = IF(
  @col_exists = 0,
  'ALTER TABLE `guest_contact_inquiries` ADD COLUMN `handled_at` TIMESTAMP NULL AFTER `staff_notes`',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'guest_contact_inquiries'
    AND INDEX_NAME = 'guest_contact_status_index'
);
SET @sql = IF(
  @idx_exists = 0,
  'ALTER TABLE `guest_contact_inquiries` ADD KEY `guest_contact_status_index` (`property_id`, `status`, `created_at`)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
