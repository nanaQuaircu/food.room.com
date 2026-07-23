-- Phase B: Warehouse multi-location inventory (stock locations, purchases, transfers, usage, conversions)
-- Safe re-run on MariaDB/MySQL

CREATE TABLE IF NOT EXISTS `stock_locations` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `property_id` BIGINT UNSIGNED NOT NULL,
  `code` VARCHAR(40) NOT NULL,
  `name` VARCHAR(120) NOT NULL,
  `sort_order` INT NOT NULL DEFAULT 0,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `stock_locations_property_code_unique` (`property_id`, `code`),
  CONSTRAINT `stock_locations_property_fk` FOREIGN KEY (`property_id`) REFERENCES `properties` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Extend stock_items with warehouse fields
SET @col_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'stock_items'
    AND COLUMN_NAME = 'category'
);
SET @sql = IF(
  @col_exists = 0,
  'ALTER TABLE `stock_items` ADD COLUMN `category` VARCHAR(80) NULL AFTER `department`',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'stock_items'
    AND COLUMN_NAME = 'purchase_unit'
);
SET @sql = IF(
  @col_exists = 0,
  'ALTER TABLE `stock_items` ADD COLUMN `purchase_unit` VARCHAR(40) NULL AFTER `unit`',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'stock_items'
    AND COLUMN_NAME = 'usage_unit'
);
SET @sql = IF(
  @col_exists = 0,
  'ALTER TABLE `stock_items` ADD COLUMN `usage_unit` VARCHAR(40) NULL AFTER `purchase_unit`',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'stock_items'
    AND COLUMN_NAME = 'conversion_factor'
);
SET @sql = IF(
  @col_exists = 0,
  'ALTER TABLE `stock_items` ADD COLUMN `conversion_factor` DECIMAL(12,4) NOT NULL DEFAULT 1 AFTER `usage_unit`',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS `stock_balances` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `item_id` BIGINT UNSIGNED NOT NULL,
  `location_id` BIGINT UNSIGNED NOT NULL,
  `quantity` DECIMAL(14, 4) NOT NULL DEFAULT 0,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `stock_balances_item_location_unique` (`item_id`, `location_id`),
  KEY `stock_balances_location_idx` (`location_id`),
  CONSTRAINT `stock_balances_item_fk` FOREIGN KEY (`item_id`) REFERENCES `stock_items` (`id`) ON DELETE CASCADE,
  CONSTRAINT `stock_balances_location_fk` FOREIGN KEY (`location_id`) REFERENCES `stock_locations` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `stock_purchases` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `property_id` BIGINT UNSIGNED NOT NULL,
  `location_id` BIGINT UNSIGNED NOT NULL,
  `supplier_id` BIGINT UNSIGNED NULL,
  `reference` VARCHAR(40) NOT NULL,
  `purchase_date` DATE NOT NULL,
  `total_amount` DECIMAL(14, 2) NOT NULL DEFAULT 0,
  `notes` TEXT NULL,
  `created_by` BIGINT UNSIGNED NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `stock_purchases_property_reference_unique` (`property_id`, `reference`),
  KEY `stock_purchases_location_idx` (`location_id`),
  CONSTRAINT `stock_purchases_property_fk` FOREIGN KEY (`property_id`) REFERENCES `properties` (`id`) ON DELETE CASCADE,
  CONSTRAINT `stock_purchases_location_fk` FOREIGN KEY (`location_id`) REFERENCES `stock_locations` (`id`) ON DELETE CASCADE,
  CONSTRAINT `stock_purchases_supplier_fk` FOREIGN KEY (`supplier_id`) REFERENCES `suppliers` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `stock_purchase_lines` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `purchase_id` BIGINT UNSIGNED NOT NULL,
  `item_id` BIGINT UNSIGNED NOT NULL,
  `quantity` DECIMAL(14, 4) NOT NULL DEFAULT 0,
  `unit_cost` DECIMAL(14, 2) NOT NULL DEFAULT 0,
  `line_total` DECIMAL(14, 2) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `stock_purchase_lines_item_idx` (`item_id`),
  CONSTRAINT `stock_purchase_lines_purchase_fk` FOREIGN KEY (`purchase_id`) REFERENCES `stock_purchases` (`id`) ON DELETE CASCADE,
  CONSTRAINT `stock_purchase_lines_item_fk` FOREIGN KEY (`item_id`) REFERENCES `stock_items` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `stock_transfers` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `property_id` BIGINT UNSIGNED NOT NULL,
  `from_location_id` BIGINT UNSIGNED NOT NULL,
  `to_location_id` BIGINT UNSIGNED NOT NULL,
  `reference` VARCHAR(40) NOT NULL,
  `transfer_date` DATE NOT NULL,
  `notes` TEXT NULL,
  `created_by` BIGINT UNSIGNED NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `stock_transfers_property_reference_unique` (`property_id`, `reference`),
  KEY `stock_transfers_from_idx` (`from_location_id`),
  KEY `stock_transfers_to_idx` (`to_location_id`),
  CONSTRAINT `stock_transfers_property_fk` FOREIGN KEY (`property_id`) REFERENCES `properties` (`id`) ON DELETE CASCADE,
  CONSTRAINT `stock_transfers_from_fk` FOREIGN KEY (`from_location_id`) REFERENCES `stock_locations` (`id`) ON DELETE CASCADE,
  CONSTRAINT `stock_transfers_to_fk` FOREIGN KEY (`to_location_id`) REFERENCES `stock_locations` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `stock_transfer_lines` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `transfer_id` BIGINT UNSIGNED NOT NULL,
  `item_id` BIGINT UNSIGNED NOT NULL,
  `quantity` DECIMAL(14, 4) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `stock_transfer_lines_item_idx` (`item_id`),
  CONSTRAINT `stock_transfer_lines_transfer_fk` FOREIGN KEY (`transfer_id`) REFERENCES `stock_transfers` (`id`) ON DELETE CASCADE,
  CONSTRAINT `stock_transfer_lines_item_fk` FOREIGN KEY (`item_id`) REFERENCES `stock_items` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `stock_usage_logs` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `property_id` BIGINT UNSIGNED NOT NULL,
  `location_id` BIGINT UNSIGNED NOT NULL,
  `item_id` BIGINT UNSIGNED NOT NULL,
  `quantity` DECIMAL(14, 4) NOT NULL DEFAULT 0,
  `usage_date` DATE NOT NULL,
  `notes` VARCHAR(255) NULL,
  `created_by` BIGINT UNSIGNED NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `stock_usage_logs_property_date_idx` (`property_id`, `usage_date`),
  KEY `stock_usage_logs_location_idx` (`location_id`),
  KEY `stock_usage_logs_item_idx` (`item_id`),
  CONSTRAINT `stock_usage_logs_property_fk` FOREIGN KEY (`property_id`) REFERENCES `properties` (`id`) ON DELETE CASCADE,
  CONSTRAINT `stock_usage_logs_location_fk` FOREIGN KEY (`location_id`) REFERENCES `stock_locations` (`id`) ON DELETE CASCADE,
  CONSTRAINT `stock_usage_logs_item_fk` FOREIGN KEY (`item_id`) REFERENCES `stock_items` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `stock_unit_conversions` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `property_id` BIGINT UNSIGNED NOT NULL,
  `item_id` BIGINT UNSIGNED NULL,
  `from_unit` VARCHAR(40) NOT NULL,
  `to_unit` VARCHAR(40) NOT NULL,
  `factor` DECIMAL(14, 6) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `stock_unit_conversions_property_idx` (`property_id`),
  KEY `stock_unit_conversions_item_idx` (`item_id`),
  CONSTRAINT `stock_unit_conversions_property_fk` FOREIGN KEY (`property_id`) REFERENCES `properties` (`id`) ON DELETE CASCADE,
  CONSTRAINT `stock_unit_conversions_item_fk` FOREIGN KEY (`item_id`) REFERENCES `stock_items` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed default locations for property 1 (Warehouse, Kitchen, Cleaners, Front Office)
INSERT IGNORE INTO `stock_locations` (`property_id`, `code`, `name`, `sort_order`, `is_active`)
SELECT 1, 'warehouse', 'Warehouse', 1, 1
WHERE EXISTS (SELECT 1 FROM `properties` WHERE `id` = 1);

INSERT IGNORE INTO `stock_locations` (`property_id`, `code`, `name`, `sort_order`, `is_active`)
SELECT 1, 'kitchen', 'Kitchen', 2, 1
WHERE EXISTS (SELECT 1 FROM `properties` WHERE `id` = 1);

INSERT IGNORE INTO `stock_locations` (`property_id`, `code`, `name`, `sort_order`, `is_active`)
SELECT 1, 'cleaners', 'Cleaners', 3, 1
WHERE EXISTS (SELECT 1 FROM `properties` WHERE `id` = 1);

INSERT IGNORE INTO `stock_locations` (`property_id`, `code`, `name`, `sort_order`, `is_active`)
SELECT 1, 'front_office', 'Front Office', 4, 1
WHERE EXISTS (SELECT 1 FROM `properties` WHERE `id` = 1);
