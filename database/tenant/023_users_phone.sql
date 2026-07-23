-- Staff phone numbers for SMS alerts (e.g. low kitchen stock)

SET @col_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'users'
    AND COLUMN_NAME = 'phone'
);

SET @sql = IF(
  @col_exists = 0,
  'ALTER TABLE `users` ADD COLUMN `phone` VARCHAR(40) NULL AFTER `email`',
  'SELECT 1'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
