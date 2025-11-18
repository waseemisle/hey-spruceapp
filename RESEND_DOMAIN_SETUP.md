# Resend Domain Setup - URGENT

## Current Issue
The Resend API key is in **sandbox/test mode** and can only send emails to `matthew@heyspruce.com`. Emails to other recipients (like waseemisle@gmail.com) are being blocked with this error:

```
You can only send testing emails to your own email address (matthew@heyspruce.com).
To send emails to other recipients, please verify a domain at resend.com/domains
```

## Solution: Verify heyspruce.com Domain

### Step 1: Access Resend Dashboard
1. Go to https://resend.com/login
2. Log in with the account that owns the API key `re_USeCFhHY_57b7nA7XKKppDRPKhq2kPYbi`

### Step 2: Add and Verify Domain
1. Go to https://resend.com/domains
2. Click "Add Domain"
3. Enter: `heyspruce.com`
4. Follow the verification steps (add DNS records)

### Step 3: DNS Records to Add
You'll need to add these DNS records to your domain registrar (GoDaddy, Namecheap, etc.):

**SPF Record (TXT)**
- Type: TXT
- Name: @ or heyspruce.com
- Value: (provided by Resend)

**DKIM Record (TXT)**
- Type: TXT
- Name: (provided by Resend, usually something like: resend._domainkey)
- Value: (provided by Resend)

**DMARC Record (TXT)**
- Type: TXT
- Name: _dmarc
- Value: v=DMARC1; p=none;

### Step 4: Update Code (Already Done)
The code has been updated to use `onboarding@resend.dev` temporarily, but once the domain is verified, update `lib/resend.ts` line 53 to:

```typescript
const fromEmail = `SpruceApp <matthew@heyspruce.com>`;
```

## Alternative: Use Gmail SMTP (Temporary Workaround)
If you can't verify the domain immediately, you can use Gmail SMTP:

1. Update `.env.local`:
```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=matthew@heyspruce.com
SMTP_PASSWORD=your_gmail_app_password
```

2. Enable "App Passwords" in Gmail:
   - Go to Google Account → Security → 2-Step Verification → App passwords
   - Generate an app password for "Mail"

## Testing
Once domain is verified, test with:
```bash
curl -X POST http://localhost:3000/api/email/send-test \
  -H "Content-Type: application/json" \
  -d "{\"toEmail\": \"waseemisle@gmail.com\"}"
```

## Current Status
- ✅ Email service configured
- ✅ Emails work to matthew@heyspruce.com
- ❌ Domain not verified - blocks emails to other recipients
- ❌ Client invitations failing for non-matthew@heyspruce.com addresses
