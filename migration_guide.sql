-- Migration: Add Order Versioning and History Tracking
-- Date: March 7, 2026
-- Description: Adds version tracking and complete edit history for orders

-- Step 1: Add version column to orders table
ALTER TABLE `orders` 
ADD COLUMN `version` INT NOT NULL DEFAULT 1 AFTER `status`;

-- Step 2: Create order_history table
CREATE TABLE `order_history` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `order_id` INT NOT NULL,
  `version` INT NOT NULL,
  `action` VARCHAR(50) NOT NULL,
  `changed_by` INT NOT NULL,
  `changes_summary` TEXT NULL,
  `order_snapshot` JSON NOT NULL,
  `items_snapshot` JSON NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `order_history_order_id_version_idx` (`order_id`, `version`),
  CONSTRAINT `order_history_order_id_fkey` 
    FOREIGN KEY (`order_id`) 
    REFERENCES `orders`(`id`) 
    ON DELETE CASCADE 
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Step 3: Create initial history records for existing orders (optional)
-- This creates a history entry for all existing orders
INSERT INTO `order_history` (
  `order_id`, 
  `version`, 
  `action`, 
  `changed_by`, 
  `changes_summary`, 
  `order_snapshot`, 
  `items_snapshot`
)
SELECT 
  o.id,
  1,
  'created',
  o.student_id,
  'Initial order (migrated)',
  JSON_OBJECT(
    'delivery_details', o.delivery_details,
    'selected_logo_id', o.selected_logo_id,
    'process_status', o.process_status,
    'is_locked', o.is_locked
  ),
  COALESCE(
    (
      SELECT JSON_ARRAYAGG(
        JSON_OBJECT(
          'id', oi.id,
          'product_type', oi.product_type,
          'selectedColor', oi.selectedColor,
          'selectedSize', oi.selectedSize,
          'design_config', oi.design_config,
          'status', oi.status
        )
      )
      FROM `order_items` oi
      WHERE oi.order_id = o.id AND oi.status != 2
    ),
    JSON_ARRAY()
  )
FROM `orders` o
WHERE o.status != 2;

-- Verification Queries:

-- Check if version column was added
SELECT COLUMN_NAME, DATA_TYPE, COLUMN_DEFAULT 
FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_NAME = 'orders' AND COLUMN_NAME = 'version';

-- Check if order_history table was created
SELECT TABLE_NAME, TABLE_ROWS 
FROM INFORMATION_SCHEMA.TABLES 
WHERE TABLE_NAME = 'order_history';

-- Count history records
SELECT COUNT(*) as total_history_records FROM `order_history`;

-- View sample history records
SELECT 
  oh.id,
  oh.order_id,
  oh.version,
  oh.action,
  oh.changed_by,
  oh.created_at,
  u.name as changed_by_name
FROM `order_history` oh
LEFT JOIN `users` u ON oh.changed_by = u.id
ORDER BY oh.created_at DESC
LIMIT 10;

-- Check orders with their version numbers
SELECT 
  o.id,
  o.student_id,
  o.version,
  o.created_at,
  o.updated_at,
  COUNT(oh.id) as history_count
FROM `orders` o
LEFT JOIN `order_history` oh ON o.id = oh.order_id
WHERE o.status != 2
GROUP BY o.id
ORDER BY o.updated_at DESC
LIMIT 10;
