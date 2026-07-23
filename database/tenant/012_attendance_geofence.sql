-- Geofence for staff attendance clock in/out

ALTER TABLE `properties`
  ADD COLUMN `attendance_latitude` DECIMAL(10, 8) NULL AFTER `currency`,
  ADD COLUMN `attendance_longitude` DECIMAL(11, 8) NULL AFTER `attendance_latitude`,
  ADD COLUMN `attendance_radius_m` INT UNSIGNED NULL AFTER `attendance_longitude`;
