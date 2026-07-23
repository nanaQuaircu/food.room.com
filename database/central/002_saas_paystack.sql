-- SaaS subscription Paystack intents (platform billing, not guest folio)

SET @col1 := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'company_subscriptions'
    AND COLUMN_NAME = 'paystack_customer_code'
);
SET @sql1 := IF(
  @col1 = 0,
  'ALTER TABLE `company_subscriptions` ADD COLUMN `paystack_customer_code` VARCHAR(64) NULL AFTER `grace_days`',
  'SELECT 1'
);
PREPARE stmt1 FROM @sql1;
EXECUTE stmt1;
DEALLOCATE PREPARE stmt1;

SET @col2 := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'company_subscriptions'
    AND COLUMN_NAME = 'paystack_authorization_code'
);
SET @sql2 := IF(
  @col2 = 0,
  'ALTER TABLE `company_subscriptions` ADD COLUMN `paystack_authorization_code` VARCHAR(64) NULL AFTER `paystack_customer_code`',
  'SELECT 1'
);
PREPARE stmt2 FROM @sql2;
EXECUTE stmt2;
DEALLOCATE PREPARE stmt2;

SET @col3 := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'company_subscriptions'
    AND COLUMN_NAME = 'last_payment_reference'
);
SET @sql3 := IF(
  @col3 = 0,
  'ALTER TABLE `company_subscriptions` ADD COLUMN `last_payment_reference` VARCHAR(64) NULL AFTER `paystack_authorization_code`',
  'SELECT 1'
);
PREPARE stmt3 FROM @sql3;
EXECUTE stmt3;
DEALLOCATE PREPARE stmt3;

CREATE TABLE IF NOT EXISTS `subscription_payment_intents` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `company_id` BIGINT UNSIGNED NOT NULL,
  `plan_id` BIGINT UNSIGNED NOT NULL,
  `reference` VARCHAR(100) NOT NULL,
  `amount` DECIMAL(12, 2) NOT NULL,
  `currency` VARCHAR(10) NOT NULL DEFAULT 'GHS',
  `status` ENUM('pending', 'success', 'failed', 'abandoned') NOT NULL DEFAULT 'pending',
  `paystack_reference` VARCHAR(100) NULL,
  `metadata_json` JSON NULL,
  `paid_at` TIMESTAMP NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `subscription_payment_intents_reference_unique` (`reference`),
  KEY `subscription_payment_intents_company_index` (`company_id`),
  KEY `subscription_payment_intents_status_index` (`status`),
  CONSTRAINT `subscription_payment_intents_company_fk` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE CASCADE,
  CONSTRAINT `subscription_payment_intents_plan_fk` FOREIGN KEY (`plan_id`) REFERENCES `subscription_plans` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
