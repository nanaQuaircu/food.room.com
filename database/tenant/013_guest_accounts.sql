-- Guest website accounts (separate from staff users)

CREATE TABLE IF NOT EXISTS `guest_accounts` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `guest_id` BIGINT UNSIGNED NOT NULL,
  `email` VARCHAR(150) NOT NULL,
  `password_hash` VARCHAR(255) NOT NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `guest_accounts_email_unique` (`email`),
  KEY `guest_accounts_guest_id_index` (`guest_id`),
  CONSTRAINT `guest_accounts_guest_fk` FOREIGN KEY (`guest_id`) REFERENCES `guests` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `guest_payment_intents` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `reservation_id` BIGINT UNSIGNED NOT NULL,
  `reference` VARCHAR(120) NOT NULL,
  `amount` DECIMAL(12, 2) NOT NULL,
  `currency` VARCHAR(10) NOT NULL DEFAULT 'GHS',
  `status` ENUM('pending', 'success', 'failed') NOT NULL DEFAULT 'pending',
  `paid_at` TIMESTAMP NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `guest_payment_intents_reference_unique` (`reference`),
  KEY `guest_payment_intents_reservation_index` (`reservation_id`),
  CONSTRAINT `guest_payment_intents_reservation_fk` FOREIGN KEY (`reservation_id`) REFERENCES `reservations` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
