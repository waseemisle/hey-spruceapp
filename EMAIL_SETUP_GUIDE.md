# Email Notification Setup Guide

This guide will help you set up email notifications for client approval in the Spruce App Portal.

## 📧 **Overview**

When an admin approves a client registration, the system will automatically send an email notification to the client with:
- Welcome message
- Login instructions
- Direct link to the portal
- Contact information for support

## 🚀 **Setup Instructions**

### **Step 1: Choose Email Service**

The system uses Nodemailer with SMTP. You can use any of these services:

#### **Option A: Gmail (Recommended for testing)**
1. Enable 2-Factor Authentication on your Gmail account
2. Generate an App Password:
   - Go to Google Account settings
   - Security → 2-Step Verification → App passwords
   - Generate password for "Mail"
   - Copy the generated password

#### **Option B: SendGrid (Recommended for production)**
1. Sign up at [SendGrid](https://sendgrid.com/)
2. Create an API key
3. Use SMTP settings:
   - Host: `smtp.sendgrid.net`
   - Port: `587`
   - Username: `apikey`
   - Password: Your API key

#### **Option C: Other SMTP Services**
- **Outlook**: `smtp-mail.outlook.com:587`
- **Yahoo**: `smtp.mail.yahoo.com:587`
- **Custom SMTP**: Use your provider's settings

### **Step 2: Configure Environment Variables**

Create a `.env.local` file in your project root:

```bash
# Email Configuration
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password

# Application URL
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### **Step 3: Test Email Configuration**

#### **Method 1: API Test (Recommended)**

1. Start your development server:
```bash
npm run dev
```

2. Check email configuration:
```bash
curl http://localhost:3000/api/test-email
```

3. Send a test email:
```bash
curl -X POST http://localhost:3000/api/test-email \
  -H "Content-Type: application/json" \
  -d '{
    "testEmail": "your-test-email@example.com",
    "clientName": "Test Client",
    "companyName": "Test Company"
  }'
```

#### **Method 2: Admin Portal Test**

1. Register a test client account
2. Go to Admin Portal → Client Approvals
3. Approve the test registration
4. Check if the approval email was sent

### **Step 4: Verify Email Template**

The approval email includes:
- ✅ Professional HTML design
- ✅ Company branding
- ✅ Login instructions
- ✅ Direct portal link
- ✅ Support contact information
- ✅ Feature highlights

## 🔧 **Troubleshooting**

### **Common Issues**

#### **1. "Email configuration is invalid"**
- Check SMTP credentials
- Verify 2FA is enabled (for Gmail)
- Ensure App Password is correct

#### **2. "Authentication failed"**
- Wrong username/password
- 2FA not enabled
- App Password not generated

#### **3. "Connection timeout"**
- Check firewall settings
- Verify SMTP host/port
- Try different SMTP service

#### **4. Emails not sending**
- Check spam folder
- Verify recipient email address
- Check SMTP service limits

### **Debug Steps**

1. **Check Configuration**:
```bash
curl http://localhost:3000/api/test-email
```

2. **Test with Simple Email**:
```bash
curl -X POST http://localhost:3000/api/test-email \
  -H "Content-Type: application/json" \
  -d '{"testEmail": "your-email@gmail.com"}'
```

3. **Check Server Logs**:
Look for email-related errors in your console

## 📱 **Production Setup**

### **For Production Deployment**

1. **Use Professional Email Service**:
   - SendGrid (recommended)
   - Mailgun
   - Amazon SES

2. **Update Environment Variables**:
```bash
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=your-sendgrid-api-key
NEXT_PUBLIC_APP_URL=https://your-domain.com
```

3. **Configure DNS Records**:
   - SPF record
   - DKIM record
   - DMARC policy

4. **Monitor Email Delivery**:
   - Check delivery rates
   - Monitor bounce rates
   - Set up alerts for failures

## 📋 **Email Template Customization**

To customize the email template, edit `lib/email.ts`:

- **HTML Template**: `generateApprovalEmailHTML()`
- **Text Template**: `generateApprovalEmailText()`
- **Styling**: CSS in the HTML template
- **Content**: Company information and branding

## 🔐 **Security Best Practices**

1. **Never commit `.env` files**
2. **Use App Passwords (not account passwords)**
3. **Rotate API keys regularly**
4. **Monitor email usage**
5. **Set up rate limiting**

## 📞 **Support**

If you encounter issues:

1. Check this troubleshooting guide
2. Verify your SMTP configuration
3. Test with the provided API endpoints
4. Contact support with specific error messages

---

**Need Help?** Contact us at support@heyspruce.com or call 877-253-2646
