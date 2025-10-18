# Firebase Admin SDK Setup

## ⚠️ IMPORTANT: Required for Creating Clients & Subcontractors

The Admin Portal now uses Firebase Admin SDK to create users without logging out the admin. You need to set up the Firebase Admin credentials.

## Steps to Get Firebase Admin Credentials:

1. **Go to Firebase Console**: https://console.firebase.google.com/
2. **Select your project**: `heyspruceappv2`
3. **Navigate to**: Project Settings (gear icon) → **Service Accounts** tab
4. **Click**: "Generate New Private Key" button
5. **Download**: The JSON file will be downloaded

## Add Credentials to .env.local:

Open the downloaded JSON file and copy the values:

```env
FIREBASE_PROJECT_ID=heyspruceappv2
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@heyspruceappv2.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYOUR_PRIVATE_KEY_HERE\n-----END PRIVATE KEY-----\n"
```

### Important Notes:

- The `FIREBASE_CLIENT_EMAIL` will look like: `firebase-adminsdk-xxxxx@heyspruceappv2.iam.gserviceaccount.com`
- The `FIREBASE_PRIVATE_KEY` must be wrapped in double quotes and include `\n` for newlines
- Keep the entire private key in ONE line with `\n` characters (don't replace them with actual newlines)

### Example:

```env
FIREBASE_PROJECT_ID=heyspruceappv2
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-abc123@heyspruceappv2.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC...\n-----END PRIVATE KEY-----\n"
```

## Restart Your Dev Server:

After adding the credentials:

```bash
npm run dev
```

## What This Fixes:

✅ Admin can now create Clients without being logged out
✅ Admin can now create Subcontractors without being logged out
✅ Admin stays logged in during user creation
✅ No redirect to /portal-login when creating users

## Testing:

1. Login as Admin
2. Go to Admin Portal → Clients
3. Click "Create Client"
4. Fill in the form with email/password
5. Click "Create"
6. ✅ You should stay logged in and NOT be redirected!
