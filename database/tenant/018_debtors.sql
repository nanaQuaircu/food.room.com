-- Phase A: Debtors / corporate AR (Debtors Ledger)
-- Safe re-run on MariaDB/MySQL

CREATE TABLE IF NOT EXISTS `corporate_accounts` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `property_id` BIGINT UNSIGNED NOT NULL,
  `name` VARCHAR(160) NOT NULL,
  `contact_name` VARCHAR(120) NULL,
  `email` VARCHAR(150) NULL,
  `phone` VARCHAR(40) NULL,
  `credit_limit` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  `notes` TEXT NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `corporate_accounts_property_idx` (`property_id`),
  CONSTRAINT `corporate_accounts_property_fk` FOREIGN KEY (`property_id`) REFERENCES `properties` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- reservations.corporate_account_id
SET @col_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'reservations'
    AND COLUMN_NAME = 'corporate_account_id'
);
SET @sql = IF(
  @col_exists = 0,
  'ALTER TABLE `reservations` ADD COLUMN `corporate_account_id` BIGINT UNSIGNED NULL AFTER `guest_id`',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- reservations.billing_type
SET @col_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'reservations'
    AND COLUMN_NAME = 'billing_type'
);
SET @sql = IF(
  @col_exists = 0,
  'ALTER TABLE `reservations` ADD COLUMN `billing_type` ENUM(''guest'',''corporate'') NOT NULL DEFAULT ''guest'' AFTER `corporate_account_id`',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- FK for reservations.corporate_account_id -> corporate_accounts.id
SET @fk_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'reservations'
    AND CONSTRAINT_NAME = 'reservations_corporate_account_fk'
);
SET @sql = IF(
  @fk_exists = 0,
  'ALTER TABLE `reservations` ADD CONSTRAINT `reservations_corporate_account_fk` FOREIGN KEY (`corporate_account_id`) REFERENCES `corporate_accounts` (`id`) ON DELETE SET NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'reservations'
    AND INDEX_NAME = 'reservations_billing_type_idx'
);
SET @sql = IF(
  @idx_exists = 0,
  'ALTER TABLE `reservations` ADD KEY `reservations_billing_type_idx` (`billing_type`)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add 'cheque' to payments.method (idempotent to re-run)
ALTER TABLE `payments`
  MODIFY `method` ENUM(
    'cash',
    'card',
    'mobile_money',
    'bank_transfer',
    'other',
    'paystack',
    'cheque'
  ) NOT NULL DEFAULT 'cash';

-- Seed 4 demo companies for property_id = 1, if none exist yet
SET @co_count = (SELECT COUNT(*) FROM `corporate_accounts` WHERE `property_id` = 1);
SET @sql = IF(
  @co_count = 0,
  'INSERT INTO `corporate_accounts` (`property_id`, `name`, `contact_name`, `email`, `phone`, `credit_limit`, `notes`, `is_active`) VALUES
    (1, ''Goldcrest Mining'', ''Accounts Payable'', ''accounts@goldcrest.example'', ''+233200000001'', 10000.00, ''Corporate travel account — Excel ledger'', 1),
    (1, ''Blue Wave Logistics'', ''Travel Desk'', ''billing@bluewave.example'', ''+233200000002'', 8000.00, ''Corporate travel account — Excel ledger'', 1),
    (1, ''Sunrise Telecom'', ''Fleet Office'', ''fleet@sunrise.example'', ''+233200000003'', 5000.00, ''Corporate travel account — Excel ledger'', 1),
    (1, ''Individual'', NULL, NULL, NULL, 0.00, ''Walk-in / individual debtors'', 1)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
