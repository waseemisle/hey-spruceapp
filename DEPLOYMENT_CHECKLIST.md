# Vercel Deployment Checklist

## ✅ Pre-Deployment Checklist

### Email System
- [x] All email flows tested (11/11 passing)
- [x] Mailgun API key obtained
- [x] Mailgun domain verified (heyspruce.com)
- [x] From email verified (matthew@heyspruce.com)
- [x] Test emails sent successfully

### Code
- [x] All dependencies installed (`npm install`)
- [x] Build succeeds locally (`npm run build`)
- [x] No TypeScript errors
- [x] No linting errors

---

## 🔐 Environment Variables for Vercel

Add these in **Vercel Dashboard → Settings → Environment Variables**:

### Required: Mailgun
```env
MAILGUN_API_KEY=your_mailgun_api_key_here
MAILGUN_DOMAIN=heyspruce.com
MAILGUN_FROM_EMAIL=matthew@heyspruce.com
MAILGUN_API_URL=https://api.mailgun.net
```

### Required: Firebase
```env
NEXT_PUBLIC_FIREBASE_API_KEY=your_firebase_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_firebase_auth_domain
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_firebase_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_firebase_storage_bucket
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_firebase_messaging_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_firebase_app_id

FIREBASE_ADMIN_PROJECT_ID=your_firebase_project_id
FIREBASE_ADMIN_CLIENT_EMAIL=your_firebase_admin_client_email
FIREBASE_ADMIN_PRIVATE_KEY=your_firebase_admin_private_key
```

### Required: Stripe
```env
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

### Required: Cloudinary
```env
NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=your_cloudinary_cloud_name
CLOUDINARY_API_KEY=your_cloudinary_api_key
CLOUDINARY_API_SECRET=your_cloudinary_api_secret
NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET=your_upload_preset
```

### Required: App URLs
```env
NEXT_PUBLIC_APP_URL=https://your-app.vercel.app
NEXT_PUBLIC_BASE_URL=https://your-app.vercel.app
```

### Optional: Google Maps
```env
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your_google_maps_api_key
```

---

## 🚀 Deployment Steps

### 1. Connect Repository
- [ ] Go to [vercel.com](https://vercel.com)
- [ ] Click "Add New Project"
- [ ] Import your GitHub repository
- [ ] Vercel auto-detects Next.js

### 2. Configure Environment Variables
- [ ] Go to **Settings → Environment Variables**
- [ ] Add all variables listed above
- [ ] Set for **Production**, **Preview**, and **Development**

### 3. Deploy
- [ ] Click "Deploy"
- [ ] Wait for build to complete
- [ ] Check deployment logs for errors

### 4. Verify Deployment
- [ ] Visit production URL
- [ ] Test email functionality
- [ ] Check Mailgun dashboard for email delivery
- [ ] Verify all links work

---

## 🧪 Post-Deployment Testing

After deployment, test all email flows:

```bash
# Set production URL
export TEST_EMAIL_BASE_URL=https://your-app.vercel.app

# Run test script
node scripts/test-all-api-emails.js
```

Or test manually:
1. Create a test user → Should receive invitation email
2. Create a maintenance request → Should receive notification
3. Create a work order → Should receive assignment email
4. Send an invoice → Should receive invoice with PDFs

---

## 📊 Monitoring

### Vercel Dashboard
- Monitor deployments
- Check function logs
- View analytics

### Mailgun Dashboard
- Monitor email delivery rates
- Check bounce/spam rates
- View email logs

### Firebase Console
- Monitor Firestore usage
- Check authentication logs
- Review storage usage

---

## 🛠️ Troubleshooting

### Emails Not Sending
1. Check environment variables in Vercel
2. Verify Mailgun domain is verified
3. Check Mailgun dashboard for errors
4. Review Vercel function logs

### Build Failures
1. Check Node.js version (should be 20.x)
2. Verify all dependencies in package.json
3. Check for TypeScript errors
4. Review build logs

### Function Timeouts
1. Check vercel.json configuration
2. Increase maxDuration if needed
3. Optimize slow operations

---

## 📝 Files to Review

- ✅ `VERCEL_DEPLOYMENT_GUIDE.md` - Complete deployment guide
- ✅ `EMAIL_TEST_RESULTS.md` - Email test results
- ✅ `vercel.json` - Vercel configuration
- ✅ `.env.local` - Local environment variables (don't commit)

---

## ✅ Final Checklist

Before going live:
- [ ] All environment variables set in Vercel
- [ ] Production URL updated in environment variables
- [ ] Test emails sent successfully
- [ ] All links work correctly
- [ ] PDF attachments work (Invoice email)
- [ ] Stripe payment links work
- [ ] Firebase security rules configured
- [ ] Error monitoring set up

---

**Ready to deploy!** 🚀

See `VERCEL_DEPLOYMENT_GUIDE.md` for detailed instructions.
