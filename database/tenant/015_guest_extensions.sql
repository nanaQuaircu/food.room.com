-- Guest Extensions Schema
-- Safe re-run on MariaDB/MySQL

CREATE TABLE IF NOT EXISTS `room_type_reviews` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `property_id` BIGINT UNSIGNED NOT NULL,
  `room_type_id` BIGINT UNSIGNED NOT NULL,
  `guest_id` BIGINT UNSIGNED NOT NULL,
  `reservation_id` BIGINT UNSIGNED NOT NULL,
  `rating` TINYINT NOT NULL DEFAULT 5,
  `comment` TEXT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  CONSTRAINT `room_type_reviews_property_fk` FOREIGN KEY (`property_id`) REFERENCES `properties` (`id`) ON DELETE CASCADE,
  CONSTRAINT `room_type_reviews_room_type_fk` FOREIGN KEY (`room_type_id`) REFERENCES `room_types` (`id`) ON DELETE CASCADE,
  CONSTRAINT `room_type_reviews_guest_fk` FOREIGN KEY (`guest_id`) REFERENCES `guests` (`id`) ON DELETE CASCADE,
  CONSTRAINT `room_type_reviews_reservation_fk` FOREIGN KEY (`reservation_id`) REFERENCES `reservations` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `room_holds` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `property_id` BIGINT UNSIGNED NOT NULL,
  `room_type_id` BIGINT UNSIGNED NOT NULL,
  `room_id` BIGINT UNSIGNED NULL,
  `session_id` VARCHAR(100) NOT NULL,
  `expires_at` TIMESTAMP NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  CONSTRAINT `room_holds_property_fk` FOREIGN KEY (`property_id`) REFERENCES `properties` (`id`) ON DELETE CASCADE,
  CONSTRAINT `room_holds_room_type_fk` FOREIGN KEY (`room_type_id`) REFERENCES `room_types` (`id`) ON DELETE CASCADE,
  CONSTRAINT `room_holds_room_fk` FOREIGN KEY (`room_id`) REFERENCES `rooms` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Add digital check-in and upsells columns to reservations
SET @col_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'reservations'
    AND COLUMN_NAME = 'arrival_time'
);
SET @sql = IF(
  @col_exists = 0,
  'ALTER TABLE `reservations` ADD COLUMN `arrival_time` VARCHAR(10) NULL AFTER `notes`',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'reservations'
    AND COLUMN_NAME = 'id_document_url'
);
SET @sql = IF(
  @col_exists = 0,
  'ALTER TABLE `reservations` ADD COLUMN `id_document_url` VARCHAR(500) NULL AFTER `arrival_time`',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'reservations'
    AND COLUMN_NAME = 'upsells'
);
SET @sql = IF(
  @col_exists = 0,
  'ALTER TABLE `reservations` ADD COLUMN `upsells` JSON NULL AFTER `id_document_url`',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add loyalty and preferences to guest_accounts
SET @col_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'guest_accounts'
    AND COLUMN_NAME = 'account_credits'
);
SET @sql = IF(
  @col_exists = 0,
  'ALTER TABLE `guest_accounts` ADD COLUMN `account_credits` DECIMAL(12, 2) NOT NULL DEFAULT 0.00 AFTER `password_hash`',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'guest_accounts'
    AND COLUMN_NAME = 'preferred_room_notes'
);
SET @sql = IF(
  @col_exists = 0,
  'ALTER TABLE `guest_accounts` ADD COLUMN `preferred_room_notes` TEXT NULL AFTER `account_credits`',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
