# Hey Spruce App - Development Guide

## 🎯 Implementation Roadmap for Remaining Features

This guide provides step-by-step instructions for implementing the remaining features of the Hey Spruce App.

---

## 📋 QUICK REFERENCE: What's Done & What's Needed

### ✅ COMPLETED (100% Functional)
- Authentication System (Login, Registration for Client/Subcontractor)
- Admin Portal Layout & Navigation
- Admin Dashboard with Real-time Stats
- Clients Management (Approve/Reject)
- Subcontractors Management (Approve/Reject)
- Firebase Integration
- UI Component Library

### ⏳ TO BE IMPLEMENTED
- 6 Admin Portal Pages
- 2 Complete Portals (Client + Subcontractor)
- 15+ API Routes
- Stripe Integration
- Email Notifications
- PDF Generation

---

## 🏗️ PHASE 1: Complete Admin Portal Pages

### 1.1 Locations Management Page

**File:** `app/admin-portal/locations/page.tsx`

**Pattern:** Similar to `clients/page.tsx` and `subcontractors/page.tsx`

**Key Features:**
- List all locations from Firestore `locations` collection
- Filter by status (all, pending, approved, rejected)
- Display location details (name, address, property type)
- Approve/reject buttons for pending locations
- Real-time updates

**Code Template:**
```tsx
'use client';

import { useState, useEffect } from 'react';
import { collection, query, getDocs, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import AdminLayout from '@/components/admin-layout';

export default function LocationsManagement() {
  const [locations, setLocations] = useState([]);
  const [filter, setFilter] = useState('all');

  const fetchLocations = async () => {
    const q = query(collection(db, 'locations'));
    const snapshot = await getDocs(q);
    const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    setLocations(data);
  };

  const handleApprove = async (locationId) => {
    await updateDoc(doc(db, 'locations', locationId), {
      status: 'approved',
      approvedBy: auth.currentUser.uid,
      approvedAt: serverTimestamp(),
    });
    fetchLocations();
  };

  // Similar structure to clients/subcontractors pages
  return (
    <AdminLayout>
      {/* Your UI here */}
    </AdminLayout>
  );
}
```

---

### 1.2 Work Orders Management Page

**File:** `app/admin-portal/work-orders/page.tsx`

**Key Features:**
- List all work orders with status badges
- Filter by status (pending, approved, assigned, completed)
- View work order details (title, description, location, images)
- Approve/reject pending work orders
- "Share for Bidding" button to send to subcontractors
- Assign to subcontractor after quote approval

**Collections Used:**
- `workOrders` - Main work orders
- `biddingWorkOrders` - Work orders shared for quotes

**Status Flow:**
```
pending → approved → quotes_received → assigned → completed
```

**Key Actions:**
1. **Approve Work Order**
```tsx
await updateDoc(doc(db, 'workOrders', workOrderId), {
  status: 'approved',
  approvedBy: auth.currentUser.uid,
  approvedAt: serverTimestamp(),
});
```

2. **Share for Bidding**
```tsx
// Get approved subcontractors matching skills
const subsQuery = query(
  collection(db, 'subcontractors'),
  where('status', '==', 'approved')
);
const subs = await getDocs(subsQuery);

// Create bidding work order for each subcontractor
for (const sub of subs.docs) {
  await addDoc(collection(db, 'biddingWorkOrders'), {
    workOrderId: workOrder.id,
    subcontractorId: sub.id,
    workOrderTitle: workOrder.title,
    workOrderDescription: workOrder.description,
    status: 'pending',
    sharedAt: serverTimestamp(),
  });
}
```

---

### 1.3 Quotes Management Page

**File:** `app/admin-portal/quotes/page.tsx`

**Key Features:**
- List all quotes from subcontractors
- View quote details (line items, costs, totals)
- Apply markup percentage
- Forward to client for approval
- Track quote status

**Quote Data Structure:**
```tsx
interface Quote {
  id: string;
  workOrderId: string;
  subcontractorId: string;
  clientId: string;
  laborCost: number;
  materialCost: number;
  taxAmount: number;
  totalAmount: number;
  originalAmount: number; // Subcontractor's quote
  clientAmount: number; // With markup
  markupPercentage: number;
  lineItems: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    amount: number;
  }>;
  status: 'pending' | 'sent_to_client' | 'accepted' | 'rejected';
}
```

**Key Action - Apply Markup & Forward:**
```tsx
const applyMarkupAndForward = async (quoteId, markupPercent) => {
  const quoteRef = doc(db, 'quotes', quoteId);
  const quoteSnap = await getDoc(quoteRef);
  const quote = quoteSnap.data();

  const clientAmount = quote.totalAmount * (1 + markupPercent / 100);

  await updateDoc(quoteRef, {
    markupPercentage: markupPercent,
    clientAmount: clientAmount,
    status: 'sent_to_client',
    sentToClientAt: serverTimestamp(),
  });

  // TODO: Send email notification to client
};
```

---

### 1.4 Invoices Management Page

**File:** `app/admin-portal/invoices/page.tsx`

**Key Features:**
- Generate invoice from accepted quote
- Create Stripe payment link
- Generate PDF
- Send email with PDF + payment link
- Track payment status

**Step-by-Step Implementation:**

**Step 1: Generate Invoice from Quote**
```tsx
const generateInvoice = async (quoteId) => {
  const quoteSnap = await getDoc(doc(db, 'quotes', quoteId));
  const quote = quoteSnap.data();

  const invoiceData = {
    invoiceNumber: `SPRUCE-${Date.now().toString().slice(-8).toUpperCase()}`,
    quoteId: quoteId,
    workOrderId: quote.workOrderId,
    clientId: quote.clientId,
    clientName: quote.clientName,
    clientEmail: quote.clientEmail,
    totalAmount: quote.clientAmount,
    lineItems: quote.lineItems,
    status: 'draft',
    createdAt: serverTimestamp(),
  };

  const invoiceRef = await addDoc(collection(db, 'invoices'), invoiceData);
  return invoiceRef.id;
};
```

**Step 2: Create Stripe Payment Link**
```tsx
// API Route: app/api/stripe/create-payment-link/route.ts
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export async function POST(request) {
  const { invoiceId, amount, invoiceNumber } = await request.json();

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: [{
      price_data: {
        currency: 'usd',
        product_data: {
          name: `Invoice ${invoiceNumber}`,
        },
        unit_amount: Math.round(amount * 100), // Stripe uses cents
      },
      quantity: 1,
    }],
    mode: 'payment',
    success_url: `${process.env.NEXT_PUBLIC_BASE_URL}/payment-success?invoice_id=${invoiceId}`,
    cancel_url: `${process.env.NEXT_PUBLIC_BASE_URL}/payment-cancelled?invoice_id=${invoiceId}`,
    metadata: {
      invoiceId,
      invoiceNumber,
    },
  });

  return Response.json({ paymentLink: session.url });
}
```

**Step 3: Generate PDF**
```tsx
import jsPDF from 'jspdf';

const generateInvoicePDF = (invoice) => {
  const doc = new jsPDF();

  // Header
  doc.setFontSize(24);
  doc.text('Hey Spruce App', 20, 20);

  doc.setFontSize(16);
  doc.text('INVOICE', 20, 35);

  // Invoice Details
  doc.setFontSize(10);
  doc.text(`Invoice Number: ${invoice.invoiceNumber}`, 20, 50);
  doc.text(`Date: ${new Date().toLocaleDateString()}`, 20, 55);

  // Bill To
  doc.text('Bill To:', 20, 70);
  doc.text(invoice.clientName, 20, 75);
  doc.text(invoice.clientEmail, 20, 80);

  // Line Items Table
  let yPos = 100;
  doc.text('Description', 20, yPos);
  doc.text('Qty', 100, yPos);
  doc.text('Price', 130, yPos);
  doc.text('Amount', 160, yPos);

  yPos += 10;
  invoice.lineItems.forEach(item => {
    doc.text(item.description, 20, yPos);
    doc.text(String(item.quantity), 100, yPos);
    doc.text(`$${item.unitPrice}`, 130, yPos);
    doc.text(`$${item.amount}`, 160, yPos);
    yPos += 7;
  });

  // Total
  yPos += 10;
  doc.setFontSize(12);
  doc.text(`Total: $${invoice.totalAmount}`, 160, yPos);

  return doc;
};
```

**Step 4: Send Email**
```tsx
// API Route: app/api/invoices/[id]/send-email/route.ts
import sgMail from '@sendgrid/mail';

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

export async function POST(request, { params }) {
  const invoiceId = params.id;

  // Get invoice from Firestore
  const invoiceSnap = await getDoc(doc(db, 'invoices', invoiceId));
  const invoice = invoiceSnap.data();

  // Generate PDF
  const pdf = generateInvoicePDF(invoice);
  const pdfBase64 = pdf.output('dataurlstring').split(',')[1];

  // Send email
  const msg = {
    to: invoice.clientEmail,
    from: process.env.SENDGRID_FROM_EMAIL,
    subject: `Invoice ${invoice.invoiceNumber} - Hey Spruce App`,
    html: `
      <h1>Invoice ${invoice.invoiceNumber}</h1>
      <p>Dear ${invoice.clientName},</p>
      <p>Please find your invoice attached.</p>
      <p><strong>Amount Due: $${invoice.totalAmount}</strong></p>
      <p><a href="${invoice.stripePaymentLink}" style="background: #6366f1; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">Pay Online</a></p>
    `,
    attachments: [{
      content: pdfBase64,
      filename: `invoice_${invoice.invoiceNumber}.pdf`,
      type: 'application/pdf',
      disposition: 'attachment',
    }],
  };

  await sgMail.send(msg);

  // Update invoice status
  await updateDoc(doc(db, 'invoices', invoiceId), {
    status: 'sent',
    sentAt: serverTimestamp(),
  });

  return Response.json({ success: true });
}
```

---

### 1.5 Scheduled Invoices Page

**File:** `app/admin-portal/scheduled-invoices/page.tsx`

**Key Features:**
- Create recurring invoice schedules
- Set frequency (weekly, monthly, quarterly, yearly)
- Execute scheduled invoices manually
- Auto-generate invoices on schedule

**Data Structure:**
```tsx
interface ScheduledInvoice {
  clientId: string;
  title: string;
  description: string;
  amount: number;
  frequency: 'weekly' | 'monthly' | 'quarterly' | 'yearly';
  dayOfWeek?: number; // 0-6 for weekly
  dayOfMonth?: number; // 1-31 for monthly/quarterly/yearly
  time: string; // HH:MM
  isActive: boolean;
  nextExecution: Date;
  lastExecution?: Date;
}
```

**Execute Scheduled Invoice:**
```tsx
const executeScheduledInvoice = async (scheduleId) => {
  const scheduleSnap = await getDoc(doc(db, 'scheduled_invoices', scheduleId));
  const schedule = scheduleSnap.data();

  // Generate invoice
  const invoiceData = {
    invoiceNumber: `SPRUCE-${Date.now().toString().slice(-8).toUpperCase()}`,
    clientId: schedule.clientId,
    totalAmount: schedule.amount,
    status: 'draft',
    scheduledInvoiceId: scheduleId,
    createdAt: serverTimestamp(),
  };

  const invoiceRef = await addDoc(collection(db, 'invoices'), invoiceData);

  // Create Stripe payment link
  // Generate PDF
  // Send email

  // Update next execution date
  const nextExecution = calculateNextExecution(schedule);
  await updateDoc(doc(db, 'scheduled_invoices', scheduleId), {
    lastExecution: serverTimestamp(),
    nextExecution: nextExecution,
  });
};
```

---

### 1.6 Messages/Chat Page

**File:** `app/admin-portal/messages/page.tsx`

**Key Features:**
- List all conversations
- Click to open chat
- Send messages
- Real-time updates
- File attachments

**Collections:**
- `chats` - Chat metadata
- `chats/{chatId}/messages` - Messages subcollection

**Implementation:**
```tsx
const [chats, setChats] = useState([]);
const [selectedChat, setSelectedChat] = useState(null);
const [messages, setMessages] = useState([]);

// Load chats
useEffect(() => {
  const q = query(
    collection(db, 'chats'),
    where('participants', 'array-contains', auth.currentUser.uid)
  );

  const unsubscribe = onSnapshot(q, (snapshot) => {
    const chatsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    setChats(chatsData);
  });

  return unsubscribe;
}, []);

// Load messages for selected chat
useEffect(() => {
  if (!selectedChat) return;

  const messagesRef = collection(db, 'chats', selectedChat, 'messages');
  const q = query(messagesRef, orderBy('createdAt', 'asc'));

  const unsubscribe = onSnapshot(q, (snapshot) => {
    const messagesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    setMessages(messagesData);
  });

  return unsubscribe;
}, [selectedChat]);

// Send message
const sendMessage = async (content) => {
  await addDoc(collection(db, 'chats', selectedChat, 'messages'), {
    senderId: auth.currentUser.uid,
    senderName: 'Admin',
    content: content,
    seen: false,
    createdAt: serverTimestamp(),
  });

  // Update chat last message
  await updateDoc(doc(db, 'chats', selectedChat), {
    lastMessage: content,
    lastMessageTimestamp: serverTimestamp(),
  });
};
```

---

## 🏗️ PHASE 2: Client Portal

### File Structure:
```
app/client-portal/
├── page.tsx          # Dashboard
├── locations/
│   ├── page.tsx      # List locations
│   └── create/
│       └── page.tsx  # Create location
├── work-orders/
│   ├── page.tsx      # List work orders
│   └── create/
│       └── page.tsx  # Create work order
├── quotes/
│   └── page.tsx      # View & approve quotes
├── invoices/
│   └── page.tsx      # View & pay invoices
└── messages/
    └── page.tsx      # Chat with admin
```

### Client Layout Component:
```tsx
// components/client-layout.tsx
export default function ClientLayout({ children }) {
  // Similar to admin-layout.tsx but with client-specific menu items
  const menuItems = [
    { name: 'Dashboard', href: '/client-portal', icon: Home },
    { name: 'Locations', href: '/client-portal/locations', icon: Building2 },
    { name: 'Work Orders', href: '/client-portal/work-orders', icon: ClipboardList },
    { name: 'Quotes', href: '/client-portal/quotes', icon: FileText },
    { name: 'Invoices', href: '/client-portal/invoices', icon: Receipt },
    { name: 'Messages', href: '/client-portal/messages', icon: MessageSquare },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Similar structure to admin-layout */}
    </div>
  );
}
```

---

## 🏗️ PHASE 3: Subcontractor Portal

### File Structure:
```
app/subcontractor-portal/
├── page.tsx           # Dashboard
├── bidding/
│   └── page.tsx       # Available work orders for bidding
├── assigned/
│   └── page.tsx       # Assigned work orders
├── quotes/
│   └── page.tsx       # My submitted quotes
└── messages/
    └── page.tsx       # Chat with admin
```

### Key Features:

**1. Bidding Page - Submit Quote:**
```tsx
const submitQuote = async (workOrderId, quoteData) => {
  // Create quote
  await addDoc(collection(db, 'quotes'), {
    workOrderId: workOrderId,
    subcontractorId: auth.currentUser.uid,
    ...quoteData,
    status: 'pending',
    createdAt: serverTimestamp(),
  });

  // Update bidding work order status
  await updateDoc(doc(db, 'biddingWorkOrders', biddingWorkOrderId), {
    status: 'quote_submitted',
  });

  // Update main work order
  await updateDoc(doc(db, 'workOrders', workOrderId), {
    status: 'quote_received',
  });
};
```

**2. Assigned Page - Mark Complete:**
```tsx
const markComplete = async (workOrderId) => {
  await updateDoc(doc(db, 'workOrders', workOrderId), {
    status: 'completed',
    completedAt: serverTimestamp(),
    completedBy: auth.currentUser.uid,
  });

  // TODO: Notify admin and client
};
```

---

## 🎨 UI PATTERNS TO FOLLOW

### 1. Page Layout Pattern:
```tsx
export default function PageName() {
  return (
    <LayoutComponent>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Page Title</h1>
          <p className="text-gray-600 mt-2">Description</p>
        </div>

        {/* Filters/Actions */}
        <div className="flex gap-2">
          {/* Filter buttons */}
        </div>

        {/* Content Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Cards */}
        </div>
      </div>
    </LayoutComponent>
  );
}
```

### 2. Card Pattern:
```tsx
<Card className="hover:shadow-lg transition-shadow">
  <CardHeader>
    <div className="flex justify-between items-start">
      <CardTitle>{title}</CardTitle>
      <StatusBadge status={status} />
    </div>
  </CardHeader>
  <CardContent className="space-y-3">
    {/* Content */}
  </CardContent>
</Card>
```

### 3. Status Badge:
```tsx
const getStatusColor = (status: string) => {
  switch (status) {
    case 'pending': return 'text-yellow-600 bg-yellow-50';
    case 'approved': return 'text-green-600 bg-green-50';
    case 'rejected': return 'text-red-600 bg-red-50';
    case 'completed': return 'text-blue-600 bg-blue-50';
    default: return 'text-gray-600 bg-gray-50';
  }
};

<span className={`px-3 py-1 rounded-full text-xs font-semibold ${getStatusColor(status)}`}>
  {status.toUpperCase()}
</span>
```

---

## 🔌 CLOUDINARY INTEGRATION

### Upload Images:
```tsx
const uploadToCloudinary = async (file: File) => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET);

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME}/image/upload`,
    {
      method: 'POST',
      body: formData,
    }
  );

  const data = await response.json();
  return data.secure_url; // Return image URL
};
```

---

## 📧 EMAIL TEMPLATES

### Invoice Email Template:
```html
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; }
    .button {
      background: #6366f1;
      color: white;
      padding: 12px 24px;
      text-decoration: none;
      border-radius: 6px;
      display: inline-block;
    }
  </style>
</head>
<body>
  <h1>Invoice {{invoiceNumber}}</h1>
  <p>Dear {{clientName}},</p>
  <p>Please find your invoice attached.</p>
  <p><strong>Amount Due: ${{totalAmount}}</strong></p>
  <p><a href="{{stripePaymentLink}}" class="button">Pay Online</a></p>
  <p>Or pay by check to:<br>
  Hey Spruce App<br>
  P.O. Box 104477<br>
  Pasadena, CA 91189-4477</p>
</body>
</html>
```

---

## 🧪 TESTING CHECKLIST

### Complete Workflow Test:
1. ✅ Register as client → Admin approves → Client logs in
2. ✅ Register as subcontractor → Admin approves → Subcontractor logs in
3. ⏳ Client creates location → Admin approves
4. ⏳ Client submits work order → Admin approves
5. ⏳ Admin shares work order with subcontractors
6. ⏳ Subcontractor submits quote
7. ⏳ Admin applies markup and forwards to client
8. ⏳ Client approves quote
9. ⏳ Admin assigns work order to subcontractor
10. ⏳ Subcontractor marks work complete
11. ⏳ Admin generates invoice with Stripe payment link
12. ⏳ Admin sends invoice email with PDF
13. ⏳ Client pays invoice via Stripe

---

## 🚀 DEPLOYMENT CHECKLIST

Before deploying to production:

1. **Environment Variables**
   - Update `.env.local` with production values
   - Add to Vercel environment variables

2. **Firebase**
   - Update Firestore security rules
   - Enable required services
   - Add production domain to authorized domains

3. **Stripe**
   - Replace test keys with live keys
   - Configure webhooks
   - Test payment flow

4. **SendGrid**
   - Verify sender email
   - Set up email templates
   - Test email delivery

5. **Next.js**
   - Run `npm run build` to check for errors
   - Test production build locally

---

## 📞 NEED HELP?

Refer to:
1. **README.md** - Setup and overview
2. **COMPLETE_DOCUMENTATION.html** - Full system documentation
3. **real_examples.txt** - Real quote examples
4. **finalInvoice.txt** - Invoice format reference

---

**🎯 You now have everything you need to complete the Hey Spruce App!**

Follow this guide step-by-step, and you'll have a fully functional system.
