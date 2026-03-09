# Design Color Feature - Documentation

## Overview
Added `designColor` field to back designs to specify whether the design is for white or black garments.

---

## Database Changes

### New Field: `designColor`
- **Type:** VARCHAR(20), Nullable
- **Values:** "white" or "black"
- **Default:** NULL
- **Location:** `back_designs` table

### Schema Update
```prisma
model BackDesign {
  // ... existing fields
  isFromConfigurator Boolean      @default(false)
  designColor        String?      @db.VarChar(20)  // NEW
  created_at         DateTime     @default(now())
}
```

---

## API Changes

### Upload Back Design
**Endpoint:** `POST /api/class-rep/upload-back-design`

**Request Body:**
```javascript
{
  name: "Design Name",
  isFromConfigurator: true,
  designColor: "white"  // NEW: "white" or "black"
}
```

**File:** multipart/form-data with `backDesign` field

**Validation:**
- `designColor` is optional
- If provided, must be "white" or "black" (case-insensitive)
- Automatically converted to lowercase

**Response:**
```json
{
  "success": true,
  "message": "Back design uploaded",
  "data": {
    "id": 1,
    "name": "Design Name",
    "isFromConfigurator": true,
    "designColor": "white",
    "file_path": "uploads/class_back_designs/...",
    "created_at": "2026-03-09T..."
  }
}
```

**Error Response (Invalid Color):**
```json
{
  "success": false,
  "message": "Invalid design color. Only 'white' or 'black' are allowed."
}
```

---

### Re-Upload Back Design
**Endpoint:** `POST /api/class-rep/upload-back-design/:id`

Same parameters as upload, including `designColor`.

---

### Get Configurator Back Design
**Endpoint:** `GET /api/class-rep/class/:classId/configurator-back-design`

**Response includes designColor:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "name": "Configurator Design",
    "isFromConfigurator": true,
    "designColor": "black",
    "file_path": "uploads/...",
    "process_status": "approved"
  }
}
```

---

## Use Cases

### 1. White Garment Design
```javascript
// Upload design for white t-shirts/hoodies
FormData:
  backDesign: [file]
  name: "White Garment Design"
  isFromConfigurator: true
  designColor: "white"
```

### 2. Black Garment Design
```javascript
// Upload design for black t-shirts/hoodies
FormData:
  backDesign: [file]
  name: "Black Garment Design"
  isFromConfigurator: true
  designColor: "black"
```

### 3. Regular Design (No Color)
```javascript
// Upload regular design without color specification
FormData:
  backDesign: [file]
  name: "Regular Design"
  isFromConfigurator: false
  // designColor not provided (NULL in database)
```

---

## Frontend Integration

### Upload Form
```javascript
const uploadBackDesign = async (file, isFromConfigurator, designColor) => {
  const formData = new FormData();
  formData.append('backDesign', file);
  formData.append('name', 'My Design');
  formData.append('isFromConfigurator', isFromConfigurator);
  
  if (designColor) {
    formData.append('designColor', designColor); // "white" or "black"
  }
  
  const response = await fetch('/api/class-rep/upload-back-design', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`
    },
    body: formData
  });
  
  return response.json();
};
```

### Display Design with Color
```jsx
<div className="design-card">
  <img src={design.file_path} alt={design.name} />
  <h3>{design.name}</h3>
  
  {design.isFromConfigurator && (
    <div className="design-info">
      <span className="badge">Configurator Design</span>
      {design.designColor && (
        <span className={`color-badge ${design.designColor}`}>
          For {design.designColor} garments
        </span>
      )}
    </div>
  )}
</div>
```

---

## Database Migration

### Run Migration
```bash
# Option 1: Prisma
npx prisma migrate dev --name add_design_color

# Option 2: Direct SQL
mysql -u username -p database_name < add_design_color_migration.sql
```

### Verify Migration
```sql
-- Check column exists
DESCRIBE back_designs;

-- Check data
SELECT id, name, isFromConfigurator, designColor 
FROM back_designs 
WHERE isFromConfigurator = 1;
```

---

## Validation Rules

### Server-Side (Implemented)
```javascript
// Only "white" or "black" allowed
if (designColor && !['white', 'black'].includes(designColor.toLowerCase())) {
  return error("Invalid design color");
}

// Automatically convert to lowercase
designColor: designColor ? designColor.toLowerCase() : null
```

### Frontend (Recommended)
```javascript
// Dropdown/Radio buttons
<select name="designColor">
  <option value="">No color specified</option>
  <option value="white">White Garments</option>
  <option value="black">Black Garments</option>
</select>

// Or radio buttons
<label>
  <input type="radio" name="designColor" value="white" />
  White Garments
</label>
<label>
  <input type="radio" name="designColor" value="black" />
  Black Garments
</label>
```

---

## Testing

### Test Cases

**1. Upload with white color:**
```bash
POST /api/class-rep/upload-back-design
FormData:
  backDesign: [file]
  isFromConfigurator: true
  designColor: "white"

Expected: Success, designColor = "white"
```

**2. Upload with black color:**
```bash
POST /api/class-rep/upload-back-design
FormData:
  backDesign: [file]
  isFromConfigurator: true
  designColor: "black"

Expected: Success, designColor = "black"
```

**3. Upload without color:**
```bash
POST /api/class-rep/upload-back-design
FormData:
  backDesign: [file]
  isFromConfigurator: true
  // no designColor

Expected: Success, designColor = null
```

**4. Upload with invalid color:**
```bash
POST /api/class-rep/upload-back-design
FormData:
  backDesign: [file]
  isFromConfigurator: true
  designColor: "red"

Expected: Error 400, "Invalid design color"
```

**5. Case insensitive:**
```bash
designColor: "WHITE" → stored as "white"
designColor: "Black" → stored as "black"
```

---

## Benefits

1. **Better Organization:** Separate designs for white and black garments
2. **User Experience:** Students know which design to use based on garment color
3. **Flexibility:** Optional field, doesn't break existing functionality
4. **Validation:** Server-side validation ensures data integrity

---

## Backward Compatibility

- ✅ Existing designs without `designColor` continue to work
- ✅ Field is nullable, no data migration needed
- ✅ All existing APIs remain functional
- ✅ New field is optional in requests

---

## Summary

**Added:** `designColor` field to BackDesign model  
**Values:** "white", "black", or NULL  
**Validation:** Server-side validation implemented  
**Migration:** SQL file provided  
**Status:** Ready to use ✅

---

**Implementation Date:** March 9, 2026  
**Status:** Complete and tested
