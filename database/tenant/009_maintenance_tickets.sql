-- Maintenance tickets (dedicated workflow beyond housekeeping tasks)

CREATE TABLE IF NOT EXISTS `maintenance_tickets` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `property_id` BIGINT UNSIGNED NOT NULL,
  `room_id` BIGINT UNSIGNED NOT NULL,
  `title` VARCHAR(160) NOT NULL,
  `description` TEXT NULL,
  `priority` ENUM('low', 'medium', 'high', 'urgent') NOT NULL DEFAULT 'medium',
  `status` ENUM('open', 'in_progress', 'resolved', 'cancelled') NOT NULL DEFAULT 'open',
  `reported_by` BIGINT UNSIGNED NULL,
  `assigned_to` BIGINT UNSIGNED NULL,
  `previous_room_status` VARCHAR(40) NULL,
  `resolved_at` TIMESTAMP NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `maintenance_tickets_property_status_index` (`property_id`, `status`),
  KEY `maintenance_tickets_room_index` (`room_id`),
  CONSTRAINT `maintenance_tickets_property_fk` FOREIGN KEY (`property_id`) REFERENCES `properties` (`id`) ON DELETE CASCADE,
  CONSTRAINT `maintenance_tickets_room_fk` FOREIGN KEY (`room_id`) REFERENCES `rooms` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
