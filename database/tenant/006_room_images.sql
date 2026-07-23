-- Room photo URLs (safe re-run on MariaDB/MySQL)

SET @col_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'rooms'
    AND COLUMN_NAME = 'image_url'
);

SET @sql = IF(
  @col_exists = 0,
  'ALTER TABLE `rooms` ADD COLUMN `image_url` VARCHAR(500) NULL AFTER `status`',
  'SELECT 1'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'room_types'
    AND COLUMN_NAME = 'image_url'
);

SET @sql = IF(
  @col_exists = 0,
  'ALTER TABLE `room_types` ADD COLUMN `image_url` VARCHAR(500) NULL AFTER `base_rate`',
  'SELECT 1'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
