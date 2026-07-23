-- Platform gaps: promos, cancellation policy, purchase orders, contact inquiries
-- Safe re-run on MariaDB/MySQL

CREATE TABLE IF NOT EXISTS `promo_codes` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `property_id` BIGINT UNSIGNED NOT NULL,
  `code` VARCHAR(40) NOT NULL,
  `description` VARCHAR(255) NULL,
  `discount_type` ENUM('percent', 'fixed') NOT NULL DEFAULT 'percent',
  `discount_value` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  `min_nights` INT NOT NULL DEFAULT 1,
  `valid_from` DATE NULL,
  `valid_to` DATE NULL,
  `max_uses` INT NULL,
  `used_count` INT NOT NULL DEFAULT 0,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `promo_codes_property_code` (`property_id`, `code`),
  CONSTRAINT `promo_codes_property_fk` FOREIGN KEY (`property_id`) REFERENCES `properties` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `purchase_orders` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `property_id` BIGINT UNSIGNED NOT NULL,
  `supplier_id` BIGINT UNSIGNED NULL,
  `po_number` VARCHAR(40) NOT NULL,
  `status` ENUM('draft', 'ordered', 'received', 'cancelled') NOT NULL DEFAULT 'draft',
  `total_amount` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  `notes` TEXT NULL,
  `created_by` BIGINT UNSIGNED NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `purchase_orders_po_number` (`property_id`, `po_number`),
  CONSTRAINT `purchase_orders_property_fk` FOREIGN KEY (`property_id`) REFERENCES `properties` (`id`) ON DELETE CASCADE,
  CONSTRAINT `purchase_orders_supplier_fk` FOREIGN KEY (`supplier_id`) REFERENCES `suppliers` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `purchase_order_lines` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `purchase_order_id` BIGINT UNSIGNED NOT NULL,
  `stock_item_id` BIGINT UNSIGNED NULL,
  `description` VARCHAR(255) NOT NULL,
  `quantity` DECIMAL(12, 2) NOT NULL DEFAULT 1.00,
  `unit_cost` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  `line_total` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  PRIMARY KEY (`id`),
  CONSTRAINT `po_lines_po_fk` FOREIGN KEY (`purchase_order_id`) REFERENCES `purchase_orders` (`id`) ON DELETE CASCADE,
  CONSTRAINT `po_lines_stock_fk` FOREIGN KEY (`stock_item_id`) REFERENCES `stock_items` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `guest_contact_inquiries` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `property_id` BIGINT UNSIGNED NOT NULL,
  `name` VARCHAR(120) NOT NULL,
  `email` VARCHAR(190) NOT NULL,
  `subject` VARCHAR(255) NULL,
  `message` TEXT NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  CONSTRAINT `guest_contact_property_fk` FOREIGN KEY (`property_id`) REFERENCES `properties` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET @col_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'properties'
    AND COLUMN_NAME = 'cancellation_free_days'
);
SET @sql = IF(
  @col_exists = 0,
  'ALTER TABLE `properties` ADD COLUMN `cancellation_free_days` INT NOT NULL DEFAULT 2 AFTER `currency`',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'properties'
    AND COLUMN_NAME = 'cancellation_penalty_pct'
);
SET @sql = IF(
  @col_exists = 0,
  'ALTER TABLE `properties` ADD COLUMN `cancellation_penalty_pct` DECIMAL(5, 2) NOT NULL DEFAULT 50.00 AFTER `cancellation_free_days`',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Extend user roles for worker portals
SET @sql = 'ALTER TABLE `users`
  MODIFY COLUMN `role` ENUM(
    ''owner'',''admin'',''manager'',''front_desk'',''housekeeping'',''finance'',
    ''cook'',''chef'',''kitchen_supervisor'',''security'',''driver''
  ) NOT NULL DEFAULT ''front_desk''';
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'food_orders'
    AND COLUMN_NAME = 'delivery_type'
);
SET @sql = IF(
  @col_exists = 0,
  'ALTER TABLE `food_orders`
     ADD COLUMN `delivery_type` ENUM(''pickup'',''room_service'',''hubtel'') NOT NULL DEFAULT ''room_service'' AFTER `order_type`',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'food_orders'
    AND COLUMN_NAME = 'delivery_address'
);
SET @sql = IF(
  @col_exists = 0,
  'ALTER TABLE `food_orders` ADD COLUMN `delivery_address` VARCHAR(255) NULL AFTER `room_number`',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'food_orders'
    AND COLUMN_NAME = 'delivery_provider'
);
SET @sql = IF(
  @col_exists = 0,
  'ALTER TABLE `food_orders` ADD COLUMN `delivery_provider` VARCHAR(50) NULL AFTER `delivery_address`',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'food_orders'
    AND COLUMN_NAME = 'delivery_fee'
);
SET @sql = IF(
  @col_exists = 0,
  'ALTER TABLE `food_orders` ADD COLUMN `delivery_fee` DECIMAL(12,2) NOT NULL DEFAULT 0.00 AFTER `total_amount`',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'food_orders'
    AND COLUMN_NAME = 'charged_to_folio'
);
SET @sql = IF(
  @col_exists = 0,
  'ALTER TABLE `food_orders` ADD COLUMN `charged_to_folio` TINYINT(1) NOT NULL DEFAULT 0 AFTER `total_amount`',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'food_orders'
    AND COLUMN_NAME = 'payment_status'
);
SET @sql = IF(
  @col_exists = 0,
  'ALTER TABLE `food_orders`
     ADD COLUMN `payment_status` ENUM(''pending'',''paid'',''failed'') NOT NULL DEFAULT ''pending'' AFTER `charged_to_folio`',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'food_orders'
    AND COLUMN_NAME = 'payment_reference'
);
SET @sql = IF(
  @col_exists = 0,
  'ALTER TABLE `food_orders` ADD COLUMN `payment_reference` VARCHAR(120) NULL AFTER `payment_status`',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'food_order_payment_intents'
);
SET @sql = IF(
  @col_exists = 0,
  'CREATE TABLE `food_order_payment_intents` (
      `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      `food_order_id` BIGINT UNSIGNED NOT NULL,
      `reference` VARCHAR(120) NOT NULL,
      `amount` DECIMAL(12,2) NOT NULL,
      `currency` VARCHAR(10) NOT NULL DEFAULT ''GHS'',
      `status` ENUM(''pending'',''success'',''failed'') NOT NULL DEFAULT ''pending'',
      `paid_at` TIMESTAMP NULL,
      `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (`id`),
      UNIQUE KEY `food_order_pay_intents_ref_uniq` (`reference`),
      KEY `food_order_pay_intents_order_idx` (`food_order_id`),
      CONSTRAINT `food_order_pay_intents_order_fk` FOREIGN KEY (`food_order_id`) REFERENCES `food_orders` (`id`) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @table_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'maintenance_logs'
);
SET @sql = IF(
  @table_exists = 0,
  'CREATE TABLE `maintenance_logs` (
      `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      `property_id` BIGINT UNSIGNED NOT NULL,
      `room_id` BIGINT UNSIGNED NULL,
      `location` VARCHAR(160) NOT NULL,
      `item_category` VARCHAR(120) NOT NULL,
      `priority_level` ENUM(''low'',''medium'',''high'',''critical'') NOT NULL DEFAULT ''medium'',
      `action_required` VARCHAR(160) NOT NULL,
      `reported_date` DATE NOT NULL,
      `cash_disbursed` TINYINT(1) NOT NULL DEFAULT 0,
      `action_taken` VARCHAR(160) NULL,
      `cash_disbursed_on` DATE NULL,
      `estimated_cost` DECIMAL(12,2) NULL,
      `current_status` ENUM(''reported'',''scheduled'',''in_progress'',''fixed'',''pending_vendor'',''cancelled'') NOT NULL DEFAULT ''reported'',
      `date_fixed` DATE NULL,
      `remarks` TEXT NULL,
      `reported_by` BIGINT UNSIGNED NULL,
      `assigned_to` BIGINT UNSIGNED NULL,
      `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (`id`),
      KEY `maintenance_logs_property_status_idx` (`property_id`, `current_status`),
      KEY `maintenance_logs_room_idx` (`room_id`),
      CONSTRAINT `maintenance_logs_property_fk` FOREIGN KEY (`property_id`) REFERENCES `properties` (`id`) ON DELETE CASCADE,
      CONSTRAINT `maintenance_logs_room_fk` FOREIGN KEY (`room_id`) REFERENCES `rooms` (`id`) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'properties'
    AND COLUMN_NAME = 'security_deposit_amount'
);
SET @sql = IF(
  @col_exists = 0,
  'ALTER TABLE `properties` ADD COLUMN `security_deposit_amount` DECIMAL(12, 2) NOT NULL DEFAULT 100.00 AFTER `cancellation_penalty_pct`',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'reservations'
    AND COLUMN_NAME = 'promo_code'
);
SET @sql = IF(
  @col_exists = 0,
  'ALTER TABLE `reservations` ADD COLUMN `promo_code` VARCHAR(40) NULL AFTER `upsells`',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'reservations'
    AND COLUMN_NAME = 'promo_discount'
);
SET @sql = IF(
  @col_exists = 0,
  'ALTER TABLE `reservations` ADD COLUMN `promo_discount` DECIMAL(12, 2) NOT NULL DEFAULT 0.00 AFTER `promo_code`',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Guest signup email OTP verification
SET @col_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'guest_accounts'
    AND COLUMN_NAME = 'email_verified'
);
SET @sql = IF(
  @col_exists = 0,
  'ALTER TABLE `guest_accounts` ADD COLUMN `email_verified` TINYINT(1) NOT NULL DEFAULT 0 AFTER `is_active`',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'guest_accounts'
    AND COLUMN_NAME = 'otp_code'
);
SET @sql = IF(
  @col_exists = 0,
  'ALTER TABLE `guest_accounts` ADD COLUMN `otp_code` VARCHAR(10) NULL AFTER `email_verified`',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'guest_accounts'
    AND COLUMN_NAME = 'otp_expires_at'
);
SET @sql = IF(
  @col_exists = 0,
  'ALTER TABLE `guest_accounts` ADD COLUMN `otp_expires_at` TIMESTAMP NULL AFTER `otp_code`',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
