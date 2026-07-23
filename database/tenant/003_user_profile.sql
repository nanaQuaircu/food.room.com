-- User profile fields (safe re-run on MariaDB/MySQL)

SET @col_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'users'
    AND COLUMN_NAME = 'avatar_url'
);

SET @sql = IF(
  @col_exists = 0,
  'ALTER TABLE `users` ADD COLUMN `avatar_url` VARCHAR(500) NULL AFTER `email`',
  'SELECT 1'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
