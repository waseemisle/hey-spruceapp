# Client Registration System - Spruce App Portal

This guide explains the complete client registration workflow with admin approval system.

## 🚀 **Overview**

The client registration system allows new clients to register for Spruce App services through a public registration form. Admins can then review, approve, or reject these registrations through the admin portal.

## 📋 **Registration Workflow**

### **1. Client Registration Process**

#### **Step 1: Access Registration Form**
- Clients visit: `http://localhost:3000/register`
- Or click "Register as Client" link on login page

#### **Step 2: Multi-Step Registration Form**
The registration form has 3 steps:

**Step 1: Company Information**
- Company Name
- Contact Person
- Email Address
- Phone Number

**Step 2: Business Details**
- Business Address
- Business Type (Property Management, Corporate Office, etc.)
- Number of Properties
- Estimated Monthly Spend
- Preferred Services (HVAC, Plumbing, Electrical, etc.)
- Additional Information

**Step 3: Account Setup**
- Password Creation
- Confirm Password
- Terms of Service Agreement

#### **Step 3: Submission**
- Form data is submitted to `/api/register-client`
- Data is stored in Firestore `client_registrations` collection
- Status is set to "pending"
- Client sees success message

### **2. Admin Approval Process**

#### **Step 1: Access Admin Portal**
- Admin logs in: `demo.admin@heyspruce.com` / `demo123`
- Navigate to "Client Approvals" in sidebar

#### **Step 2: Review Registrations**
- View all pending registrations
- Filter by status (pending, approved, rejected)
- Search by company name, contact, or email

#### **Step 3: Approve/Reject**
- Click "View Details" to see full registration
- Click "Approve" to create user account
- Click "Reject" to reject with reason

#### **Step 4: User Account Creation (On Approval)**
When admin approves:
1. Firebase Auth user is created
2. User profile is created in Firestore `users` collection
3. Registration status updated to "approved"
4. Client can now log in with their credentials

## 🗄️ **Database Structure**

### **client_registrations Collection**
```javascript
{
  id: "auto-generated-id",
  companyName: "Acme Property Management",
  contactPerson: "John Smith",
  email: "john@acmepm.com",
  phone: "+1 (555) 123-4567",
  address: "123 Business St, Downtown, NY 10001",
  businessType: "Property Management Company",
  numberOfProperties: 25,
  estimatedMonthlySpend: "$15,000",
  preferredServices: ["HVAC Maintenance", "Plumbing Services"],
  additionalInfo: "Additional details...",
  password: "hashed_password",
  status: "pending" | "approved" | "rejected",
  submittedAt: "2024-01-15T10:30:00.000Z",
  reviewedAt: "2024-01-16T09:15:00.000Z",
  reviewedBy: "admin@heyspruce.com",
  approvedAt: "2024-01-16T09:15:00.000Z",
  rejectionReason: "Reason for rejection (if rejected)",
  userId: "firebase-auth-uid" // Added when approved
}
```

### **users Collection (Created on Approval)**
```javascript
{
  id: "firebase-auth-uid",
  email: "john@acmepm.com",
  fullName: "John Smith",
  role: "client",
  companyName: "Acme Property Management",
  phone: "+1 (555) 123-4567",
  address: "123 Business St, Downtown, NY 10001",
  businessType: "Property Management Company",
  numberOfProperties: 25,
  estimatedMonthlySpend: "$15,000",
  preferredServices: ["HVAC Maintenance", "Plumbing Services"],
  createdAt: "2024-01-16T09:15:00.000Z",
  updatedAt: "2024-01-16T09:15:00.000Z"
}
```

## 🔧 **API Endpoints**

### **POST /api/register-client**
Creates a new client registration.

**Request Body:**
```javascript
{
  companyName: "string",
  contactPerson: "string",
  email: "string",
  phone: "string",
  address: "string",
  businessType: "string",
  numberOfProperties: "number",
  estimatedMonthlySpend: "string",
  preferredServices: ["string"],
  additionalInfo: "string",
  password: "string",
  confirmPassword: "string",
  agreeToTerms: boolean
}
```

**Response:**
```javascript
{
  success: true,
  registrationId: "firestore-document-id",
  message: "Registration submitted successfully"
}
```

### **POST /api/admin/approve-client**
Approves a client registration and creates user account.

**Request Body:**
```javascript
{
  registrationId: "firestore-document-id"
}
```

**Response:**
```javascript
{
  success: true,
  message: "Client approved successfully",
  userId: "firebase-auth-uid"
}
```

### **POST /api/admin/reject-client**
Rejects a client registration.

**Request Body:**
```javascript
{
  registrationId: "firestore-document-id",
  reason: "string"
}
```

**Response:**
```javascript
{
  success: true,
  message: "Client registration rejected"
}
```

## 🎯 **Features**

### **Client Registration Form**
- ✅ Multi-step form with validation
- ✅ Responsive design
- ✅ Progress indicator
- ✅ Form validation
- ✅ Success confirmation

### **Admin Approval System**
- ✅ View all registrations
- ✅ Filter and search functionality
- ✅ Detailed registration view
- ✅ Approve/Reject actions
- ✅ Status tracking
- ✅ Timeline view

### **Database Integration**
- ✅ Firestore integration
- ✅ Firebase Auth user creation
- ✅ Status tracking
- ✅ Audit trail

## 🚀 **Getting Started**

### **1. Test Client Registration**
1. Visit `http://localhost:3000/register`
2. Fill out the registration form
3. Submit and verify success message

### **2. Test Admin Approval**
1. Login as admin: `demo.admin@heyspruce.com` / `demo123`
2. Go to "Client Approvals"
3. View and approve/reject registrations

### **3. Test Client Login**
1. After approval, client can login with their credentials
2. They'll be redirected to client portal
3. All their registration data will be available

## 🔒 **Security Considerations**

### **Production Recommendations**
1. **Password Hashing**: Hash passwords before storing
2. **Input Validation**: Add server-side validation
3. **Rate Limiting**: Prevent spam registrations
4. **Email Verification**: Verify email addresses
5. **Admin Authentication**: Secure admin endpoints
6. **Data Encryption**: Encrypt sensitive data

### **Firestore Security Rules**
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Client registrations - only admins can read/write
    match /client_registrations/{registrationId} {
      allow read, write: if request.auth != null && 
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
    }
    
    // User profiles
    match /users/{userId} {
      allow read, write: if request.auth != null && 
        (request.auth.uid == userId || 
         get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin');
    }
  }
}
```

## 📧 **Email Notifications (Future Enhancement)**

### **Registration Confirmation**
- Send confirmation email when registration is submitted
- Include registration ID and expected approval timeline

### **Approval Notification**
- Send welcome email when registration is approved
- Include login credentials and next steps

### **Rejection Notification**
- Send rejection email with reason
- Provide contact information for questions

## 🎨 **Customization**

### **Registration Form**
- Modify form fields in `app/register/page.tsx`
- Add/remove business types and service options
- Customize validation rules

### **Admin Interface**
- Modify approval interface in `app/admin-portal/clients/page.tsx`
- Add additional filters or search options
- Customize approval workflow

### **Database Schema**
- Extend registration and user schemas
- Add additional fields as needed
- Modify validation rules

## 🐛 **Troubleshooting**

### **Common Issues**

1. **Registration not submitting**
   - Check browser console for errors
   - Verify API endpoint is accessible
   - Check Firestore permissions

2. **Admin approval failing**
   - Verify admin authentication
   - Check Firebase Auth configuration
   - Verify user creation permissions

3. **Client login issues**
   - Verify user was created in Firebase Auth
   - Check user profile in Firestore
   - Verify role assignment

### **Debug Mode**
Enable debug logging by adding console.log statements in:
- `app/api/register-client/route.ts`
- `app/api/admin/approve-client/route.ts`
- `app/api/admin/reject-client/route.ts`

## 📈 **Future Enhancements**

1. **Bulk Operations**: Approve/reject multiple registrations
2. **Email Templates**: Customizable email notifications
3. **Registration Analytics**: Track registration metrics
4. **Auto-approval**: Rules-based automatic approval
5. **Document Upload**: Allow file attachments
6. **Integration**: Connect with CRM systems
7. **Mobile App**: Native mobile registration
8. **Multi-language**: Support multiple languages

This system provides a complete client onboarding workflow with proper admin oversight and database integration.
