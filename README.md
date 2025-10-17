# Hey Spruce App - Property Maintenance Management System

## 🎉 Application Status

**Version:** 2.0.1 (Phased Development - Option 3)
**Status:** ✅ Core System Operational
**Development Server:** http://localhost:3000

---

## ✅ COMPLETED FEATURES

### 1. **Project Setup & Configuration** ✅
- ✅ Next.js 14 with TypeScript and App Router
- ✅ Tailwind CSS with shadcn/ui components
- ✅ Firebase (Auth, Firestore, Storage) integration
- ✅ All dependencies installed and configured
- ✅ Environment variables configured (.env.local)
- ✅ TypeScript type definitions for all data models

### 2. **Authentication System** ✅
- ✅ Portal Login page (`/portal-login`)
- ✅ Client Registration (`/register-client`)
- ✅ Subcontractor Registration (`/register-subcontractor`)
- ✅ Firebase Authentication integration
- ✅ Role-based access control
- ✅ Automatic portal routing based on user role

### 3. **Admin Portal** ✅
- ✅ Admin Dashboard with real-time statistics
- ✅ Sidebar navigation with all menu items
- ✅ Clients Management (approve/reject registrations)
- ✅ Subcontractors Management (approve/reject registrations)
- ✅ Protected routes with auth middleware
- ✅ Real-time data updates with Firestore listeners

### 4. **Home Page** ✅
- ✅ Landing page with portal cards
- ✅ Navigation to all three portals
- ✅ Links to registration pages

---

## 🚧 PENDING FEATURES (Ready for Implementation)

### Admin Portal Pages (Templates Needed):
- ⏳ Locations Management
- ⏳ Work Orders Management
- ⏳ Quotes Management
- ⏳ Invoices Management (with PDF & Stripe)
- ⏳ Scheduled Invoices
- ⏳ Chat/Messages

### Client Portal (Template Needed):
- ⏳ Client Dashboard
- ⏳ Create Locations
- ⏳ Submit Work Orders
- ⏳ View Quotes
- ⏳ Pay Invoices

### Subcontractor Portal (Template Needed):
- ⏳ Subcontractor Dashboard
- ⏳ View Bidding Work Orders
- ⏳ Submit Quotes
- ⏳ View Assigned Work Orders
- ⏳ Mark Work Complete

### API Routes (All Pending):
- ⏳ Locations API
- ⏳ Work Orders API
- ⏳ Quotes API
- ⏳ Invoices API (with Stripe integration)
- ⏳ Scheduled Invoices API
- ⏳ Chat/Messages API

### Integrations:
- ⏳ Stripe Payment Links
- ⏳ SendGrid Email Notifications
- ⏳ Cloudinary Image Uploads
- ⏳ PDF Invoice Generation (jsPDF)

---

## 🚀 QUICK START GUIDE

### Prerequisites
- Node.js 18+ installed
- Firebase project created
- Stripe account (test mode)
- SendGrid account (optional for emails)

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment Variables
The `.env.local` file is already configured with your Firebase and Stripe credentials:
- Firebase Config: ✅ Configured
- Cloudinary: ✅ Configured
- Stripe Keys: ✅ Configured
- SendGrid: ⚠️ Add your API key

### 3. Firebase Setup
**Important:** You need to create an admin user manually in Firebase:

1. Go to Firebase Console → Authentication
2. Add a new user with email/password
3. Go to Firestore Database
4. Create a collection named `adminUsers`
5. Add a document with the user's UID as the document ID:
```json
{
  "uid": "your-user-uid",
  "email": "admin@heyspruce.com",
  "fullName": "Admin User",
  "role": "admin",
  "createdAt": "2024-10-17T00:00:00.000Z"
}
```

### 4. Run Development Server
```bash
npm run dev
```

Visit: **http://localhost:3000**

---

## 🧪 TESTING THE APPLICATION

### Test Flow 1: Client Registration & Approval
1. Go to http://localhost:3000
2. Click "Register as Client"
3. Fill in the form:
   - Full Name: John Doe
   - Email: john@test.com
   - Company: Test Company
   - Phone: +1 555-123-4567
   - Password: test123
4. Submit registration
5. Login as admin at `/portal-login`
6. Navigate to "Clients" in admin portal
7. You should see the pending client
8. Click "Approve"
9. Logout and login as the client to access client portal

### Test Flow 2: Subcontractor Registration & Approval
1. Click "Register as Subcontractor"
2. Fill in the form:
   - Full Name: Mike Smith
   - Business Name: Smith Services
   - Email: mike@smithservices.com
   - Phone: +1 555-987-6543
   - Skills: HVAC, Plumbing, Electrical
   - License: LIC-12345
   - Password: test123
3. Submit registration
4. Login as admin
5. Navigate to "Subcontractors"
6. Approve the subcontractor
7. Logout and login as subcontractor to access their portal

### Test Flow 3: Admin Dashboard
1. Login as admin
2. Dashboard shows real-time statistics:
   - Pending client approvals
   - Pending subcontractor approvals
   - Pending locations
   - Pending work orders
   - Total invoices
   - Total revenue

---

## 📁 PROJECT STRUCTURE

```
SpruceApp/
├── app/
│   ├── admin-portal/
│   │   ├── page.tsx                    # ✅ Dashboard
│   │   ├── clients/
│   │   │   └── page.tsx                # ✅ Clients Management
│   │   ├── subcontractors/
│   │   │   └── page.tsx                # ✅ Subcontractors Management
│   │   ├── locations/                  # ⏳ To be created
│   │   ├── work-orders/                # ⏳ To be created
│   │   ├── quotes/                     # ⏳ To be created
│   │   ├── invoices/                   # ⏳ To be created
│   │   ├── scheduled-invoices/         # ⏳ To be created
│   │   └── messages/                   # ⏳ To be created
│   ├── client-portal/                  # ⏳ To be created
│   ├── subcontractor-portal/           # ⏳ To be created
│   ├── portal-login/
│   │   └── page.tsx                    # ✅ Login Page
│   ├── register-client/
│   │   └── page.tsx                    # ✅ Client Registration
│   ├── register-subcontractor/
│   │   └── page.tsx                    # ✅ Subcontractor Registration
│   ├── api/                            # ⏳ All API routes to be created
│   ├── globals.css                     # ✅ Global styles
│   ├── layout.tsx                      # ✅ Root layout
│   └── page.tsx                        # ✅ Home page
├── components/
│   ├── ui/                             # ✅ shadcn/ui components
│   │   ├── button.tsx
│   │   ├── card.tsx
│   │   ├── input.tsx
│   │   ├── label.tsx
│   │   ├── toast.tsx
│   │   ├── toaster.tsx
│   │   └── use-toast.ts
│   └── admin-layout.tsx                # ✅ Admin Portal Layout
├── lib/
│   ├── firebase.ts                     # ✅ Firebase configuration
│   ├── auth-context.tsx                # ✅ Auth context (unused currently)
│   └── utils.ts                        # ✅ Utility functions
├── types/
│   └── index.ts                        # ✅ TypeScript interfaces
├── .env.local                          # ✅ Environment variables
├── next.config.js                      # ✅ Next.js configuration
├── tailwind.config.ts                  # ✅ Tailwind configuration
├── tsconfig.json                       # ✅ TypeScript configuration
└── package.json                        # ✅ Dependencies

```

---

## 🔑 FIREBASE COLLECTIONS STRUCTURE

Your Firestore database needs these collections:

### 1. **adminUsers**
```javascript
{
  uid: string,
  email: string,
  fullName: string,
  role: "admin",
  createdAt: timestamp
}
```

### 2. **clients**
```javascript
{
  uid: string,
  email: string,
  fullName: string,
  companyName: string (optional),
  phone: string,
  status: "pending" | "approved" | "rejected",
  approvedBy: string (optional),
  approvedAt: timestamp (optional),
  createdAt: timestamp,
  updatedAt: timestamp
}
```

### 3. **subcontractors**
```javascript
{
  uid: string,
  email: string,
  fullName: string,
  businessName: string,
  phone: string,
  skills: string[],
  licenseNumber: string (optional),
  status: "pending" | "approved" | "rejected",
  approvedBy: string (optional),
  approvedAt: timestamp (optional),
  createdAt: timestamp,
  updatedAt: timestamp
}
```

### 4. **users** (General user collection)
```javascript
{
  id: string,
  email: string,
  fullName: string,
  role: "admin" | "client" | "subcontractor",
  createdAt: timestamp,
  updatedAt: timestamp
}
```

---

## 🎨 UI COMPONENTS AVAILABLE

All shadcn/ui components are configured and ready to use:

- `<Button>` - Primary, secondary, outline, ghost, link variants
- `<Card>` - Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter
- `<Input>` - Text, email, password, tel, etc.
- `<Label>` - Form labels
- `<Toast>` - Toast notifications (via useToast hook)

### Usage Example:
```tsx
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';

const { toast } = useToast();

toast({
  title: 'Success',
  description: 'Operation completed successfully',
});
```

---

## 🔐 AUTHENTICATION FLOW

### Current Implementation:
1. User registers (client or subcontractor)
2. Firebase Auth account created
3. Firestore document created with `status: "pending"`
4. User logs in at `/portal-login`
5. System checks which collection the user belongs to
6. If status is "approved", redirects to appropriate portal
7. If status is "pending", shows "awaiting approval" message

### Admin Login:
- Admins must be manually created in Firebase
- No registration page for admins (security)
- Admin portal only accessible with `adminUsers` collection entry

---

## 📊 REAL-TIME FEATURES

The following use Firestore real-time listeners:

1. **Admin Dashboard Stats** - Updates automatically when:
   - New clients register
   - New subcontractors register
   - Locations are created
   - Work orders are submitted

2. **Clients/Subcontractors Lists** - Auto-refresh when approvals change

---

## 🌟 KEY FEATURES IMPLEMENTED

### 1. Role-Based Access Control
- Automatic portal detection based on Firestore collections
- Protected routes with authentication checks
- Status-based access (pending users cannot login)

### 2. Registration Approval Workflow
- Self-service registration for clients and subcontractors
- Admin review and approval required
- One-click approve/reject buttons
- Real-time status updates

### 3. Beautiful UI
- Gradient backgrounds
- Card-based layouts
- Responsive design
- Icon integration (Lucide React)
- Toast notifications for all actions

### 4. Admin Portal Features
- Collapsible sidebar navigation
- Real-time statistics dashboard
- Grid-based management views
- Status badges and filters
- Professional layout with sticky header

---

## 🛠️ TECHNOLOGY STACK

### Frontend:
- **Next.js 14** - React framework with App Router
- **TypeScript 5.2** - Type safety
- **Tailwind CSS 3.3** - Styling
- **shadcn/ui** - UI component library
- **Lucide React** - Icon library

### Backend:
- **Firebase Authentication** - User management
- **Firestore** - NoSQL database
- **Firebase Storage** - File uploads (configured)

### Integrations (Configured):
- **Stripe** - Payment processing (keys ready)
- **Cloudinary** - Image uploads (configured)
- **SendGrid** - Email notifications (needs API key)

### PDF & Charts (Dependencies Installed):
- **jsPDF** - PDF generation
- **html2canvas** - HTML to canvas
- **D3.js** - Data visualizations

---

## 🎯 NEXT STEPS FOR COMPLETION

### Phase 1: Complete Admin Portal (Priority)
1. **Locations Management Page**
   - List all locations
   - Approve/reject location requests
   - View location details
   - Similar to clients/subcontractors pages

2. **Work Orders Management Page**
   - List all work orders with status
   - Approve/reject work orders
   - Share with subcontractors for bidding
   - Assign to subcontractor after quote approval

3. **Quotes Management Page**
   - View quotes from subcontractors
   - Apply markup percentage
   - Forward to client for approval

4. **Invoices Management Page**
   - Generate invoices from accepted quotes
   - Create Stripe payment link
   - Generate PDF
   - Send email with PDF + payment link

5. **Scheduled Invoices Page**
   - Create recurring invoice schedules
   - Execute scheduled invoices

6. **Messages Page**
   - Chat interface
   - List conversations
   - Send/receive messages

### Phase 2: Build Client Portal
1. Dashboard
2. Locations (create, view)
3. Work Orders (create, view status)
4. Quotes (view, approve/reject)
5. Invoices (view, pay)
6. Messages

### Phase 3: Build Subcontractor Portal
1. Dashboard
2. Bidding Work Orders (view, submit quotes)
3. Assigned Work Orders (view, complete)
4. Earnings tracking
5. Messages

### Phase 4: API Routes
Create all backend API routes for:
- Locations CRUD + approval
- Work Orders CRUD + lifecycle management
- Quotes CRUD + approval workflow
- Invoices generation + Stripe integration
- Scheduled Invoices automation
- Chat/messaging

### Phase 5: Integrations
1. **Stripe Payment Links**
   - Create checkout sessions
   - Handle webhooks
   - Update invoice status

2. **SendGrid Emails**
   - Invoice emails with PDF
   - Notification emails
   - Approval emails

3. **Cloudinary Uploads**
   - Work order images
   - Chat attachments

4. **PDF Generation**
   - Invoice PDFs matching the format in `finalInvoice.txt`

---

## 📝 EXAMPLE DATA FROM real_examples.txt

The application should support quotes like:

**Example 1: Delilah / Vico Service**
- Swamp cooler service – $600
- Clean condenser coils for refrigerators, walk-in cooler, stand freezer, and bar freezer – $1,200
- Clean 7 A/C condenser coils – $1,400
- **Total Package:** $3,200
- **Package Deal:** $2,500

**Clients:**
- jacob@hwoodgroup.com
- aameziane@hwoodgroup.com

**Subcontractor:**
- needaccallvic@icloud.com

---

## 🐛 TROUBLESHOOTING

### Issue: "Cannot find module" errors
**Solution:** Run `npm install` again

### Issue: Firebase connection errors
**Solution:** Check `.env.local` has correct Firebase credentials

### Issue: Admin cannot login
**Solution:** Create admin user manually in Firebase (see setup guide)

### Issue: Registration fails
**Solution:**
1. Check Firebase Authentication is enabled in Firebase Console
2. Check Firestore rules allow writes to clients/subcontractors collections

### Issue: Page redirects to login immediately
**Solution:** Firestore security rules may be blocking reads. Update rules to allow authenticated users.

---

## 📚 USEFUL FIREBASE FIRESTORE RULES

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Admin users - only admins can read/write
    match /adminUsers/{userId} {
      allow read, write: if request.auth != null &&
        exists(/databases/$(database)/documents/adminUsers/$(request.auth.uid));
    }

    // Clients - users can create, admins can update
    match /clients/{clientId} {
      allow create: if request.auth != null;
      allow read: if request.auth != null;
      allow update: if request.auth != null &&
        exists(/databases/$(database)/documents/adminUsers/$(request.auth.uid));
    }

    // Subcontractors - users can create, admins can update
    match /subcontractors/{subId} {
      allow create: if request.auth != null;
      allow read: if request.auth != null;
      allow update: if request.auth != null &&
        exists(/databases/$(database)/documents/adminUsers/$(request.auth.uid));
    }

    // Users collection
    match /users/{userId} {
      allow create: if request.auth != null;
      allow read: if request.auth != null;
    }
  }
}
```

---

## 🎓 LEARNING RESOURCES

- [Next.js 14 Documentation](https://nextjs.org/docs)
- [Firebase Documentation](https://firebase.google.com/docs)
- [Tailwind CSS Documentation](https://tailwindcss.com/docs)
- [shadcn/ui Components](https://ui.shadcn.com)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)

---

## 📞 SUPPORT

For issues or questions:
1. Check this README
2. Review the COMPLETE_DOCUMENTATION.html file
3. Check Firebase Console for data issues
4. Review browser console for errors

---

## ✨ CREDITS

**Developed for:** Hey Spruce App
**Version:** 2.0.1
**Build Date:** October 17, 2024
**Framework:** Next.js 14 + Firebase

---

**🚀 Your application is now ready for development!**

Access it at: **http://localhost:3000**

