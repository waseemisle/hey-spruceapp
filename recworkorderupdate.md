# Recurring Work Orders Import — Default Mode & Preview Enhancements

## Context

Page: `/admin-portal/recurring-work-orders` — click **"Import from CSV/Excel"** button.

### Key Files

- **Import Modal (frontend):** `components/recurring-work-orders-import-modal.tsx`
- **API Route (backend):** `app/api/recurring-work-orders/import/route.ts`
- **Page:** `app/admin-portal/recurring-work-orders/page.tsx`

---

## Changes Required

### 1. Change Default Import Mode

**Current behavior:** When the import modal opens, the default selected mode is **"Create New"** (`create`).

**Required behavior:** The default selected mode should be **"Update or Create"** (`update_or_create`).

**Where to change:** In `components/recurring-work-orders-import-modal.tsx`, the `importMode` state is initialized (around line 63). Change the default value from `'create'` to `'update_or_create'`.

---

### 2. Enhanced Preview Step — Show Update vs Create Breakdown

**Current behavior:** The preview step shows all parsed rows in a single table with columns: Row, Restaurant, Service Type, Recurrence Pattern, Client, Subcontractor, Status. There is no distinction between rows that will **update** existing recurring work orders vs rows that will **create** new ones.

**Required behavior:** When in **"Update or Create"** mode, after the file is uploaded and parsed, the preview step should:

#### a) Perform matching on the frontend (before import)

After parsing the file, call an API endpoint (or use an existing one) to check which rows match existing recurring work orders using the same matching logic the backend already uses: **Location + Service Type + Frequency Label** (the `findExistingRecurringWorkOrder` function in `app/api/recurring-work-orders/import/route.ts`, lines ~504-568).

#### b) Show a summary count

At the top of the preview, display a clear summary like:

> **83 total rows** — **3 will be updated** | **80 will be created**

#### c) Split the preview into two sections

**Section 1: "Orders Being Updated" (e.g., 3 rows)**

Show these rows in a table/card view with:

- **Restaurant** (location name)
- **Service Type**
- **Frequency**
- **Fields being updated** — For each updated row, show exactly which date fields are changing and their new values:
  - `LAST SERVICED`
  - `NEXT SERVICE NEEDED BY`
  - `NEXT SERVICE NEEDED BY2`
  - `NEXT SERVICE NEEDED BY3`
  - `NEXT SERVICE NEEDED BY4`
  - `NEXT SERVICE NEEDED BY5`

Make it clear what values these fields will be updated **to** (from the uploaded file). Ideally show old value → new value if possible, but at minimum show the new values that will be applied.

**Section 2: "Orders Being Created" (e.g., 80 rows)**

Show these rows in the existing table format with all current preview columns (Row, Restaurant, Service Type, Recurrence Pattern, Client, Subcontractor, Status). These are new recurring work orders that don't match any existing record.

---

## Implementation Approach

1. **New API endpoint or extension:** Create a `/api/recurring-work-orders/import/preview` endpoint (or add a `?preview=true` query param to the existing route) that accepts the parsed rows and returns which ones match existing records and which are new. Reuse the existing `findExistingRecurringWorkOrder` matching logic.

2. **Frontend state:** After file parsing, when mode is `update_or_create`, call the preview endpoint. Store the results to split rows into `updatingRows` and `creatingRows` arrays.

3. **UI updates in the modal:** Replace the single table with two collapsible sections:
   - "Updating X existing orders" — shows matched rows with the date fields being updated.
   - "Creating Y new orders" — shows unmatched rows in the current table format.

4. Keep all existing functionality intact — inline editing, client/subcontractor assignment, pagination, error display, and the final import submission should continue to work as before.

---

## Test File

Use the file `Spruce Copy of h.wood Preventative Maintenance Schedule.xlsx` (located in the project root) to test. It should have ~83 rows, with ~3 matching existing records and ~80 being new.

---

## Important Notes

- Do NOT change the matching logic itself — it already works correctly (Location + Service Type + Frequency).
- Do NOT change the backend import/update logic — only enhance the **preview/UI** to surface the update vs create distinction to the user before they confirm the import.
- The date fields (`LAST SERVICED`, `NEXT SERVICE NEEDED BY` through `NEXT SERVICE NEEDED BY5`) are the only fields that get updated on existing records — make this clear in the preview.
