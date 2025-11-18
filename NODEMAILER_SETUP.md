# Nodemailer SMTP Setup Guide

## Overview
Hey Spruce App now uses **Nodemailer** for all email sending functionality. All emails will be sent from `matthew@heyspruce.com`.

## Environment Configuration

Add the following environment variables to your `.env.local` file:

```env
# Nodemailer SMTP Configuration
SMTP_HOST=smtp.your-email-provider.com
SMTP_PORT=587
SMTP_USER=matthew@heyspruce.com
SMTP_PASS=your_smtp_password_here
SMTP_FROM_EMAIL=matthew@heyspruce.com
```

## SMTP Provider Options

### Option 1: Gmail (Recommended for Testing)
1. **Enable 2-Step Verification** on your Google Account
2. **Generate an App Password**:
   - Go to: https://myaccount.google.com/apppasswords
   - Select "Mail" and your device
   - Copy the 16-character password
3. **Update .env.local**:
```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=matthew@heyspruce.com
SMTP_PASS=your_16_character_app_password
SMTP_FROM_EMAIL=matthew@heyspruce.com
```

### Option 2: Microsoft 365 / Outlook
```env
SMTP_HOST=smtp.office365.com
SMTP_PORT=587
SMTP_USER=matthew@heyspruce.com
SMTP_PASS=your_password
SMTP_FROM_EMAIL=matthew@heyspruce.com
```

### Option 3: Custom SMTP Server
If you have a custom email server or hosting provider:
```env
SMTP_HOST=mail.yourdomain.com
SMTP_PORT=587  # or 465 for SSL
SMTP_USER=matthew@heyspruce.com
SMTP_PASS=your_password
SMTP_FROM_EMAIL=matthew@heyspruce.com
```

### Option 4: SendGrid SMTP
```env
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=your_sendgrid_api_key
SMTP_FROM_EMAIL=matthew@heyspruce.com
```

### Option 5: Mailgun SMTP
```env
SMTP_HOST=smtp.mailgun.org
SMTP_PORT=587
SMTP_USER=postmaster@mg.yourdomain.com
SMTP_PASS=your_mailgun_smtp_password
SMTP_FROM_EMAIL=matthew@heyspruce.com
```

## Test Mode
If SMTP credentials are not configured, the email service will run in **test mode**:
- Emails will be logged to the console instead of being sent
- Useful for local development without configuring SMTP
- You'll see detailed email information in the server logs

## Testing Email Functionality

### Test Email Endpoint
Send a test email to verify your configuration:

```bash
curl -X POST http://localhost:3000/api/email/send-test \
  -H "Content-Type: application/json" \
  -d "{\"toEmail\": \"recipient@example.com\"}"
```

### Email Routes
All email routes now use Nodemailer:

1. **Invitations**: `/api/email/send-invitation`
2. **Quotes**: `/api/email/send-quote`
3. **Invoices**: `/api/email/send-invoice`
4. **Assignments**: `/api/email/send-assignment`
5. **Bidding Opportunities**: `/api/email/send-bidding-opportunity`
6. **Client Approvals**: `/api/email/send-client-approval`
7. **Maintenance Requests**: `/api/email/send-maint-request-notification`
8. **Quote Notifications**: `/api/email/send-quote-notification`
9. **Test Emails**: `/api/email/send-test`

## Email Features

### Supported Features
- ✅ HTML email templates
- ✅ Multiple recipients
- ✅ PDF attachments (invoices, work orders)
- ✅ Custom subject lines
- ✅ From name: "Hey Spruce"
- ✅ Test mode for development

### Email Format
All emails are sent with:
- **From**: `Hey Spruce <matthew@heyspruce.com>`
- **Reply-To**: `matthew@heyspruce.com`
- **Subject**: Context-specific subject lines
- **HTML**: Beautifully formatted HTML emails

## Troubleshooting

### Common Issues

**1. Authentication Failed**
- Verify your SMTP credentials are correct
- For Gmail: Make sure you're using an App Password, not your regular password
- Check if 2-factor authentication is enabled (required for Gmail)

**2. Connection Timeout**
- Verify the SMTP_HOST and SMTP_PORT are correct
- Check your firewall settings
- Some ISPs block port 587; try port 465 with secure: true

**3. Emails Going to Spam**
- Configure SPF, DKIM, and DMARC records for your domain
- Use a reputable SMTP provider
- Avoid spam trigger words in email content

**4. Port 465 vs 587**
- Port 587: STARTTLS (recommended)
- Port 465: SSL/TLS
- Update the configuration in `lib/nodemailer.ts` if needed

### Debugging
Check the server console for detailed error messages. Nodemailer provides comprehensive error logging.

## Security Best Practices

1. **Never commit `.env.local`** to version control
2. **Use App Passwords** instead of regular passwords
3. **Rotate credentials** regularly
4. **Use environment-specific** SMTP settings
5. **Monitor email sending** for unusual activity

## Migration from Resend

### What Changed
- ❌ Removed: `resend` package
- ✅ Added: `nodemailer` package
- ✅ Updated: All email routes to use Nodemailer
- ✅ Updated: Environment variables

### Files Modified
- `lib/nodemailer.ts` - Email service implementation
- All routes in `app/api/email/*/route.ts` - Import from `@/lib/nodemailer`
- `package.json` - Removed Resend dependency
- `.env.local` - Updated environment variables

### Old Files (Can be Deleted)
- `lib/resend.ts` - No longer needed
- `RESEND_DOMAIN_SETUP.md` - Resend-specific documentation

## Production Checklist

Before deploying to production:

- [ ] Configure production SMTP credentials
- [ ] Test all email routes
- [ ] Verify emails are not going to spam
- [ ] Set up SPF/DKIM/DMARC records for your domain
- [ ] Monitor email delivery rates
- [ ] Set up email logging/tracking
- [ ] Configure bounce handling (if needed)

## Support

For issues with:
- **Gmail**: https://support.google.com/mail/answer/7126229
- **Microsoft 365**: https://support.microsoft.com/en-us/office/pop-imap-and-smtp-settings-8361e398-8af4-4e97-b147-6c6c4ac95353
- **Nodemailer**: https://nodemailer.com/about/

---

**Last Updated**: January 2025
**Status**: ✅ Active - All emails using Nodemailer
