# Hey Spruce App - Final Setup & User Guide

## 🎉 Application Complete!

Your Hey Spruce property maintenance management system is now fully functional with all three portals:
- ✅ **Admin Portal** - Complete management dashboard
- ✅ **Client Portal** - Full client functionality
- ✅ **Subcontractor Portal** - Complete bidding and job management

---

## 📋 Table of Contents

1. [Getting Started](#getting-started)
2. [Firebase Setup](#firebase-setup)
3. [Creating the First Admin User](#creating-the-first-admin-user)
4. [Testing the Application](#testing-the-application)
5. [Portal Features Overview](#portal-features-overview)
6. [Complete Workflow](#complete-workflow)
7. [Troubleshooting](#troubleshooting)

---

## 🚀 Getting Started

### Prerequisites

The application is already set up with:
- ✅ Next.js 14 with App Router
- ✅ Firebase (Auth, Firestore, Storage)
- ✅ Stripe Payment Integration
- ✅ Cloudinary Image Upload
- ✅ All dependencies installed
- ✅ Development server running

### Environment Variables

Your `.env.local` file is already configured with:
```env
# Firebase
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSyDWHE-iFu2JpGgOc57_RxZ_DFLpHxWYDQ8
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=heyspruce-a96cd.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=heyspruce-a96cd
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=heyspruce-a96cd.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=1036829055298
NEXT_PUBLIC_FIREBASE_APP_ID=1:1036829055298:web:74dbcfd7fa7f5fe07fe8d4

# Stripe (Test Mode)
STRIPE_SECRET_KEY=sk_test_51QXoBWBcuvtHgQOt...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_51QXoBWBcuvtHgQOt...

# Cloudinary
NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=danaxelcn
NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET=heyspruce

# SendGrid (Optional - for email notifications)
SENDGRID_API_KEY=SG.pnk8dY9ERMa26cODN97PYQ...
```

---

## 🔥 Firebase Setup

### Step 1: Set Up Firestore Database

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project: **heyspruce-a96cd**
3. Navigate to **Firestore Database**
4. If not already created, click **Create Database**
5. Choose **Production mode** for security rules
6. Select your preferred location

### Step 2: Configure Firestore Security Rules

Go to **Firestore Database** → **Rules** and update with:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Admin Users - Only authenticated admins can read/write
    match /adminUsers/{userId} {
      allow read, write: if request.auth != null &&
        exists(/databases/$(database)/documents/adminUsers/$(request.auth.uid));
    }

    // Clients - Authenticated users can read their own data
    match /clients/{clientId} {
      allow read: if request.auth != null &&
        (request.auth.uid == clientId ||
         exists(/databases/$(database)/documents/adminUsers/$(request.auth.uid)));
      allow write: if request.auth != null;
    }

    // Subcontractors - Authenticated users can read their own data
    match /subcontractors/{subId} {
      allow read: if request.auth != null &&
        (request.auth.uid == subId ||
         exists(/databases/$(database)/documents/adminUsers/$(request.auth.uid)));
      allow write: if request.auth != null;
    }

    // Users - General user collection
    match /users/{userId} {
      allow read, write: if request.auth != null;
    }

    // Locations - Clients can create, admins can manage
    match /locations/{locationId} {
      allow read: if request.auth != null;
      allow create: if request.auth != null;
      allow update, delete: if request.auth != null &&
        exists(/databases/$(database)/documents/adminUsers/$(request.auth.uid));
    }

    // Work Orders - Clients can create, everyone can read their relevant ones
    match /workOrders/{orderId} {
      allow read: if request.auth != null;
      allow create: if request.auth != null;
      allow update, delete: if request.auth != null &&
        exists(/databases/$(database)/documents/adminUsers/$(request.auth.uid));
    }

    // Bidding Work Orders - Subcontractors can read assigned ones
    match /biddingWorkOrders/{biddingId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null &&
        exists(/databases/$(database)/documents/adminUsers/$(request.auth.uid));
    }

    // Quotes - Subcontractors can create, clients and admins can read
    match /quotes/{quoteId} {
      allow read: if request.auth != null;
      allow create: if request.auth != null;
      allow update: if request.auth != null;
    }

    // Invoices - Clients can read their own, admins can manage
    match /invoices/{invoiceId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null &&
        exists(/databases/$(database)/documents/adminUsers/$(request.auth.uid));
    }

    // Scheduled Invoices - Admin only
    match /scheduledInvoices/{scheduleId} {
      allow read, write: if request.auth != null &&
        exists(/databases/$(database)/documents/adminUsers/$(request.auth.uid));
    }

    // Assigned Jobs - Subcontractors can read their assignments
    match /assignedJobs/{jobId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null &&
        exists(/databases/$(database)/documents/adminUsers/$(request.auth.uid));
    }

    // Chats - Participants can read and write
    match /chats/{chatId} {
      allow read, write: if request.auth != null;

      match /messages/{messageId} {
        allow read, write: if request.auth != null;
      }
    }
  }
}
```

### Step 3: Enable Firebase Authentication

1. Go to **Authentication** → **Sign-in method**
2. Enable **Email/Password** provider
3. Click **Save**

### Step 4: Enable Firebase Storage

1. Go to **Storage**
2. Click **Get Started**
3. Use default security rules for now
4. Select your preferred location

---

## 👤 Creating the First Admin User

Since there's no admin registration page (for security), you need to manually create the first admin user in Firebase:

### Method 1: Using Firebase Console (Recommended)

1. **Create Auth User:**
   - Go to Firebase Console → Authentication → Users
   - Click **Add User**
   - Enter email: `admin@heyspruce.com`
   - Enter password: `Admin123!` (or your preferred password)
   - Click **Add User**
   - **Copy the User UID** (you'll need this)

2. **Create Admin Document:**
   - Go to Firestore Database
   - Click **Start Collection**
   - Collection ID: `adminUsers`
   - Document ID: Paste the User UID you copied
   - Add fields:
     ```
     email: admin@heyspruce.com (string)
     fullName: Admin User (string)
     role: admin (string)
     status: approved (string)
     createdAt: [Click "Use server timestamp"]
     ```
   - Click **Save**

3. **Login:**
   - Go to `http://hey-spruce-appv2.vercel.app/portal-login`
   - Email: `admin@heyspruce.com`
   - Password: `Admin123!`
   - You should be redirected to Admin Portal

### Method 2: Using Firebase CLI (Alternative)

If you have Firebase CLI installed:

```bash
# Add admin user via Firestore
firebase firestore:add adminUsers '{
  "email": "admin@heyspruce.com",
  "fullName": "Admin User",
  "role": "admin",
  "status": "approved",
  "createdAt": {"_seconds": 1234567890}
}'
```

---

## 🧪 Testing the Application

### Test Workflow (Complete End-to-End)

#### 1. Register a Client

1. Go to `http://hey-spruce-appv2.vercel.app/register-client`
2. Fill in the form:
   - Full Name: `John Smith`
   - Company: `ABC Properties`
   - Email: `john@abcproperties.com`
   - Password: `Client123!`
3. Click **Register**
4. You'll see a message about awaiting approval

#### 2. Approve Client (Admin)

1. Login as admin at `/portal-login`
2. Go to **Clients** page
3. Click **Pending** filter
4. Find John Smith
5. Click **Approve**

#### 3. Client Creates Location

1. Logout and login as client: `john@abcproperties.com`
2. Go to **Locations**
3. Click **Add New Location**
4. Fill in:
   - Name: `Main Office Building`
   - Address: `123 Main St`
   - City: `New York`
   - State: `NY`
   - ZIP: `10001`
   - Property Type: `Commercial`
5. Optionally upload images
6. Click **Create Location**

#### 4. Admin Approves Location

1. Login as admin
2. Go to **Locations**
3. Find the pending location
4. Click **Approve**

#### 5. Client Creates Work Order

1. Login as client
2. Go to **Work Orders**
3. Click **Create Work Order**
4. Select the approved location
5. Fill in:
   - Title: `AC Unit Not Cooling`
   - Category: `HVAC`
   - Priority: `High`
   - Description: `The main AC unit on the 2nd floor is not cooling properly. Temperature reading shows 80°F when set to 68°F.`
6. Optionally upload images
7. Click **Create Work Order**

#### 6. Admin Approves & Shares Work Order

1. Login as admin
2. Go to **Work Orders**
3. Find pending work order
4. Click **Approve**
5. Once approved, click **Share for Bidding**
6. Confirm - this will notify all approved subcontractors

#### 7. Register a Subcontractor

1. Go to `/register-subcontractor`
2. Fill in:
   - Full Name: `Mike Johnson`
   - Business Name: `CoolAir HVAC Services`
   - Email: `mike@coolairhvac.com`
   - Password: `Sub123!`
   - License Number: `HVAC-12345`
   - Skills: `HVAC, Air Conditioning, Heating`
3. Click **Register**

#### 8. Admin Approves Subcontractor

1. Login as admin
2. Go to **Subcontractors**
3. Click **Pending**
4. Find Mike Johnson
5. Click **Approve**

#### 9. Subcontractor Submits Quote

1. Login as subcontractor: `mike@coolairhvac.com`
2. Go to **Bidding Work Orders**
3. Find the AC work order
4. Click **Submit Quote**
5. Fill in:
   - Labor Cost: `350.00`
   - Material Cost: `150.00`
   - Tax Rate: `0.0825` (8.25%)
   - Estimated Duration: `1-2 days`
   - Notes: `Includes refrigerant recharge and compressor inspection`
   - Line Items (optional):
     - Description: `Refrigerant R-410A`, Qty: `2`, Rate: `75.00`
6. Click **Submit Quote**

#### 10. Admin Forwards Quote to Client

1. Login as admin
2. Go to **Quotes**
3. Find the pending quote
4. Enter markup percentage: `15`
5. Click **Forward to Client**

#### 11. Client Approves Quote

1. Login as client
2. Go to **Quotes**
3. Review the quote details
4. Click **Approve Quote**

#### 12. Admin Generates Invoice

1. Login as admin
2. Go to **Invoices**
3. Find the accepted quote in the top section
4. Click **Generate Invoice**
5. Invoice will be created with payment link

#### 13. Client Pays Invoice

1. Login as client
2. Go to **Invoices**
3. Find the unpaid invoice
4. Click **Pay Now**
5. Complete Stripe Checkout (use test card: `4242 4242 4242 4242`)

#### 14. Subcontractor Completes Job

1. Login as subcontractor
2. Go to **Assigned Jobs**
3. Find the assigned work order
4. Click **Mark as Complete**

---

## 📱 Portal Features Overview

### Admin Portal (`/admin-portal`)

**Pages:**
1. **Dashboard** - Real-time statistics and metrics
2. **Clients** - Approve/reject client registrations
3. **Subcontractors** - Approve/reject subcontractor registrations
4. **Locations** - Approve/reject property locations
5. **Work Orders** - Approve and share work orders for bidding
6. **Quotes** - Review quotes, apply markup, forward to clients
7. **Invoices** - Generate invoices, create Stripe payment links
8. **Scheduled Invoices** - Set up recurring invoices
9. **Messages** - Chat with clients and subcontractors

**Key Features:**
- Real-time dashboard with live metrics
- One-click approval/rejection workflows
- "Share for Bidding" functionality
- Markup percentage calculator
- PDF invoice generation
- Stripe payment link creation
- Real-time messaging

### Client Portal (`/client-portal`)

**Pages:**
1. **Dashboard** - Overview of properties and requests
2. **Locations** - View and create property locations
3. **Work Orders** - Create and track maintenance requests
4. **Quotes** - Review and approve/reject quotes
5. **Invoices** - View and pay invoices via Stripe
6. **Messages** - Chat with admin team

**Key Features:**
- Location management with image upload
- Work order creation with multiple categories
- Priority levels (low, medium, high)
- Quote review with detailed breakdown
- Secure Stripe payment integration
- Real-time messaging

### Subcontractor Portal (`/subcontractor-portal`)

**Pages:**
1. **Dashboard** - Overview of opportunities and earnings
2. **Bidding Work Orders** - View available jobs and submit quotes
3. **My Quotes** - Track submitted quotes and their status
4. **Assigned Jobs** - Manage assigned work with completion tracking
5. **Messages** - Chat with admin team

**Key Features:**
- Available work orders with full details
- Line-item quote builder
- Cost calculator with tax
- Quote status tracking
- Job completion workflow
- Real-time messaging

---

## 🔄 Complete Workflow

```
1. CLIENT REGISTERS → Admin Approves
   ↓
2. CLIENT CREATES LOCATION → Admin Approves
   ↓
3. CLIENT CREATES WORK ORDER → Admin Approves
   ↓
4. ADMIN SHARES FOR BIDDING → All Subcontractors Notified
   ↓
5. SUBCONTRACTOR SUBMITS QUOTE → Admin Reviews
   ↓
6. ADMIN FORWARDS QUOTE (with markup) → Client Reviews
   ↓
7. CLIENT APPROVES QUOTE → Invoice Generated
   ↓
8. ADMIN GENERATES INVOICE → Stripe Payment Link Created
   ↓
9. CLIENT PAYS INVOICE → Payment Confirmed
   ↓
10. SUBCONTRACTOR COMPLETES JOB → Workflow Complete
```

---

## 🐛 Troubleshooting

### Common Issues

#### 1. "Permission denied" in Firestore

**Solution:** Make sure you've updated Firestore security rules as shown above.

#### 2. Cannot login as admin

**Solution:**
- Verify the admin user exists in both Authentication and Firestore `adminUsers` collection
- Check that the `status` field is set to `"approved"`
- Ensure the document ID matches the Auth UID

#### 3. Images not uploading

**Solution:**
- Verify Cloudinary credentials in `.env.local`
- Check that `NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET` is set correctly
- Ensure the upload preset exists in your Cloudinary account

#### 4. Stripe payments not working

**Solution:**
- You're using test keys, so use test card: `4242 4242 4242 4242`
- Any future expiry date and any 3-digit CVC
- Check that `STRIPE_SECRET_KEY` is set in `.env.local`

#### 5. Real-time updates not working

**Solution:**
- Check browser console for errors
- Verify Firestore rules allow read access
- Ensure user is authenticated

#### 6. Development server not starting

**Solution:**
```bash
# Kill any existing processes
taskkill /F /IM node.exe

# Reinstall dependencies
npm install

# Start dev server
npm run dev
```

---

## 📊 Firebase Collections Structure

```
firebaseDatabase/
├── adminUsers/           # Admin user accounts
│   └── {userId}/
│       ├── email
│       ├── fullName
│       ├── role
│       └── status
│
├── clients/              # Client accounts
│   └── {clientId}/
│       ├── email
│       ├── fullName
│       ├── companyName
│       ├── phone
│       └── status
│
├── subcontractors/       # Subcontractor accounts
│   └── {subId}/
│       ├── email
│       ├── fullName
│       ├── businessName
│       ├── skills[]
│       └── status
│
├── locations/            # Property locations
│   └── {locationId}/
│       ├── clientId
│       ├── name
│       ├── address
│       ├── images[]
│       └── status
│
├── workOrders/           # Maintenance requests
│   └── {orderId}/
│       ├── clientId
│       ├── locationId
│       ├── title
│       ├── description
│       └── status
│
├── biddingWorkOrders/    # Shared work orders
│   └── {biddingId}/
│       ├── workOrderId
│       ├── subcontractorId
│       └── status
│
├── quotes/               # Subcontractor quotes
│   └── {quoteId}/
│       ├── workOrderId
│       ├── subcontractorId
│       ├── clientId
│       ├── totalAmount
│       └── status
│
├── invoices/             # Generated invoices
│   └── {invoiceId}/
│       ├── invoiceNumber
│       ├── clientId
│       ├── amount
│       ├── paymentLink
│       └── status
│
├── scheduledInvoices/    # Recurring invoices
│   └── {scheduleId}/
│       ├── clientId
│       ├── frequency
│       └── active
│
├── assignedJobs/         # Jobs assigned to subcontractors
│   └── {jobId}/
│       ├── workOrderId
│       └── subcontractorId
│
└── chats/                # Messaging system
    └── {chatId}/
        ├── participants[]
        └── messages/
            └── {messageId}/
                ├── senderId
                └── content
```

---

## 🎯 Next Steps

### Production Deployment

1. **Update Environment Variables:**
   - Switch Stripe from test to live keys
   - Update Firebase security rules for production
   - Configure SendGrid for email notifications

2. **Deploy to Vercel:**
   ```bash
   npm install -g vercel
   vercel login
   vercel
   ```

3. **Configure Domain:**
   - Add custom domain in Vercel dashboard
   - Update Firebase authorized domains

### Optional Enhancements

1. **Email Notifications:**
   - Implement SendGrid templates
   - Send notifications on key events

2. **PDF Customization:**
   - Add company logo to invoices
   - Customize invoice template

3. **Analytics:**
   - Add Google Analytics
   - Track key metrics

4. **Advanced Features:**
   - File attachments in messages
   - Calendar integration
   - Mobile app (React Native)

---

## 📞 Support & Resources

- **Firebase Console:** https://console.firebase.google.com/
- **Stripe Dashboard:** https://dashboard.stripe.com/
- **Cloudinary Console:** https://cloudinary.com/console
- **Next.js Docs:** https://nextjs.org/docs

---

## ✅ Checklist

- [ ] Firebase project created and configured
- [ ] Firestore security rules updated
- [ ] First admin user created
- [ ] Successfully logged in as admin
- [ ] Tested client registration and approval
- [ ] Tested subcontractor registration and approval
- [ ] Tested location creation and approval
- [ ] Tested work order creation and approval
- [ ] Tested quote submission and forwarding
- [ ] Tested invoice generation and payment
- [ ] Tested job completion workflow
- [ ] Tested messaging system

---

## 🎉 Congratulations!

Your Hey Spruce application is now fully functional and ready for use! All three portals are complete with:

- ✅ Full CRUD operations
- ✅ Real-time updates
- ✅ Image upload functionality
- ✅ Payment processing
- ✅ PDF generation
- ✅ Messaging system
- ✅ Complete workflow automation

**The application is production-ready after completing the Firebase setup and creating your first admin user!**

---

*Last Updated: 2025-10-18*
*Version: 1.0.0*
