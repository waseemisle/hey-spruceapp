# Vercel Deployment Guide for GroundOps App

## 📋 Prerequisites

Before deploying to Vercel, ensure you have:
- ✅ Vercel account (sign up at [vercel.com](https://vercel.com))
- ✅ GitHub/GitLab/Bitbucket repository with your code
- ✅ All required API keys and credentials

---

## 🔐 Required Environment Variables

Add these environment variables in your Vercel project settings:

### Mailgun Configuration (Required for Email)
```env
MAILGUN_API_KEY=your_mailgun_api_key_here
MAILGUN_DOMAIN=groundops.com
MAILGUN_FROM_EMAIL=info@groundops.com
MAILGUN_API_URL=https://api.mailgun.net
```

**Note:** If using EU Mailgun region, set `MAILGUN_API_URL=https://api.eu.mailgun.net`

### Firebase Configuration (Required)
```env
NEXT_PUBLIC_FIREBASE_API_KEY=your_firebase_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_firebase_auth_domain
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_firebase_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_firebase_storage_bucket
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_firebase_messaging_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_firebase_app_id

# Firebase Admin (Server-side)
FIREBASE_ADMIN_PROJECT_ID=your_firebase_project_id
FIREBASE_ADMIN_CLIENT_EMAIL=your_firebase_admin_client_email
FIREBASE_ADMIN_PRIVATE_KEY=your_firebase_admin_private_key
```

### Stripe Configuration (Required for Payments)
```env
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

### Cloudinary Configuration (Required for Image Uploads)
```env
NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=your_cloudinary_cloud_name
CLOUDINARY_API_KEY=your_cloudinary_api_key
CLOUDINARY_API_SECRET=your_cloudinary_api_secret
NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET=your_upload_preset
```

### App Configuration
```env
NEXT_PUBLIC_APP_URL=https://your-app.vercel.app
NEXT_PUBLIC_BASE_URL=https://your-app.vercel.app
```

### Google Maps (Optional - for scheduled service emails)
```env
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your_google_maps_api_key
```

---

## 🚀 Deployment Steps

### Step 1: Connect Repository to Vercel

1. Go to [vercel.com](https://vercel.com) and sign in
2. Click **"Add New Project"**
3. Import your GitHub/GitLab/Bitbucket repository
4. Vercel will auto-detect Next.js framework

### Step 2: Configure Build Settings

Vercel should auto-detect these settings, but verify:

- **Framework Preset:** Next.js
- **Build Command:** `npm run build` (or leave default)
- **Output Directory:** `.next` (auto-detected)
- **Install Command:** `npm install` (auto-detected)
- **Node Version:** 20.x (recommended)

### Step 3: Add Environment Variables

1. In your Vercel project dashboard, go to **Settings** → **Environment Variables**
2. Add each environment variable listed above
3. **Important:** Set variables for:
   - **Production** (for production deployments)
   - **Preview** (for pull request previews)
   - **Development** (for local development - optional)

### Step 4: Deploy

1. Click **"Deploy"** button
2. Vercel will:
   - Install dependencies
   - Build your Next.js app
   - Deploy to production

### Step 5: Verify Deployment

1. Once deployed, visit your production URL
2. Test email functionality by:
   - Creating a test user
   - Sending a test email
   - Checking Mailgun dashboard for delivery status

---

## 📧 Email Testing After Deployment

After deployment, test all email flows:

```bash
# Set your production URL
export TEST_EMAIL_BASE_URL=https://your-app.vercel.app

# Run the test script
node scripts/test-all-api-emails.js
```

Or test individual endpoints:
```bash
curl -X POST https://your-app.vercel.app/api/email/send-invitation \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "fullName": "Test User",
    "role": "client",
    "resetLink": "https://your-app.vercel.app/set-password?token=test"
  }'
```

---

## 🔧 Vercel Configuration File

Your `vercel.json` is already configured with:

```json
{
  "framework": "nextjs",
  "buildCommand": "npm run build",
  "outputDirectory": ".next",
  "installCommand": "npm install",
  "devCommand": "npm run dev",
  "crons": [
    {
      "path": "/api/recurring-work-orders/cron",
      "schedule": "0 9 * * *"
    }
  ],
  "functions": {
    "app/api/maint-requests/route.ts": {
      "maxDuration": 60,
      "memory": 1024
    }
  }
}
```

This configuration:
- ✅ Sets up Next.js framework
- ✅ Configures cron job for recurring work orders (runs daily at 9 AM UTC)
- ✅ Sets function timeout and memory for maintenance requests API

---

## 🛠️ Troubleshooting

### Emails Not Sending

1. **Check Environment Variables:**
   ```bash
   # In Vercel dashboard, verify all MAILGUN_* variables are set
   ```

2. **Check Mailgun Domain:**
   - Verify domain is verified in Mailgun dashboard
   - Check DNS records are properly configured
   - Ensure domain is not in sandbox mode (or authorize recipients)

3. **Check Logs:**
   - Go to Vercel dashboard → **Deployments** → Click on deployment → **Functions** tab
   - Check server logs for email errors

### Build Failures

1. **Check Node Version:**
   - Ensure Node.js 20.x is set in Vercel settings

2. **Check Dependencies:**
   - Verify `package.json` has all required dependencies
   - Check for any TypeScript errors

3. **Check Environment Variables:**
   - Ensure all required variables are set
   - Check for typos in variable names

### Function Timeouts

If API routes timeout:
1. Check `vercel.json` for function configuration
2. Increase `maxDuration` if needed (max 60s on Hobby plan, 300s on Pro)
3. Optimize slow operations (use background jobs for heavy tasks)

---

## 📊 Monitoring

### Vercel Analytics
- Built-in analytics available in Vercel dashboard
- Monitor page views, performance, and errors

### Mailgun Dashboard
- Monitor email delivery rates
- Check bounce/spam rates
- View email logs

### Firebase Console
- Monitor Firestore usage
- Check authentication logs
- Review storage usage

---

## 🔄 Continuous Deployment

Vercel automatically deploys:
- **Production:** On push to `main` branch
- **Preview:** On pull requests

To disable auto-deployment:
1. Go to **Settings** → **Git**
2. Uncheck **"Automatically deploy"**

---

## 🔐 Security Checklist

Before going live:

- [ ] All API keys are set in Vercel (not in code)
- [ ] Firebase security rules are configured
- [ ] Stripe webhook secret is set
- [ ] Mailgun domain is verified
- [ ] HTTPS is enabled (automatic on Vercel)
- [ ] Environment variables are not exposed to client
- [ ] CORS is properly configured
- [ ] Rate limiting is implemented (if needed)

---

## 📝 Post-Deployment Checklist

After deployment:

- [ ] Test all email flows
- [ ] Verify Stripe payments work
- [ ] Test file uploads (Cloudinary)
- [ ] Verify Firebase authentication
- [ ] Check cron jobs are running
- [ ] Monitor error logs
- [ ] Test on mobile devices
- [ ] Verify all links work
- [ ] Check email deliverability

---

## 🆘 Support

If you encounter issues:

1. Check Vercel logs: **Deployments** → **Functions** → **View Logs**
2. Check Mailgun dashboard for email issues
3. Review Firebase console for database errors
4. Check browser console for client-side errors

For Vercel-specific issues, visit: [vercel.com/docs](https://vercel.com/docs)
