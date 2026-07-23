-- Hotel PMS Tenant Core Schema
-- Run per tenant database (hotel_{slug})

CREATE TABLE IF NOT EXISTS `properties` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(150) NOT NULL,
  `code` VARCHAR(20) NOT NULL,
  `address` TEXT NULL,
  `phone` VARCHAR(40) NULL,
  `email` VARCHAR(150) NULL,
  `timezone` VARCHAR(60) NOT NULL DEFAULT 'Africa/Accra',
  `currency` VARCHAR(10) NOT NULL DEFAULT 'GHS',
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `properties_code_unique` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `users` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `property_id` BIGINT UNSIGNED NULL,
  `name` VARCHAR(120) NOT NULL,
  `email` VARCHAR(150) NOT NULL,
  `password_hash` VARCHAR(255) NOT NULL,
  `role` ENUM('owner', 'admin', 'manager', 'front_desk', 'housekeeping', 'finance') NOT NULL DEFAULT 'front_desk',
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `must_change_password` TINYINT(1) NOT NULL DEFAULT 0,
  `last_login_at` TIMESTAMP NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `users_email_unique` (`email`),
  KEY `users_property_id_index` (`property_id`),
  CONSTRAINT `users_property_fk` FOREIGN KEY (`property_id`) REFERENCES `properties` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `room_types` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `property_id` BIGINT UNSIGNED NOT NULL,
  `name` VARCHAR(100) NOT NULL,
  `code` VARCHAR(20) NOT NULL,
  `description` TEXT NULL,
  `base_rate` DECIMAL(12, 2) NOT NULL DEFAULT 0,
  `image_url` VARCHAR(500) NULL,
  `max_occupancy` TINYINT UNSIGNED NOT NULL DEFAULT 2,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `room_types_property_code_unique` (`property_id`, `code`),
  CONSTRAINT `room_types_property_fk` FOREIGN KEY (`property_id`) REFERENCES `properties` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `rooms` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `property_id` BIGINT UNSIGNED NOT NULL,
  `room_type_id` BIGINT UNSIGNED NOT NULL,
  `room_number` VARCHAR(20) NOT NULL,
  `floor` VARCHAR(10) NULL,
  `status` ENUM('vacant', 'occupied', 'dirty', 'clean', 'inspected', 'out_of_order', 'out_of_service') NOT NULL DEFAULT 'vacant',
  `image_url` VARCHAR(500) NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `rooms_property_number_unique` (`property_id`, `room_number`),
  KEY `rooms_status_index` (`status`),
  CONSTRAINT `rooms_property_fk` FOREIGN KEY (`property_id`) REFERENCES `properties` (`id`) ON DELETE CASCADE,
  CONSTRAINT `rooms_room_type_fk` FOREIGN KEY (`room_type_id`) REFERENCES `room_types` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `guests` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `first_name` VARCHAR(80) NOT NULL,
  `last_name` VARCHAR(80) NOT NULL,
  `email` VARCHAR(150) NULL,
  `phone` VARCHAR(40) NULL,
  `id_type` VARCHAR(40) NULL,
  `id_number` VARCHAR(80) NULL,
  `nationality` VARCHAR(80) NULL,
  `is_vip` TINYINT(1) NOT NULL DEFAULT 0,
  `is_blacklisted` TINYINT(1) NOT NULL DEFAULT 0,
  `notes` TEXT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `guests_name_index` (`last_name`, `first_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `reservations` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `property_id` BIGINT UNSIGNED NOT NULL,
  `guest_id` BIGINT UNSIGNED NOT NULL,
  `confirmation_code` VARCHAR(20) NOT NULL,
  `status` ENUM('pending', 'confirmed', 'checked_in', 'checked_out', 'cancelled', 'no_show') NOT NULL DEFAULT 'confirmed',
  `check_in_date` DATE NOT NULL,
  `check_out_date` DATE NOT NULL,
  `adults` TINYINT UNSIGNED NOT NULL DEFAULT 1,
  `children` TINYINT UNSIGNED NOT NULL DEFAULT 0,
  `room_type_id` BIGINT UNSIGNED NULL,
  `room_id` BIGINT UNSIGNED NULL,
  `rate_per_night` DECIMAL(12, 2) NOT NULL DEFAULT 0,
  `total_amount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
  `deposit_amount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
  `source` VARCHAR(40) NOT NULL DEFAULT 'direct',
  `notes` TEXT NULL,
  `created_by` BIGINT UNSIGNED NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `reservations_confirmation_unique` (`confirmation_code`),
  KEY `reservations_dates_index` (`check_in_date`, `check_out_date`),
  KEY `reservations_status_index` (`status`),
  CONSTRAINT `reservations_property_fk` FOREIGN KEY (`property_id`) REFERENCES `properties` (`id`) ON DELETE CASCADE,
  CONSTRAINT `reservations_guest_fk` FOREIGN KEY (`guest_id`) REFERENCES `guests` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `reservations_room_type_fk` FOREIGN KEY (`room_type_id`) REFERENCES `room_types` (`id`) ON DELETE SET NULL,
  CONSTRAINT `reservations_room_fk` FOREIGN KEY (`room_id`) REFERENCES `rooms` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `folios` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `reservation_id` BIGINT UNSIGNED NOT NULL,
  `status` ENUM('open', 'closed', 'void') NOT NULL DEFAULT 'open',
  `balance` DECIMAL(12, 2) NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `folios_reservation_index` (`reservation_id`),
  CONSTRAINT `folios_reservation_fk` FOREIGN KEY (`reservation_id`) REFERENCES `reservations` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `folio_charges` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `folio_id` BIGINT UNSIGNED NOT NULL,
  `description` VARCHAR(255) NOT NULL,
  `category` ENUM('room', 'tax', 'service', 'minibar', 'restaurant', 'other') NOT NULL DEFAULT 'room',
  `amount` DECIMAL(12, 2) NOT NULL,
  `quantity` DECIMAL(8, 2) NOT NULL DEFAULT 1,
  `posted_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `posted_by` BIGINT UNSIGNED NULL,
  PRIMARY KEY (`id`),
  KEY `folio_charges_folio_index` (`folio_id`),
  CONSTRAINT `folio_charges_folio_fk` FOREIGN KEY (`folio_id`) REFERENCES `folios` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `payments` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `folio_id` BIGINT UNSIGNED NOT NULL,
  `method` ENUM('cash', 'card', 'mobile_money', 'bank_transfer', 'other') NOT NULL DEFAULT 'cash',
  `amount` DECIMAL(12, 2) NOT NULL,
  `reference` VARCHAR(100) NULL,
  `received_by` BIGINT UNSIGNED NULL,
  `paid_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `payments_folio_index` (`folio_id`),
  CONSTRAINT `payments_folio_fk` FOREIGN KEY (`folio_id`) REFERENCES `folios` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `housekeeping_tasks` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `property_id` BIGINT UNSIGNED NOT NULL,
  `room_id` BIGINT UNSIGNED NOT NULL,
  `task_type` ENUM('clean', 'inspect', 'maintenance', 'turndown') NOT NULL DEFAULT 'clean',
  `status` ENUM('pending', 'in_progress', 'completed', 'cancelled') NOT NULL DEFAULT 'pending',
  `assigned_to` BIGINT UNSIGNED NULL,
  `notes` TEXT NULL,
  `due_at` TIMESTAMP NULL,
  `completed_at` TIMESTAMP NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `housekeeping_tasks_room_index` (`room_id`),
  KEY `housekeeping_tasks_status_index` (`status`),
  CONSTRAINT `housekeeping_tasks_property_fk` FOREIGN KEY (`property_id`) REFERENCES `properties` (`id`) ON DELETE CASCADE,
  CONSTRAINT `housekeeping_tasks_room_fk` FOREIGN KEY (`room_id`) REFERENCES `rooms` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `audit_logs` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NULL,
  `action` VARCHAR(80) NOT NULL,
  `entity_type` VARCHAR(60) NULL,
  `entity_id` BIGINT UNSIGNED NULL,
  `details` JSON NULL,
  `ip_address` VARCHAR(45) NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `audit_logs_user_index` (`user_id`),
  KEY `audit_logs_created_index` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
