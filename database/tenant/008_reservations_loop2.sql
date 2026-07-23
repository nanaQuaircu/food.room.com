-- Reservations Loop 2: rate plans, waitlist, overbooking limits

CREATE TABLE IF NOT EXISTS `rate_plans` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `property_id` BIGINT UNSIGNED NOT NULL,
  `room_type_id` BIGINT UNSIGNED NULL,
  `name` VARCHAR(120) NOT NULL,
  `code` VARCHAR(40) NULL,
  `description` VARCHAR(255) NULL,
  `nightly_rate` DECIMAL(12, 2) NOT NULL DEFAULT 0,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `rate_plans_property_index` (`property_id`),
  KEY `rate_plans_room_type_index` (`room_type_id`),
  CONSTRAINT `rate_plans_property_fk` FOREIGN KEY (`property_id`) REFERENCES `properties` (`id`) ON DELETE CASCADE,
  CONSTRAINT `rate_plans_room_type_fk` FOREIGN KEY (`room_type_id`) REFERENCES `room_types` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `room_type_inventory_limits` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `property_id` BIGINT UNSIGNED NOT NULL,
  `room_type_id` BIGINT UNSIGNED NOT NULL,
  `overbook_percent` DECIMAL(5, 2) NOT NULL DEFAULT 0,
  `sell_limit_override` INT UNSIGNED NULL,
  `allow_overbook` TINYINT(1) NOT NULL DEFAULT 0,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `room_type_inventory_limits_unique` (`property_id`, `room_type_id`),
  CONSTRAINT `room_type_inventory_limits_property_fk` FOREIGN KEY (`property_id`) REFERENCES `properties` (`id`) ON DELETE CASCADE,
  CONSTRAINT `room_type_inventory_limits_room_type_fk` FOREIGN KEY (`room_type_id`) REFERENCES `room_types` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `waitlist_entries` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `property_id` BIGINT UNSIGNED NOT NULL,
  `guest_id` BIGINT UNSIGNED NOT NULL,
  `room_type_id` BIGINT UNSIGNED NULL,
  `check_in_date` DATE NOT NULL,
  `check_out_date` DATE NOT NULL,
  `adults` TINYINT UNSIGNED NOT NULL DEFAULT 1,
  `children` TINYINT UNSIGNED NOT NULL DEFAULT 0,
  `status` ENUM('waiting', 'offered', 'booked', 'cancelled', 'expired') NOT NULL DEFAULT 'waiting',
  `notes` TEXT NULL,
  `priority` TINYINT UNSIGNED NOT NULL DEFAULT 5,
  `created_by` BIGINT UNSIGNED NULL,
  `promoted_reservation_id` BIGINT UNSIGNED NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `waitlist_property_status_index` (`property_id`, `status`),
  KEY `waitlist_dates_index` (`check_in_date`, `check_out_date`),
  CONSTRAINT `waitlist_property_fk` FOREIGN KEY (`property_id`) REFERENCES `properties` (`id`) ON DELETE CASCADE,
  CONSTRAINT `waitlist_guest_fk` FOREIGN KEY (`guest_id`) REFERENCES `guests` (`id`) ON DELETE CASCADE,
  CONSTRAINT `waitlist_room_type_fk` FOREIGN KEY (`room_type_id`) REFERENCES `room_types` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Add rate_plan_id to reservations (idempotent-ish: ignore if already present via procedure-free approach)
SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'reservations'
    AND COLUMN_NAME = 'rate_plan_id'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE `reservations` ADD COLUMN `rate_plan_id` BIGINT UNSIGNED NULL AFTER `room_type_id`, ADD KEY `reservations_rate_plan_index` (`rate_plan_id`)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
