-- Employee clock in/out attendance (per property, linked to users)

CREATE TABLE IF NOT EXISTS `employee_attendance` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `property_id` BIGINT UNSIGNED NOT NULL,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `work_date` DATE NOT NULL,
  `clock_in_at` TIMESTAMP NULL,
  `clock_out_at` TIMESTAMP NULL,
  `notes` TEXT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `employee_attendance_user_date_unique` (`property_id`, `user_id`, `work_date`),
  KEY `employee_attendance_date_index` (`property_id`, `work_date`),
  KEY `employee_attendance_user_index` (`user_id`),
  CONSTRAINT `employee_attendance_property_fk` FOREIGN KEY (`property_id`) REFERENCES `properties` (`id`) ON DELETE CASCADE,
  CONSTRAINT `employee_attendance_user_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
