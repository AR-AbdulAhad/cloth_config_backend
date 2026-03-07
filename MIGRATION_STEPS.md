# Database Migration Steps - Order Versioning

## Current Issue
The API is returning error because `orderHistory` table doesn't exist yet in the database.

## Solution: Run Migration

### Step 1: Stop the Server (if running)
```bash
# Press Ctrl+C in the terminal where server is running
```

### Step 2: Generate Prisma Client
```bash
npx prisma generate
```

If you get permission error, close any running Node processes and try again.

### Step 3: Create Migration
```bash
npx prisma migrate dev --name add_order_versioning
```

This will:
- Create `order_history` table
- Add `version` column to `orders` table
- Generate migration SQL file
- Apply changes to database

### Step 4: Verify Migration
```bash
npx prisma studio
```

Check if:
- `orders` table has `version` column
- `order_history` table exists

### Step 5: Restart Server
```bash
npm start
# or
node app.js
```

---

## Alternative: Manual SQL Migration

If Prisma migration fails, run this SQL directly:

```sql
-- Add version column
ALTER TABLE `orders` 
ADD COLUMN `version` INT NOT NULL DEFAULT 1 AFTER `status`;

-- Create order_history table
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
```

Then run:
```bash
npx prisma generate
```

---

## Temporary Workaround (Already Applied)

The code now has fallback logic:
- If `orderHistory` table doesn't exist, APIs return helpful error message
- Order creation/update still works (without history tracking)
- Once migration is done, history tracking will automatically start working

---

## Testing After Migration

### Test 1: Create Order
```bash
POST /api/student/place-order
```
Should return `version: 1`

### Test 2: Update Order
```bash
POST /api/student/place-order (same student)
```
Should return `version: 2`

### Test 3: View History
```bash
GET /api/student/my-order-history
```
Should return array of history records

### Test 4: Admin View History
```bash
GET /api/admin/orders/:orderId/history
```
Should return complete history

---

## Common Issues

### Issue 1: Permission Error
**Error:** `EPERM: operation not permitted`

**Solution:**
1. Close all Node processes
2. Close VS Code terminal
3. Reopen terminal
4. Try again

### Issue 2: Prisma Client Not Updated
**Error:** `prisma.orderHistory is not a function`

**Solution:**
```bash
npx prisma generate
npm restart
```

### Issue 3: Migration Already Applied
**Error:** `Migration already applied`

**Solution:**
```bash
npx prisma migrate resolve --applied add_order_versioning
```

---

## Rollback (if needed)

To remove versioning feature:

```sql
-- Drop order_history table
DROP TABLE IF EXISTS `order_history`;

-- Remove version column
ALTER TABLE `orders` DROP COLUMN `version`;
```

Then:
```bash
npx prisma db pull
npx prisma generate
```
