-- Room specs (description, amenities, bed/size) + multi-photo gallery.
ALTER TABLE rooms
  ADD COLUMN description TEXT NULL AFTER image_url,
  ADD COLUMN amenities JSON NULL AFTER description,
  ADD COLUMN bed_type VARCHAR(80) NULL AFTER amenities,
  ADD COLUMN size_sqm DECIMAL(8,2) NULL AFTER bed_type;

CREATE TABLE IF NOT EXISTS room_images (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  property_id BIGINT UNSIGNED NOT NULL,
  room_id BIGINT UNSIGNED NOT NULL,
  image_url VARCHAR(500) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_room_images_room (room_id, sort_order),
  KEY idx_room_images_property (property_id),
  CONSTRAINT fk_room_images_room FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed gallery from existing cover photos so guest pages keep showing them.
INSERT INTO room_images (property_id, room_id, image_url, sort_order)
SELECT property_id, id, image_url, 0
FROM rooms
WHERE image_url IS NOT NULL AND TRIM(image_url) <> '' AND is_active = 1;
