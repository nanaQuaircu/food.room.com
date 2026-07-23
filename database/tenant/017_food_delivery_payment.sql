-- Food order payment method + Hubtel delivery tracking

SET @col_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'food_orders'
    AND COLUMN_NAME = 'payment_method'
);
SET @sql = IF(
  @col_exists = 0,
  'ALTER TABLE `food_orders`
     ADD COLUMN `payment_method` ENUM(''paystack'',''cash'',''cash_on_delivery'') NOT NULL DEFAULT ''cash''
     AFTER `payment_status`',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'food_orders'
    AND COLUMN_NAME = 'delivery_status'
);
SET @sql = IF(
  @col_exists = 0,
  'ALTER TABLE `food_orders`
     ADD COLUMN `delivery_status` VARCHAR(40) NULL AFTER `delivery_provider`',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'food_orders'
    AND COLUMN_NAME = 'delivery_tracking_ref'
);
SET @sql = IF(
  @col_exists = 0,
  'ALTER TABLE `food_orders`
     ADD COLUMN `delivery_tracking_ref` VARCHAR(120) NULL AFTER `delivery_status`',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'food_orders'
    AND COLUMN_NAME = 'delivery_eta_minutes'
);
SET @sql = IF(
  @col_exists = 0,
  'ALTER TABLE `food_orders`
     ADD COLUMN `delivery_eta_minutes` INT NULL AFTER `delivery_tracking_ref`',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
