# Vercel Deployment Guide

## Fixed Issues
✅ Created `public` directory (required by Vercel)
✅ Created `vercel.json` configuration file
✅ Updated `next.config.js` for proper build output
✅ Created `.vercelignore` to exclude unnecessary files

## Environment Variables to Set in Vercel

Go to your Vercel project settings and add these environment variables:

```
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSyDWHE-iFu2JpGgOc57_RxZ_DFLpHxWYDQ8
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=heyspruceappv2.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=heyspruceappv2
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=heyspruceappv2.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=198738285054
NEXT_PUBLIC_FIREBASE_APP_ID=1:198738285054:web:6878291b080771623a70af
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=G-82NKE8271G
```

## Steps to Deploy

1. **Push your changes to GitHub:**
   ```bash
   git add .
   git commit -m "Fix Vercel deployment configuration"
   git push origin main
   ```

2. **In Vercel Dashboard:**
   - Go to your project settings
   - Navigate to "Environment Variables"
   - Add all the Firebase environment variables listed above
   - Make sure to set them for "Production", "Preview", and "Development"

3. **Redeploy:**
   - Go to "Deployments" tab
   - Click "Redeploy" on the latest deployment
   - Or push a new commit to trigger automatic deployment

## What Was Fixed

- ✅ Added `public` directory (Vercel requirement)
- ✅ Created proper `vercel.json` configuration
- ✅ Updated Next.js config for standalone output
- ✅ Excluded HTML files that were confusing Vercel
- ✅ Set up proper build commands and output directory

The deployment should now work correctly!
