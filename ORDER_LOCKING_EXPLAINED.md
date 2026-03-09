# Order Locking System - Complete Explanation

## Overview
Orders automatically lock ho sakte hain multiple ways se. Yahan complete breakdown hai.

---

## 🔒 Automatic Order Locking Scenarios

### 1. Payment Completion (MAIN REASON) ✅

**Location:** `controllers/paymentController.js`

**When:** Jab student payment complete karta hai

**Code:**
```javascript
export const createCheckoutSession = async (req, res) => {
    // ... payment logic
    
    await prisma.order.update({
        where: { id: parseInt(orderId) },
        data: {
            process_status: "completed",
            is_locked: true,  // ← ORDER LOCK HO JATA HAI
        },
    });
}
```

**Why:** Payment ke baad order finalize ho jata hai, isliye lock kar diya jata hai taake student changes na kar sake.

**API:** `POST /api/payment/create-checkout-session`

---

### 2. Stripe Webhook (Backup Mechanism) ✅

**Location:** `controllers/paymentController.js`

**When:** Jab Stripe payment confirm karta hai (webhook trigger)

**Code:**
```javascript
export const stripeWebhook = async (req, res) => {
    const session = event.data.object;
    const orderId = session.metadata.orderId;
    
    await prisma.order.update({
        where: { id: parseInt(orderId) },
        data: {
            process_status: "completed",
            is_locked: true,  // ← ORDER LOCK HO JATA HAI
        },
    });
}
```

**Why:** Agar direct API call fail ho jaye, to webhook se bhi lock ho jayega.

---

### 3. Class Locking (Indirect Effect) ⚠️

**Location:** `controllers/classController.js`

**When:** Admin manually class lock karta hai

**Code:**
```javascript
export const lockClass = async (req, res) => {
    await prisma.classes.update({
        where: { id: parseInt(classId) },
        data: { 
            process_status: 'orders_locked',
            order_locked: true,
            name_list_locked: true 
        }
    });
}
```

**Effect:** 
- Individual orders ki `is_locked` field change NAHI hoti
- Lekin class level par orders block ho jate hain
- Students koi bhi order create/update nahi kar sakte

**Check in placeOrder:**
```javascript
if (targetClass.process_status !== 'active') {
    return res.status(403).json({ 
        success: false, 
        message: "Class is locked" 
    });
}
```

**API:** `PUT /api/admin/lock-class/:classId`

---

### 4. Deadline Auto-Lock (NEW) ✅

**Location:** `controllers/orderController.js`

**When:** Class ki `change_deadline` pass ho jati hai

**Code:**
```javascript
if (targetClass.change_deadline && new Date() > new Date(targetClass.change_deadline)) {
    if (req.user?.role !== 'admin') {
        return res.status(403).json({ 
            success: false, 
            message: "Order deadline has passed. Changes are no longer allowed." 
        });
    }
}
```

**Effect:**
- Individual orders ki `is_locked` field change NAHI hoti
- Lekin deadline ke baad koi changes nahi ho sakti
- Admin override kar sakta hai

---

## 📊 Order Lock Status Check

### Database Level:
```sql
SELECT 
    o.id,
    o.student_id,
    o.is_locked,           -- Individual order lock
    o.process_status,
    c.order_locked,        -- Class level lock
    c.process_status,
    c.change_deadline
FROM orders o
JOIN classes c ON o.class_id = c.id
WHERE o.status != 2;
```

### Order Edit Blocked When:
1. ✅ `order.is_locked = true` (Payment completed)
2. ✅ `class.process_status = 'orders_locked'` (Admin locked class)
3. ✅ `class.change_deadline < NOW()` (Deadline passed)

---

## 🔓 Unlocking Orders

### Individual Order Unlock:
**Currently NOT IMPLEMENTED**

To unlock individual order, you would need:
```javascript
await prisma.order.update({
    where: { id: orderId },
    data: { is_locked: false }
});
```

### Class Level Unlock:
**API:** `PUT /api/admin/unlock-class/:classId`

```javascript
export const unlockClass = async (req, res) => {
    await prisma.classes.update({
        where: { id: parseInt(classId) },
        data: { 
            process_status: 'active',
            order_locked: false,
            name_list_locked: false 
        }
    });
}
```

**Note:** Yeh sirf class level lock remove karta hai, individual order ka `is_locked` field change nahi hota.

---

## 🎯 Summary

| Lock Type | Trigger | Affects | Can Unlock? |
|-----------|---------|---------|-------------|
| Payment Lock | Payment complete | Individual order | ❌ No API |
| Webhook Lock | Stripe webhook | Individual order | ❌ No API |
| Class Lock | Admin action | All class orders | ✅ Yes (Admin) |
| Deadline Lock | Date passed | All class orders | ✅ Yes (Admin override) |

---

## 💡 Recommendations

### 1. Add Individual Order Unlock API (Admin Only)
```javascript
export const unlockOrder = async (req, res) => {
    try {
        const { orderId } = req.params;
        
        await prisma.order.update({
            where: { id: parseInt(orderId) },
            data: { 
                is_locked: false,
                process_status: 'in_progress'
            }
        });
        
        res.json({ 
            success: true, 
            message: "Order unlocked successfully" 
        });
    } catch (err) {
        res.status(500).json({ 
            success: false, 
            error: err.message 
        });
    }
};
```

### 2. Add Bulk Unlock for Class Orders
```javascript
export const unlockClassOrders = async (req, res) => {
    try {
        const { classId } = req.params;
        
        await prisma.order.updateMany({
            where: { 
                class_id: parseInt(classId),
                status: { not: 2 }
            },
            data: { 
                is_locked: false,
                process_status: 'in_progress'
            }
        });
        
        res.json({ 
            success: true, 
            message: "All class orders unlocked" 
        });
    } catch (err) {
        res.status(500).json({ 
            success: false, 
            error: err.message 
        });
    }
};
```

### 3. Add Lock Reason Field
```prisma
model Order {
  // ... existing fields
  is_locked      Boolean  @default(false)
  lock_reason    String?  @db.VarChar(100)  // 'payment', 'admin', 'deadline'
  locked_at      DateTime?
  locked_by      Int?     // Admin user ID if manually locked
}
```

---

## 🔍 Debugging Orders

### Check Why Order is Locked:
```javascript
const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { 
        class: true,
        student: true 
    }
});

console.log('Order Lock Status:', order.is_locked);
console.log('Order Status:', order.process_status);
console.log('Class Lock Status:', order.class.order_locked);
console.log('Class Process Status:', order.class.process_status);
console.log('Deadline:', order.class.change_deadline);
console.log('Deadline Passed:', new Date() > new Date(order.class.change_deadline));
```

---

**Main Reason Orders Lock:** Payment completion! 💳
