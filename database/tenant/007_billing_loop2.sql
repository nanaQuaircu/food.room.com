-- Billing Loop 2: tax rates, invoices, refunds, night audit

ALTER TABLE `folio_charges`
  MODIFY `category` ENUM(
    'room',
    'tax',
    'service',
    'minibar',
    'restaurant',
    'food',
    'beverage',
    'laundry',
    'misc',
    'other'
  ) NOT NULL DEFAULT 'room';

CREATE TABLE IF NOT EXISTS `tax_rates` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `property_id` BIGINT UNSIGNED NOT NULL,
  `name` VARCHAR(100) NOT NULL,
  `rate_percent` DECIMAL(8, 4) NOT NULL DEFAULT 0,
  `applies_to` ENUM('room', 'service', 'all') NOT NULL DEFAULT 'all',
  `is_inclusive` TINYINT(1) NOT NULL DEFAULT 0,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `tax_rates_property_index` (`property_id`),
  CONSTRAINT `tax_rates_property_fk` FOREIGN KEY (`property_id`) REFERENCES `properties` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `invoices` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `property_id` BIGINT UNSIGNED NOT NULL,
  `folio_id` BIGINT UNSIGNED NOT NULL,
  `invoice_number` VARCHAR(40) NOT NULL,
  `status` ENUM('issued', 'void') NOT NULL DEFAULT 'issued',
  `subtotal` DECIMAL(12, 2) NOT NULL DEFAULT 0,
  `tax_total` DECIMAL(12, 2) NOT NULL DEFAULT 0,
  `total` DECIMAL(12, 2) NOT NULL DEFAULT 0,
  `paid_total` DECIMAL(12, 2) NOT NULL DEFAULT 0,
  `issued_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `issued_by` BIGINT UNSIGNED NULL,
  `notes` TEXT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `invoices_number_unique` (`property_id`, `invoice_number`),
  KEY `invoices_folio_index` (`folio_id`),
  CONSTRAINT `invoices_property_fk` FOREIGN KEY (`property_id`) REFERENCES `properties` (`id`) ON DELETE CASCADE,
  CONSTRAINT `invoices_folio_fk` FOREIGN KEY (`folio_id`) REFERENCES `folios` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `invoice_lines` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `invoice_id` BIGINT UNSIGNED NOT NULL,
  `description` VARCHAR(255) NOT NULL,
  `category` VARCHAR(40) NOT NULL DEFAULT 'other',
  `quantity` DECIMAL(8, 2) NOT NULL DEFAULT 1,
  `unit_amount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
  `line_total` DECIMAL(12, 2) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `invoice_lines_invoice_index` (`invoice_id`),
  CONSTRAINT `invoice_lines_invoice_fk` FOREIGN KEY (`invoice_id`) REFERENCES `invoices` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `refunds` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `folio_id` BIGINT UNSIGNED NOT NULL,
  `payment_id` BIGINT UNSIGNED NULL,
  `amount` DECIMAL(12, 2) NOT NULL,
  `method` ENUM('cash', 'card', 'mobile_money', 'bank_transfer', 'other', 'paystack') NOT NULL DEFAULT 'cash',
  `reason` VARCHAR(255) NULL,
  `reference` VARCHAR(100) NULL,
  `processed_by` BIGINT UNSIGNED NULL,
  `processed_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `refunds_folio_index` (`folio_id`),
  KEY `refunds_payment_index` (`payment_id`),
  CONSTRAINT `refunds_folio_fk` FOREIGN KEY (`folio_id`) REFERENCES `folios` (`id`) ON DELETE CASCADE,
  CONSTRAINT `refunds_payment_fk` FOREIGN KEY (`payment_id`) REFERENCES `payments` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `night_audit_runs` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `property_id` BIGINT UNSIGNED NOT NULL,
  `business_date` DATE NOT NULL,
  `status` ENUM('preview', 'completed', 'failed') NOT NULL DEFAULT 'completed',
  `rooms_posted` INT UNSIGNED NOT NULL DEFAULT 0,
  `charges_posted` INT UNSIGNED NOT NULL DEFAULT 0,
  `exceptions_json` JSON NULL,
  `summary_json` JSON NULL,
  `started_by` BIGINT UNSIGNED NULL,
  `started_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `completed_at` TIMESTAMP NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `night_audit_property_date_unique` (`property_id`, `business_date`),
  CONSTRAINT `night_audit_runs_property_fk` FOREIGN KEY (`property_id`) REFERENCES `properties` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `night_audit_posts` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `night_audit_run_id` BIGINT UNSIGNED NOT NULL,
  `reservation_id` BIGINT UNSIGNED NOT NULL,
  `folio_id` BIGINT UNSIGNED NOT NULL,
  `folio_charge_id` BIGINT UNSIGNED NULL,
  `amount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `night_audit_posts_run_res_unique` (`night_audit_run_id`, `reservation_id`),
  CONSTRAINT `night_audit_posts_run_fk` FOREIGN KEY (`night_audit_run_id`) REFERENCES `night_audit_runs` (`id`) ON DELETE CASCADE,
  CONSTRAINT `night_audit_posts_reservation_fk` FOREIGN KEY (`reservation_id`) REFERENCES `reservations` (`id`) ON DELETE CASCADE,
  CONSTRAINT `night_audit_posts_folio_fk` FOREIGN KEY (`folio_id`) REFERENCES `folios` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
