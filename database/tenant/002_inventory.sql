-- Inventory & procurement (Team Lima)

CREATE TABLE IF NOT EXISTS `suppliers` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `property_id` BIGINT UNSIGNED NOT NULL,
  `name` VARCHAR(150) NOT NULL,
  `contact_name` VARCHAR(120) NULL,
  `email` VARCHAR(150) NULL,
  `phone` VARCHAR(40) NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `suppliers_property_index` (`property_id`),
  CONSTRAINT `suppliers_property_fk` FOREIGN KEY (`property_id`) REFERENCES `properties` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `stock_items` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `property_id` BIGINT UNSIGNED NOT NULL,
  `supplier_id` BIGINT UNSIGNED NULL,
  `name` VARCHAR(150) NOT NULL,
  `sku` VARCHAR(60) NULL,
  `department` VARCHAR(80) NOT NULL DEFAULT 'general',
  `unit` VARCHAR(20) NOT NULL DEFAULT 'unit',
  `quantity_on_hand` DECIMAL(12, 2) NOT NULL DEFAULT 0,
  `reorder_level` DECIMAL(12, 2) NOT NULL DEFAULT 0,
  `unit_cost` DECIMAL(12, 2) NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `stock_items_property_index` (`property_id`),
  KEY `stock_items_low_stock_index` (`quantity_on_hand`, `reorder_level`),
  CONSTRAINT `stock_items_property_fk` FOREIGN KEY (`property_id`) REFERENCES `properties` (`id`) ON DELETE CASCADE,
  CONSTRAINT `stock_items_supplier_fk` FOREIGN KEY (`supplier_id`) REFERENCES `suppliers` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
