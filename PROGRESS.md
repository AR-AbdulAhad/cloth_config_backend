# StudentLife Clothing Configurator – Backend Progress (v1.5)

## ✅ Done

### 1. Roles & Access
- JWT-based auth for Admin, Class Representative, and Student
- Role-based middleware protecting all routes
- Separate login for dashboard (Admin/Rep) and configurator (Student)
- Sidebar menus returned dynamically based on role

### 2. School & Logo Database
- Full School CRUD (Admin)
- Logo upload by Class Representative
- Admin approve / reject logo with comment
- Logo status flow: uploaded → pending → approved / rejected
- Only admin-approved logos are returned to students

### 3. Back Design – Upload
- Class Rep can upload custom A3 back design
- Admin approve / reject back design
- `isFromConfigurator` flag to distinguish configurator-generated designs
- Approved back design auto-applied to class students

### 4. Fixed Name List
- Class Rep can create, add, edit, delete, and reorder name list items
- Mark name list as "ready"
- Name list locks with class after deadline
- Admin can approve, reject, and unlock name list

### 5. Class & Student Structure
- Full Class CRUD (Admin)
- Assign Class Representative to class
- Manual lock / unlock class (Admin)
- `order_locked`, `name_list_locked`, `process_status` fields maintained
- Student self-registration via class link / encoded token
- Student fields: name, email, phone, year of birth, class relation, consents

### 6. Class Representative – Student Overview
- Returns only registered students (name + status)
- Statuses: Registered / In Progress / Order Completed
- Summary: total registered, total completed orders
- No contact details, order data, or files exposed

### 7. Student Logo Selection
- Students fetch only admin-approved logos for their school
- Logo saved on order and included in production

### 8. Order Flow & Changes
- Place order with garments, logo, delivery details
- Versioning on every update
- 3-business-day edit window enforced
- Post-payment 3-day edit deadline
- Order auto-locks after deadline
- Admin can manually lock / unlock orders
- Full order history tracked

### 9. Email Flow (4 Emails)
- **Email 1 – Order Confirmation:** Auto-triggered on first order placement
- **Email 2 – Change Deadline Reminder:** Admin triggers via API
- **Email 3 – Status / Track & Trace:** Admin triggers with status (production_ready / shipped / completed)
- **Email 4 – Follow-up:** Admin triggers after delivery (care instructions + graduation caps)
- Education type segmentation (Efterskole extra content)
- Gmail SMTP configured and verified

### 10. Production – PDF & Excel
- Generate PDF and Excel per class (Admin only)
- Includes: student name, garment details, logo path, name list
- Production package stored in DB with status tracking

### Other
- CORS configured for all routes and `/uploads` static files
- Stripe payment integration with webhook
- Partial payment tracking (`amount_paid`, `payment_status`)
- Socket.io real-time order update events

---

## 🔲 Remaining

### 1. Design Library (Option B)
Class Rep selects a design from the StudentLife library → backend copies it and locks it to the class → upon approval it is auto-applied to all students.

### 2. Student Logo Auto-Select
If only one admin-approved logo exists for the school, the API should return it with an `auto_selected: true` flag so the frontend can skip the selection step.

### 3. Production ZIP
Bundle the generated PDF, Excel, back design file, and school logo into a single ZIP file per class. Store the path in `ProductionPackage.zip_file_path`.
