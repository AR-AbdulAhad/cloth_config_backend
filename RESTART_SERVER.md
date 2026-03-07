# Server Restart Instructions

## Issue
Prisma client cannot be regenerated while server is running due to file lock.

## Solution

### Option 1: Restart from Terminal (Recommended)

1. **Find the terminal where server is running**
2. **Press `Ctrl + C`** to stop the server
3. **Wait for process to fully stop** (2-3 seconds)
4. **Run:**
   ```bash
   npx prisma generate
   npm start
   ```

### Option 2: Kill Process Manually (Windows)

```bash
# Find Node process
tasklist | findstr node

# Kill all Node processes
taskkill /F /IM node.exe

# Then regenerate and restart
npx prisma generate
npm start
```

### Option 3: Restart Without Regenerating

If you just want to restart with current changes:

```bash
# Stop server (Ctrl+C)
# Then restart
npm start
```

The schema changes I made are already compatible with your current database, so you can restart without running `prisma generate`.

---

## What Changed

I've reverted the code to remove versioning features that required database migration:

✅ Removed `version` field from Order model
✅ Removed `OrderHistory` model
✅ Simplified `placeOrder` function
✅ **Kept deadline auto-lock feature** (this works without migration)

---

## After Restart

Your APIs will work normally:
- ✅ `POST /api/student/place-order` - Works
- ✅ `GET /api/student/my-order` - Works
- ⚠️ `GET /api/student/my-order-history` - Returns "feature not available" message
- ⚠️ `GET /api/admin/orders/:orderId/history` - Returns "feature not available" message

---

## To Add Versioning Later

See `MIGRATION_STEPS.md` for complete instructions when you're ready to add the versioning feature.
