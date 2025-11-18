# SendGrid Email Setup Guide

## Why SendGrid?
Your application sends invitation emails to new users (clients, subcontractors, and admin users) when they're created from the admin portal. Without SendGrid configured, the emails are logged to the console instead.

## How to Set Up SendGrid

### Step 1: Create a SendGrid Account
1. Go to [https://sendgrid.com/](https://sendgrid.com/)
2. Sign up for a free account (allows 100 emails/day)
3. Verify your email address

### Step 2: Create an API Key
1. Log into your SendGrid account
2. Go to **Settings** → **API Keys**
3. Click **Create API Key**
4. Give it a name (e.g., "Hey Spruce Production")
5. Choose **Full Access** or at minimum **Mail Send** permissions
6. Click **Create & View**
7. **IMPORTANT**: Copy the API key immediately (you won't be able to see it again)

### Step 3: Verify a Sender Email
1. Go to **Settings** → **Sender Authentication**
2. Click **Verify a Single Sender**
3. Fill in your details:
   - From Name: "Hey Spruce"
   - From Email Address: Your email (e.g., noreply@heyspruce.com or matthew@heyspruce.com)
   - Reply To: Same email or support email
4. Click **Create**
5. Check your email and click the verification link

### Step 4: Add to Environment Variables

Create a `.env.local` file in your project root (if it doesn't exist):

```bash
# SendGrid Configuration
SENDGRID_API_KEY=SG.your_actual_api_key_here
SENDGRID_FROM_EMAIL=noreply@heyspruce.com
```

**Important Notes:**
- Never commit `.env.local` to git (it's already in .gitignore)
- Replace `SG.your_actual_api_key_here` with your actual SendGrid API key
- Use the same email you verified in Step 3 for `SENDGRID_FROM_EMAIL`

### Step 5: Restart Your Development Server

```bash
# Stop your current server (Ctrl+C)
npm run dev
```

### Step 6: Test It!
1. Go to Admin Portal → Clients (or Subcontractors)
2. Click "Create New Client"
3. Fill in the form with a real email address
4. Click "Create"
5. Check the email inbox - you should receive a professional invitation email!

## Production Deployment

When deploying to production (Vercel, Netlify, etc.):

1. Add the environment variables in your hosting platform's dashboard
2. Make sure to update `NEXT_PUBLIC_BASE_URL` to your production URL
3. Consider upgrading your SendGrid plan if you need more than 100 emails/day

## Troubleshooting

### "SendGrid not configured" message in console
- Make sure you created the `.env.local` file
- Check that the API key starts with `SG.`
- Restart your development server after adding the variables

### Email not received
- Check spam/junk folder
- Verify the sender email in SendGrid dashboard
- Check SendGrid dashboard → Activity to see if email was sent
- Make sure you're using the verified sender email

### API Key not working
- Make sure the API key has Mail Send permissions
- Try creating a new API key
- Check SendGrid dashboard for any account issues

## Alternative: Test Mode

If you don't want to set up SendGrid right now, the app works in "test mode":
- User is created successfully
- Password setup link is logged to your terminal/console
- Copy the link and paste it in your browser to set up the password manually

This is fine for development/testing but not recommended for production.
