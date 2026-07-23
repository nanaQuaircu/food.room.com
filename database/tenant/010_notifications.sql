-- In-app staff notifications

CREATE TABLE IF NOT EXISTS `notifications` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NULL,
  `role` VARCHAR(40) NULL,
  `type` VARCHAR(60) NOT NULL DEFAULT 'info',
  `title` VARCHAR(160) NOT NULL,
  `body` VARCHAR(500) NULL,
  `link` VARCHAR(255) NULL,
  `read_at` TIMESTAMP NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `notifications_user_read_index` (`user_id`, `read_at`),
  KEY `notifications_role_index` (`role`),
  KEY `notifications_created_index` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
