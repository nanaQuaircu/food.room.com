-- Guest food ordering (menu + orders)

CREATE TABLE IF NOT EXISTS `menu_categories` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `property_id` BIGINT UNSIGNED NOT NULL,
  `name` VARCHAR(120) NOT NULL,
  `sort_order` INT NOT NULL DEFAULT 0,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `menu_categories_property_index` (`property_id`),
  CONSTRAINT `menu_categories_property_fk` FOREIGN KEY (`property_id`) REFERENCES `properties` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `menu_items` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `property_id` BIGINT UNSIGNED NOT NULL,
  `category_id` BIGINT UNSIGNED NOT NULL,
  `name` VARCHAR(150) NOT NULL,
  `description` TEXT NULL,
  `price` DECIMAL(12, 2) NOT NULL DEFAULT 0,
  `image_url` VARCHAR(500) NULL,
  `is_available` TINYINT(1) NOT NULL DEFAULT 1,
  `sort_order` INT NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `menu_items_category_index` (`category_id`),
  CONSTRAINT `menu_items_property_fk` FOREIGN KEY (`property_id`) REFERENCES `properties` (`id`) ON DELETE CASCADE,
  CONSTRAINT `menu_items_category_fk` FOREIGN KEY (`category_id`) REFERENCES `menu_categories` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `food_orders` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `property_id` BIGINT UNSIGNED NOT NULL,
  `guest_id` BIGINT UNSIGNED NULL,
  `reservation_id` BIGINT UNSIGNED NULL,
  `order_type` ENUM('room_service', 'restaurant') NOT NULL DEFAULT 'restaurant',
  `room_number` VARCHAR(20) NULL,
  `status` ENUM('pending', 'preparing', 'ready', 'delivered', 'cancelled') NOT NULL DEFAULT 'pending',
  `total_amount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
  `notes` TEXT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `food_orders_property_status_index` (`property_id`, `status`),
  CONSTRAINT `food_orders_property_fk` FOREIGN KEY (`property_id`) REFERENCES `properties` (`id`) ON DELETE CASCADE,
  CONSTRAINT `food_orders_guest_fk` FOREIGN KEY (`guest_id`) REFERENCES `guests` (`id`) ON DELETE SET NULL,
  CONSTRAINT `food_orders_reservation_fk` FOREIGN KEY (`reservation_id`) REFERENCES `reservations` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `food_order_lines` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `order_id` BIGINT UNSIGNED NOT NULL,
  `menu_item_id` BIGINT UNSIGNED NOT NULL,
  `item_name` VARCHAR(150) NOT NULL,
  `unit_price` DECIMAL(12, 2) NOT NULL,
  `quantity` INT UNSIGNED NOT NULL DEFAULT 1,
  `line_total` DECIMAL(12, 2) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `food_order_lines_order_index` (`order_id`),
  CONSTRAINT `food_order_lines_order_fk` FOREIGN KEY (`order_id`) REFERENCES `food_orders` (`id`) ON DELETE CASCADE,
  CONSTRAINT `food_order_lines_item_fk` FOREIGN KEY (`menu_item_id`) REFERENCES `menu_items` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
