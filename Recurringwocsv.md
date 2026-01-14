# Recurring Work Orders CSV/Excel Import Feature - Requirements Document

## Overview
This document outlines the requirements for implementing a CSV/Excel file import feature to create Recurring Work Orders in bulk. The feature will allow administrators to upload a CSV or Excel file containing maintenance schedule data and automatically create multiple Recurring Work Orders.

## Example File Structure
The system should support CSV/Excel files with the following column structure:
- **RESTAURANT** - Location name from CSV (needs mapping to system locations)
- **SERVICE TYPE** - Maps to Category field
- **LAST SERVICED** - New field to track last service date
- **NEXT SERVICE NEEDED BY** (5 columns) - Up to 5 future service dates
- **FREQUENCY LABEL** - Recurrence frequency (SEMIANNUALLY, QUARTERLY, MONTHLY, BI-WEEKLY)
- **SCHEDULING** - Time/schedule information for the service
- **NOTES** - Additional notes for the recurring work order

## File Location
Example file: `hwood maintenence schedule - MAINTENANCe.csv`

---

## Access Control & Authorization

### Admin-Only Access
- **Only users with the `admin` role can process CSV/Excel import requests**
- The CSV import feature must be restricted to admin users only
- All import-related functionality (file upload, processing, location mapping) should verify admin role before allowing access
- Non-admin users (clients, subcontractors) should not see the import button or have access to import endpoints
- Server-side validation must enforce admin role check for all import operations
- If a non-admin user attempts to access import functionality, show appropriate error message and deny access

---

## Feature Requirements

### 1. CSV/Excel Import Interface

#### 1.1 Import Button & Modal
- Add an "Import from CSV/Excel" button on the Recurring Work Orders page (`/admin-portal/recurring-work-orders`)
- **Button should only be visible to admin users** (role-based access control)
- Button should be placed next to the "Create Recurring Work Order" button
- Clicking the button opens a modal/dialog with:
  - File upload input (accepts `.csv`, `.xlsx`, `.xls`)
  - File preview/validation section
  - Import progress indicator
  - Error handling and validation messages
- **Server-side validation**: Verify admin role before processing any import request

#### 1.2 File Processing
- Support both CSV and Excel file formats
- Parse the file and extract data from each row
- Validate required columns are present
- Display preview of parsed data before import
- Show validation errors for invalid rows
- Allow user to proceed or cancel after preview

---

### 2. Location Mapping Feature

#### 2.1 Location Map Subtab
- Create a new subtab/section within Recurring Work Orders called **"Location Map"**
- **Access restricted to admin users only**
- This subtab allows mapping CSV location names to system locations
- Accessible from: `/admin-portal/recurring-work-orders/location-map` or as a tab within the recurring work orders page
- **Server-side validation**: Verify admin role before allowing access to location mapping functionality

#### 2.2 Location Mapping Interface
- Display a table/list showing:
  - **CSV Location Name** (from uploaded file or manual entry)
  - **System Location** (dropdown to select from existing locations in `/admin-portal/locations`)
  - **Actions** (Edit, Delete mapping)

#### 2.3 Pre-defined Location Mappings
The following mappings should be pre-configured or easily set up:
- `Delilah (West Hollywood)` → `Delilah LA`
- `Keys (Sunset Blvd, West Hollywood)` → `Keys Nightclub`
- `Poppy (West Hollywood)` → `Poppy`
- `The Bird Streets Club (Sunset, West Hollywood)` → `Bird Streets`
- `The Nice Guy (Cienega, West Hollywood)` → `The Nice Guy`
- `Delilah (Miami)` → `Delilah Miami`

#### 2.4 Location Mapping Logic
- During CSV import, system should:
  1. Check if CSV location name exists in location map
  2. If mapped, use the mapped system location
  3. If not mapped, show error or allow user to map on-the-fly
  4. Validate that mapped location exists in the system

---

### 3. Default Values Configuration

#### 3.1 Company Selection
- **Company** field should always default to: **"The h.wood Group"**
- This should be automatically selected for all imported recurring work orders
- System should validate that this company exists in the database
- If company doesn't exist, show error and prevent import

#### 3.2 Client Selection
- **Select Client** field should always default to: **"Jessica Cabrera-Olimon"**
- This should be automatically selected for all imported recurring work orders
- System should validate that this client exists in the database
- If client doesn't exist, show error and prevent import

---

### 4. Field Mapping

#### 4.1 RESTAURANT → Select Location *
- CSV column: `RESTAURANT`
- Maps to: `locationId` (using Location Map)
- Required field
- Must be mapped to an existing location in the system

#### 4.2 SERVICE TYPE → Category *
- CSV column: `SERVICE TYPE`
- Maps to: `category` field
- Required field
- Should match existing categories in the system
- If category doesn't exist, either:
  - Create new category automatically, OR
  - Show error and require manual category creation

#### 4.3 LAST SERVICED → Last Serviced (New Field)
- CSV column: `LAST SERVICED`
- Maps to: New field `lastServiced` (Date type)
- Optional field
- Format: Date (e.g., `9/26/2025`, `MM/DD/YYYY`)
- Should be stored as Firestore Timestamp

#### 4.4 NEXT SERVICE NEEDED BY → Next Service Dates
- CSV columns: `NEXT SERVICE NEEDED BY` (5 columns)
- Maps to: Array of dates `nextServiceDates[]`
- These dates should be visible in a dropdown for "next service dates"
- Store as array of Firestore Timestamps
- Format: Date (e.g., `3/25/2026`, `MM/DD/YYYY`)
- All 5 dates should be parsed and stored if provided

#### 4.5 FREQUENCY LABEL → Recurrence Settings
- CSV column: `FREQUENCY LABEL`
- Maps to: `recurrencePattern` in Recurrence Settings
- Required field
- Valid values:
  - `SEMIANNUALLY` → Every 6 months
  - `QUARTERLY` → Every 3 months
  - `MONTHLY` → Every 1 month
  - `BI-WEEKLY` → Every 2 weeks
- Should map to existing `RecurrencePattern` type structure

#### 4.6 SCHEDULING → Recurrence Settings (Time)
- CSV column: `SCHEDULING`
- Maps to: Time/schedule information within Recurrence Settings
- Examples from CSV:
  - `MONDAYS (10AM-5PM)`
  - `THURDAYS (10AM-6PM)`
  - `SUNDAYS (6AM-8AM)`
  - `MON-WED PM (3AM-6AM)`
  - `WEDNESDAY (8-10AM)`
  - `MON-FRI (7AM-10AM)`
  - `TUESDAYS (11AM-2PM)`
  - `FRIDAYS (8AM-10AM)`
- Should be stored as a string field in recurrence settings
- Could be parsed to extract:
  - Days of week
  - Time range
- Store in `recurrencePattern.scheduling` or similar field

#### 4.7 NOTES → Notes
- CSV column: `NOTES`
- Maps to: `notes` or `description` field
- Optional field
- Should be added as notes on the Recurring Work Order

---

### 5. Recurrence Settings Structure

#### 5.1 Recurrence Pattern Options
The system should support the following recurrence types (mapped from FREQUENCY LABEL):
- **SEMIANNUALLY**: Every 6 months
  - `type: 'monthly'`
  - `interval: 6`
- **QUARTERLY**: Every 3 months
  - `type: 'monthly'`
  - `interval: 3`
- **MONTHLY**: Every 1 month
  - `type: 'monthly'`
  - `interval: 1`
- **BI-WEEKLY**: Every 2 weeks
  - `type: 'weekly'`
  - `interval: 2`

#### 5.2 Scheduling Information
- Store scheduling information from CSV `SCHEDULING` column
- This should be part of the recurrence settings
- Format should preserve the original text or parse into structured data

---

### 6. Data Processing Logic

#### 6.1 Row Processing
- Each CSV row should create a **separate Recurring Work Order**
- Process rows sequentially
- Handle empty cells gracefully (treat as optional fields)
- Skip completely empty rows

#### 6.2 Validation Rules
- **Required fields validation:**
  - RESTAURANT (must be mappable to a location)
  - SERVICE TYPE (must be a valid category)
  - FREQUENCY LABEL (must be one of: SEMIANNUALLY, QUARTERLY, MONTHLY, BI-WEEKLY)
- **Optional fields:**
  - LAST SERVICED
  - NEXT SERVICE NEEDED BY (all 5 columns)
  - SCHEDULING
  - NOTES

#### 6.3 Error Handling
- Display validation errors for each row
- Show which rows failed and why
- Allow user to:
  - Fix errors and re-import
  - Skip invalid rows
  - Cancel import

#### 6.4 Success Handling
- Show success message with count of created recurring work orders
- Redirect to Recurring Work Orders list page
- Optionally show created work orders

---

### 7. Data Model Updates

#### 7.1 RecurringWorkOrder Interface Updates
Add the following fields to the `RecurringWorkOrder` type:
```typescript
interface RecurringWorkOrder {
  // ... existing fields ...
  lastServiced?: Date; // New field from LAST SERVICED
  nextServiceDates?: Date[]; // Array of up to 5 dates from NEXT SERVICE NEEDED BY
  recurrencePattern: {
    // ... existing fields ...
    scheduling?: string; // From SCHEDULING column
  };
  notes?: string; // From NOTES column (or use existing description field)
}
```

#### 7.2 Location Mapping Storage
Create a new collection or add to existing structure:
- Collection: `locationMappings` (or add to settings)
- Fields:
  - `csvLocationName`: string (location name from CSV)
  - `systemLocationId`: string (ID of location in system)
  - `createdAt`: Timestamp
  - `updatedAt`: Timestamp

---

### 8. User Interface Requirements

#### 8.1 Import Modal/Dialog
- File upload area with drag-and-drop support
- File format validation
- Preview table showing parsed data
- Validation errors display
- Progress indicator during import
- Success/error summary

#### 8.2 Location Map Page/Tab
- Table view of location mappings
- Add new mapping button
- Edit mapping functionality
- Delete mapping functionality
- Search/filter capabilities
- Bulk import mappings option

#### 8.3 Import Progress
- Show progress bar during import
- Display current row being processed
- Show success/error counts
- Allow cancellation during import

---

### 9. Technical Implementation Notes

#### 9.1 File Parsing Libraries
- Use a CSV parsing library (e.g., `papaparse` for CSV)
- Use an Excel parsing library (e.g., `xlsx` or `exceljs` for Excel files)
- Handle different date formats
- Handle encoding issues

#### 9.2 Date Parsing
- Support multiple date formats:
  - `MM/DD/YYYY` (e.g., `9/26/2025`)
  - `M/D/YYYY` (e.g., `9/4/2025`)
- Convert to JavaScript Date objects
- Store as Firestore Timestamps

#### 9.3 Batch Processing
- Process imports in batches to avoid timeout
- Show progress for large files
- Handle errors gracefully without stopping entire import

#### 9.4 Transaction Safety
- Use Firestore transactions or batch writes where appropriate
- Rollback on critical errors (optional)
- Log all created work orders for audit

#### 9.5 Security & Authorization
- **Admin Role Verification**: All API endpoints for CSV import must verify user has admin role
- **Client-side checks**: Hide import UI elements for non-admin users
- **Server-side enforcement**: Always verify admin role on the server, even if client-side checks pass
- **Firestore Security Rules**: Update Firestore rules to restrict write access to `recurringWorkOrders` collection to admin users only
- **Audit Logging**: Log all import operations with admin user ID and timestamp
- **Error Handling**: Return appropriate 403 Forbidden error if non-admin user attempts import

---

### 10. Example CSV Row Processing

**Input CSV Row:**
```
Delilah (West Hollywood),Fire Suppression & Extinguishers,9/26/2025,3/25/2026,9/25/2026,3/25/2027,9/25/2027,3/25/2028,SEMIANNUALLY,MONDAYS (10AM-5PM),,,
```

**Processed Recurring Work Order:**
- **Location**: Delilah LA (mapped from "Delilah (West Hollywood)")
- **Company**: The h.wood Group (default)
- **Client**: Jessica Cabrera-Olimon (default)
- **Category**: Fire Suppression & Extinguishers
- **Last Serviced**: 2025-09-26
- **Next Service Dates**: [2026-03-25, 2026-09-25, 2027-03-25, 2027-09-25, 2028-03-25]
- **Recurrence**: SEMIANNUALLY (Every 6 months)
- **Scheduling**: MONDAYS (10AM-5PM)
- **Notes**: (empty in this example)
- **Title**: Auto-generated (e.g., "Fire Suppression & Extinguishers - Delilah LA")
- **Description**: Auto-generated or from notes

---

### 11. Edge Cases & Special Handling

#### 11.1 Empty RESTAURANT Column
- If RESTAURANT is empty but previous row had a value, use previous row's location (CSV continuation)
- If first row has empty RESTAURANT, show error

#### 11.2 Missing Categories
- If SERVICE TYPE doesn't match existing category:
  - Option 1: Create category automatically
  - Option 2: Show error and require manual category creation
  - Option 3: Allow mapping to existing category

#### 11.3 Invalid Dates
- Handle invalid date formats gracefully
- Show clear error messages
- Allow user to fix and re-import

#### 11.4 Duplicate Work Orders
- Check for duplicates based on:
  - Location + Category + Frequency
- Option to:
  - Skip duplicates
  - Update existing
  - Create anyway

---

### 12. Testing Requirements

#### 12.1 Test Cases
- Import valid CSV file
- Import valid Excel file
- Import file with missing required fields
- Import file with invalid dates
- Import file with unmapped locations
- Import file with invalid categories
- Import large file (100+ rows)
- Location mapping functionality
- Default company/client selection
- All frequency types (SEMIANNUALLY, QUARTERLY, MONTHLY, BI-WEEKLY)
- Various scheduling formats

#### 12.2 Validation Tests
- Required field validation
- Date format validation
- Location mapping validation
- Category validation
- Frequency label validation

#### 12.3 Security & Authorization Tests
- Verify admin-only access to import button (not visible to clients/subcontractors)
- Verify admin-only access to location mapping page
- Test server-side admin role verification for import endpoints
- Test 403 Forbidden response for non-admin users attempting import
- Test Firestore security rules prevent non-admin writes to recurringWorkOrders
- Verify audit logging captures admin user ID for all imports

---

### 13. Future Enhancements (Optional)

- Export existing recurring work orders to CSV/Excel
- Template download for CSV format
- Bulk edit recurring work orders
- Schedule import for future dates
- Import history/audit log
- Undo import functionality

---

## Summary

This feature will enable **administrators only** (admin role required) to:
1. Upload CSV/Excel files containing maintenance schedules
2. Map CSV location names to system locations
3. Automatically create multiple Recurring Work Orders from the file
4. Set default company and client for all imports
5. Map CSV columns to appropriate system fields
6. Handle various recurrence patterns and scheduling information

**Security Requirements:**
- Only users with admin role can access and use this feature
- All import operations must verify admin role on both client and server side
- Non-admin users should not see import functionality or be able to access import endpoints

The implementation should be user-friendly, robust, secure, and provide clear feedback during the import process.
