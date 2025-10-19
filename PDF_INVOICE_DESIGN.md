# PDF Invoice Design Update

## Overview
The PDF invoice has been completely redesigned with a modern, professional look matching the Hey Spruce brand.

## Key Features

### 1. **Spruce Logo Integration**
- ✅ Real Spruce logo embedded as base64 (no external dependencies)
- Logo automatically fetched and converted using `scripts/convert-logo-to-base64.js`
- Fallback to styled text if logo fails to load

### 2. **Professional Color Scheme**
Matching property management industry standards:
- **Primary Green**: `#16a34a` (rgb: 22, 163, 74) - Professional, trustworthy
- **Secondary Teal**: `#0891b2` (rgb: 8, 145, 178) - Modern accent
- **Dark Slate**: `#1e293b` (rgb: 30, 41, 59) - Headers and important text
- **Gray Tones**: `#64748b`, `#e2e8f0` - Supporting elements
- **Text Color**: `#334155` (rgb: 51, 65, 85) - Readable body text

### 3. **Modern Design Elements**
- ✅ Rounded corners on boxes and buttons
- ✅ Alternating row colors in tables for better readability
- ✅ Color-coded sections (Bill To, Payment Methods, Notes)
- ✅ Highlighted "Amount Due" section with green background
- ✅ Professional footer with contact information

### 4. **Responsive Layout**
- ✅ A4 page format (210mm x 297mm)
- ✅ Proper margins and spacing
- ✅ Automatic page breaks for long invoices
- ✅ Table headers repeat on new pages
- ✅ Text wrapping for long descriptions

### 5. **Enhanced Sections**

#### Header
- Logo at top left
- "INVOICE" title at top right
- Invoice details in a light gray box (number, issue date)
- Company information below logo

#### Client Information
- "BILL TO" section with primary color
- Due date highlighted in green box on the right

#### Line Items Table
- Modern table with green header
- Alternating row backgrounds
- Bold amounts for easy scanning
- Columns: Description, Qty, Unit Price, Amount

#### Totals Section
- Light gray background box
- Subtotal, discount, and tax clearly shown
- "AMOUNT DUE" highlighted in green with white text
- Large, bold font for total

#### Payment Methods
- Light gray box with payment instructions
- Clear formatting with bullet points
- Online payment and check options

#### Footer
- Horizontal line separator
- Page numbers
- Copyright notice
- Contact email

## Files Modified

1. **`lib/pdf-generator.ts`** - Main PDF generation logic
2. **`lib/logo-base64.ts`** - Base64 encoded Spruce logo (auto-generated)
3. **`scripts/convert-logo-to-base64.js`** - Script to convert logo to base64

## Usage

The PDF generator exports three functions:

```typescript
// Generate PDF document object
const pdf = generateInvoicePDF(invoiceData);

// Download PDF directly
downloadInvoicePDF(invoiceData);

// Get base64 string for email attachments
const base64String = getInvoicePDFBase64(invoiceData);
```

## Updating the Logo

If the Spruce logo changes, run:

```bash
node scripts/convert-logo-to-base64.js
```

This will automatically download the latest logo from the CDN and convert it to base64.

## Design Philosophy

The new design follows these principles:
1. **Professional** - Clean, modern layout suitable for business invoices
2. **Readable** - High contrast, clear typography, proper spacing
3. **Branded** - Uses Hey Spruce colors and logo
4. **Functional** - Easy to scan for important information (amounts, due dates)
5. **Consistent** - Matches the web application's design language

## Benefits

- ✅ Professional appearance increases trust
- ✅ Better readability improves customer experience
- ✅ Brand consistency across all touchpoints
- ✅ Responsive design ensures proper printing
- ✅ Modern colors make invoices feel current and professional
