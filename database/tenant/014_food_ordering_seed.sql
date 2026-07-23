-- Sample menu for guest ordering (property_id = 1) with images

INSERT INTO menu_categories (property_id, name, sort_order, is_active)
SELECT 1, 'Breakfast', 1, 1 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM menu_categories WHERE property_id = 1 AND name = 'Breakfast');

INSERT INTO menu_categories (property_id, name, sort_order, is_active)
SELECT 1, 'Main dishes', 2, 1 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM menu_categories WHERE property_id = 1 AND name = 'Main dishes');

INSERT INTO menu_categories (property_id, name, sort_order, is_active)
SELECT 1, 'Starters', 3, 1 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM menu_categories WHERE property_id = 1 AND name = 'Starters');

INSERT INTO menu_categories (property_id, name, sort_order, is_active)
SELECT 1, 'Drinks', 4, 1 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM menu_categories WHERE property_id = 1 AND name = 'Drinks');

INSERT INTO menu_categories (property_id, name, sort_order, is_active)
SELECT 1, 'Desserts', 5, 1 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM menu_categories WHERE property_id = 1 AND name = 'Desserts');

-- Breakfast
INSERT INTO menu_items (property_id, category_id, name, description, price, image_url, is_available, sort_order)
SELECT 1, c.id, 'Continental breakfast', 'Pastries, fruit, coffee or tea', 45.00, '/uploads/menu/continental-breakfast.jpg', 1, 1
FROM menu_categories c
WHERE c.property_id = 1 AND c.name = 'Breakfast'
  AND NOT EXISTS (SELECT 1 FROM menu_items WHERE property_id = 1 AND name = 'Continental breakfast');

INSERT INTO menu_items (property_id, category_id, name, description, price, image_url, is_available, sort_order)
SELECT 1, c.id, 'Full English', 'Eggs, sausage, beans, toast', 65.00, '/uploads/menu/full-english.jpg', 1, 2
FROM menu_categories c
WHERE c.property_id = 1 AND c.name = 'Breakfast'
  AND NOT EXISTS (SELECT 1 FROM menu_items WHERE property_id = 1 AND name = 'Full English');

-- Main dishes
INSERT INTO menu_items (property_id, category_id, name, description, price, image_url, is_available, sort_order)
SELECT 1, c.id, 'Grilled chicken', 'Served with jollof rice and salad', 85.00, '/uploads/menu/grilled-chicken.jpg', 1, 1
FROM menu_categories c
WHERE c.property_id = 1 AND c.name = 'Main dishes'
  AND NOT EXISTS (SELECT 1 FROM menu_items WHERE property_id = 1 AND name = 'Grilled chicken');

INSERT INTO menu_items (property_id, category_id, name, description, price, image_url, is_available, sort_order)
SELECT 1, c.id, 'Jollof rice special', 'Party jollof with grilled chicken and plantain', 70.00, '/uploads/menu/jollof-rice.jpg', 1, 2
FROM menu_categories c
WHERE c.property_id = 1 AND c.name = 'Main dishes'
  AND NOT EXISTS (SELECT 1 FROM menu_items WHERE property_id = 1 AND name = 'Jollof rice special');

INSERT INTO menu_items (property_id, category_id, name, description, price, image_url, is_available, sort_order)
SELECT 1, c.id, 'Banku & tilapia', 'Soft banku with grilled tilapia and pepper sauce', 95.00, '/uploads/menu/banku-tilapia.jpg', 1, 3
FROM menu_categories c
WHERE c.property_id = 1 AND c.name = 'Main dishes'
  AND NOT EXISTS (SELECT 1 FROM menu_items WHERE property_id = 1 AND name = 'Banku & tilapia');

INSERT INTO menu_items (property_id, category_id, name, description, price, image_url, is_available, sort_order)
SELECT 1, c.id, 'Waakye platter', 'Waakye with stew, egg, spaghetti and salad', 55.00, '/uploads/menu/waakye.jpg', 1, 4
FROM menu_categories c
WHERE c.property_id = 1 AND c.name = 'Main dishes'
  AND NOT EXISTS (SELECT 1 FROM menu_items WHERE property_id = 1 AND name = 'Waakye platter');

-- Starters
INSERT INTO menu_items (property_id, category_id, name, description, price, image_url, is_available, sort_order)
SELECT 1, c.id, 'Club sandwich', 'Triple-decker with fries', 48.00, '/uploads/menu/club-sandwich.jpg', 1, 1
FROM menu_categories c
WHERE c.property_id = 1 AND c.name = 'Starters'
  AND NOT EXISTS (SELECT 1 FROM menu_items WHERE property_id = 1 AND name = 'Club sandwich');

INSERT INTO menu_items (property_id, category_id, name, description, price, image_url, is_available, sort_order)
SELECT 1, c.id, 'Caesar salad', 'Crisp lettuce, croutons, parmesan', 40.00, '/uploads/menu/caesar-salad.jpg', 1, 2
FROM menu_categories c
WHERE c.property_id = 1 AND c.name = 'Starters'
  AND NOT EXISTS (SELECT 1 FROM menu_items WHERE property_id = 1 AND name = 'Caesar salad');

-- Drinks
INSERT INTO menu_items (property_id, category_id, name, description, price, image_url, is_available, sort_order)
SELECT 1, c.id, 'Fresh juice', 'Pineapple or orange', 25.00, '/uploads/menu/fresh-juice.jpg', 1, 1
FROM menu_categories c
WHERE c.property_id = 1 AND c.name = 'Drinks'
  AND NOT EXISTS (SELECT 1 FROM menu_items WHERE property_id = 1 AND name = 'Fresh juice');

INSERT INTO menu_items (property_id, category_id, name, description, price, image_url, is_available, sort_order)
SELECT 1, c.id, 'House latte', 'Espresso with steamed milk', 28.00, '/uploads/menu/latte.jpg', 1, 2
FROM menu_categories c
WHERE c.property_id = 1 AND c.name = 'Drinks'
  AND NOT EXISTS (SELECT 1 FROM menu_items WHERE property_id = 1 AND name = 'House latte');

INSERT INTO menu_items (property_id, category_id, name, description, price, image_url, is_available, sort_order)
SELECT 1, c.id, 'Tropical smoothie', 'Mango, banana and pineapple blend', 32.00, '/uploads/menu/smoothie.jpg', 1, 3
FROM menu_categories c
WHERE c.property_id = 1 AND c.name = 'Drinks'
  AND NOT EXISTS (SELECT 1 FROM menu_items WHERE property_id = 1 AND name = 'Tropical smoothie');

-- Desserts
INSERT INTO menu_items (property_id, category_id, name, description, price, image_url, is_available, sort_order)
SELECT 1, c.id, 'Chocolate cake', 'Rich layered chocolate slice', 35.00, '/uploads/menu/chocolate-cake.jpg', 1, 1
FROM menu_categories c
WHERE c.property_id = 1 AND c.name = 'Desserts'
  AND NOT EXISTS (SELECT 1 FROM menu_items WHERE property_id = 1 AND name = 'Chocolate cake');

-- Keep existing rows in sync with images
UPDATE menu_items SET image_url = '/uploads/menu/continental-breakfast.jpg'
WHERE property_id = 1 AND name = 'Continental breakfast' AND (image_url IS NULL OR image_url = '');

UPDATE menu_items SET image_url = '/uploads/menu/full-english.jpg'
WHERE property_id = 1 AND name = 'Full English' AND (image_url IS NULL OR image_url = '');

UPDATE menu_items SET image_url = '/uploads/menu/grilled-chicken.jpg'
WHERE property_id = 1 AND name = 'Grilled chicken' AND (image_url IS NULL OR image_url = '');

UPDATE menu_items SET image_url = '/uploads/menu/fresh-juice.jpg'
WHERE property_id = 1 AND name = 'Fresh juice' AND (image_url IS NULL OR image_url = '');
