-- Hotel PMS Central Registry
-- Run against hotel_central database

CREATE DATABASE IF NOT EXISTS `hotel_central`
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE `hotel_central`;

CREATE TABLE IF NOT EXISTS `companies` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(150) NOT NULL,
  `slug` VARCHAR(80) NOT NULL,
  `db_host` VARCHAR(120) NOT NULL DEFAULT '127.0.0.1',
  `db_name` VARCHAR(120) NOT NULL,
  `db_user` VARCHAR(120) NOT NULL DEFAULT 'root',
  `db_pass` VARCHAR(255) NOT NULL DEFAULT '',
  `status` ENUM('active', 'trial', 'suspended') NOT NULL DEFAULT 'active',
  `logo_path` VARCHAR(255) NULL,
  `settings` JSON NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `companies_slug_unique` (`slug`),
  KEY `companies_status_index` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `platform_admins` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(120) NOT NULL,
  `email` VARCHAR(150) NOT NULL,
  `password_hash` VARCHAR(255) NOT NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `must_change_password` TINYINT(1) NOT NULL DEFAULT 0,
  `last_login_at` TIMESTAMP NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `platform_admins_email_unique` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `subscription_plans` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(120) NOT NULL,
  `slug` VARCHAR(80) NOT NULL,
  `description` TEXT NULL,
  `monthly_price` DECIMAL(12, 2) NOT NULL DEFAULT 0,
  `yearly_price` DECIMAL(12, 2) NOT NULL DEFAULT 0,
  `currency` VARCHAR(10) NOT NULL DEFAULT 'GHS',
  `max_properties` INT UNSIGNED NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `sort_order` SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `subscription_plans_slug_unique` (`slug`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `company_subscriptions` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `company_id` BIGINT UNSIGNED NOT NULL,
  `plan_id` BIGINT UNSIGNED NULL,
  `billing_interval` ENUM('monthly', 'yearly') NOT NULL DEFAULT 'monthly',
  `subscription_status` ENUM('trialing', 'active', 'past_due', 'suspended', 'cancelled') NOT NULL DEFAULT 'active',
  `trial_ends_at` DATE NULL,
  `current_period_end` DATE NULL,
  `monthly_price` DECIMAL(12, 2) NOT NULL DEFAULT 0,
  `currency` VARCHAR(10) NOT NULL DEFAULT 'GHS',
  `grace_days` TINYINT UNSIGNED NOT NULL DEFAULT 3,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `company_subscriptions_company_unique` (`company_id`),
  CONSTRAINT `company_subscriptions_company_fk` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE CASCADE,
  CONSTRAINT `company_subscriptions_plan_fk` FOREIGN KEY (`plan_id`) REFERENCES `subscription_plans` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `platform_settings` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `setting_key` VARCHAR(100) NOT NULL,
  `setting_value` TEXT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `platform_settings_key_unique` (`setting_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO `subscription_plans` (`id`, `name`, `slug`, `description`, `monthly_price`, `yearly_price`, `currency`, `max_properties`, `sort_order`)
VALUES
  (1, 'Starter', 'starter', 'Single property, up to 30 rooms', 199.00, 1990.00, 'GHS', 1, 1),
  (2, 'Professional', 'professional', 'Up to 3 properties', 499.00, 4990.00, 'GHS', 3, 2),
  (3, 'Enterprise', 'enterprise', 'Unlimited properties', 999.00, 9990.00, 'GHS', NULL, 3);
