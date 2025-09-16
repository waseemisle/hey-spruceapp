# Admin Link Generation Guide - Spruce App Portal

This guide explains how admins can generate and send registration links to new clients.

## 🚀 **Complete Workflow**

### **1. Admin Generates Link**
1. **Login to Admin Portal**: `demo.admin@heyspruce.com` / `demo123`
2. **Navigate to Client Management**: Click "Client Approvals" in sidebar
3. **Click "Generate Registration Link"**: Blue button in top-right
4. **Fill Form**:
   - Client Email: `client@company.com`
   - Client Name/Company: `John Smith - Acme Property Management`
   - Link Expiration: `7 days` (default)
5. **Click "Generate Registration Link"**

### **2. Share Link with Client**
The system provides multiple ways to share:

#### **📧 Email (Recommended)**
- Click "Email" button
- Pre-filled email with subject and message
- Includes registration link and expiration info

#### **💬 WhatsApp**
- Click "WhatsApp" button
- Opens WhatsApp with pre-filled message
- Includes client name and registration link

#### **📋 Copy Link**
- Click "Copy" button
- Link copied to clipboard
- Share via any method (SMS, Slack, etc.)

#### **🔗 Direct Link**
- Click "Open Link" button
- Opens registration form in new tab
- Test the link before sharing

### **3. Client Registration Process**
1. **Client receives link** via email/WhatsApp/etc.
2. **Clicks link** → Opens registration form
3. **Form is pre-filled** with email and name
4. **Client completes** 3-step registration
5. **Submits form** → Data goes to admin for approval

### **4. Admin Approval**
1. **Go to Client Approvals** page
2. **See new registration** with "Pending" status
3. **Click "View Details"** to review
4. **Approve or Reject** with reason
5. **Client account created** (if approved)

## 🔗 **Link Format**

Generated links follow this format:
```
https://localhost:3000/register?token=abc123def456&email=client@company.com&name=John%20Smith%20-%20Acme%20PM
```

**Parameters:**
- `token`: Unique identifier for tracking
- `email`: Pre-fills client email
- `name`: Pre-fills client name

## 📊 **Link Tracking**

### **Link Statuses**
- **🟢 Active**: Link is valid and can be used
- **🔵 Used**: Link has been used for registration
- **🔴 Expired**: Link has expired (default: 7 days)

### **Link History**
- View all generated links in "Generated Links History"
- Track creation date, expiration, and usage
- Copy or open any link for reference

## 🎯 **Features**

### **Link Generation**
- ✅ **Unique tokens** for each link
- ✅ **Pre-filled forms** for clients
- ✅ **Expiration dates** (1-30 days)
- ✅ **Multiple sharing options**
- ✅ **Link tracking** and history

### **Security**
- ✅ **Token validation** on registration
- ✅ **Email matching** verification
- ✅ **Expiration checking**
- ✅ **One-time use** links
- ✅ **Admin audit trail**

### **User Experience**
- ✅ **Pre-filled forms** reduce friction
- ✅ **Multiple sharing methods**
- ✅ **Clear expiration info**
- ✅ **Professional email templates**
- ✅ **Mobile-friendly links**

## 📧 **Email Template**

When you click "Email", this template is used:

```
Subject: Spruce App - Client Registration Invitation

Dear Client,

You have been invited to register for Spruce App services. 
Please click the link below to complete your registration:

[REGISTRATION_LINK]

This link will expire in 7 days.

Best regards,
Spruce App Team
```

## 💬 **WhatsApp Template**

When you click "WhatsApp", this message is sent:

```
Hi [CLIENT_NAME]! You've been invited to register for Spruce App services. 
Please complete your registration here: [REGISTRATION_LINK]
```

## 🔧 **Technical Details**

### **Database Collections**

#### **registration_links**
```javascript
{
  id: "auto-generated-id",
  token: "unique-token-32-chars",
  clientEmail: "client@company.com",
  clientName: "John Smith - Acme PM",
  status: "active" | "used" | "expired",
  createdAt: "2024-01-15T10:30:00.000Z",
  expiresAt: "2024-01-22T10:30:00.000Z",
  createdBy: "admin@heyspruce.com",
  usedAt: "2024-01-16T14:20:00.000Z" | null,
  usedBy: "client@company.com" | null
}
```

#### **client_registrations** (Updated)
```javascript
{
  // ... existing fields ...
  registrationToken: "token-used-for-registration" | null
}
```

### **API Endpoints**

#### **POST /api/admin/generate-link**
Generate a new registration link.

**Request:**
```javascript
{
  clientEmail: "client@company.com",
  clientName: "John Smith - Acme PM",
  expirationDays: 7
}
```

**Response:**
```javascript
{
  success: true,
  linkId: "firestore-document-id",
  token: "unique-token",
  registrationUrl: "https://localhost:3000/register?token=...",
  expiresAt: "2024-01-22T10:30:00.000Z"
}
```

## 🚀 **Getting Started**

### **1. Test Link Generation**
1. Login as admin: `demo.admin@heyspruce.com` / `demo123`
2. Go to Client Management → Generate Registration Link
3. Create a test link
4. Copy and test the link

### **2. Test Client Registration**
1. Use the generated link
2. Verify form is pre-filled
3. Complete registration
4. Check admin portal for pending approval

### **3. Test Admin Approval**
1. Go to Client Approvals
2. Find the new registration
3. Approve the client
4. Verify client can login

## 🔒 **Security Best Practices**

### **Production Recommendations**
1. **Secure Token Generation**: Use crypto-secure random tokens
2. **Rate Limiting**: Limit link generation per admin
3. **Audit Logging**: Log all link generation and usage
4. **Email Verification**: Verify admin email before sending
5. **Link Encryption**: Encrypt sensitive data in URLs
6. **HTTPS Only**: Ensure all links use HTTPS

### **Firestore Security Rules**
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Registration links - only admins can create/read
    match /registration_links/{linkId} {
      allow read, write: if request.auth != null && 
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
    }
  }
}
```

## 🐛 **Troubleshooting**

### **Common Issues**

1. **Link not working**
   - Check if link has expired
   - Verify token is correct
   - Check browser console for errors

2. **Form not pre-filled**
   - Verify URL parameters are correct
   - Check if email/name are URL encoded
   - Refresh the page

3. **Registration fails**
   - Check if link is still active
   - Verify email matches link
   - Check Firestore permissions

4. **Admin can't generate links**
   - Verify admin authentication
   - Check API endpoint permissions
   - Verify Firestore write access

### **Debug Mode**
Enable debug logging by checking browser console and server logs for:
- Token generation
- Link validation
- Email matching
- Firestore operations

## 📈 **Future Enhancements**

1. **Bulk Link Generation**: Generate multiple links at once
2. **Custom Email Templates**: Editable email templates
3. **Link Analytics**: Track click rates and conversions
4. **Auto-expiration**: Automatic cleanup of expired links
5. **Link Scheduling**: Schedule links for future use
6. **Integration**: Connect with CRM systems
7. **Mobile App**: Generate links from mobile app
8. **QR Codes**: Generate QR codes for links

## 📞 **Support**

For technical support:
- Check browser console for errors
- Verify Firebase configuration
- Test with demo credentials
- Review Firestore security rules

This system provides a complete solution for admin-controlled client registration with proper tracking and security measures.
