-- Migration: Add designColor field to back_designs table
-- Date: March 9, 2026
-- Description: Adds designColor field to store white/black color choice for configurator designs

-- Add designColor column to back_designs table
ALTER TABLE `back_designs` 
ADD COLUMN `designColor` VARCHAR(20) NULL AFTER `isFromConfigurator`;

-- Verify the column was added
SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT 
FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_NAME = 'back_designs' AND COLUMN_NAME = 'designColor';

-- Check existing records
SELECT 
    id,
    name,
    isFromConfigurator,
    designColor,
    created_at
FROM `back_designs`
ORDER BY created_at DESC
LIMIT 10;
