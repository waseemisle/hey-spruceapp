# Firebase Admin SDK Setup

## ⚠️ IMPORTANT: Required for Impersonation Feature

The Admin Portal uses Firebase Admin SDK for the **impersonation feature** (Login as Client/Subcontractor). You need to set up the Firebase Admin credentials to enable this functionality.

**Note:** If you already have `NEXT_PUBLIC_FIREBASE_PROJECT_ID` in your `.env.local`, you can use that value for `FIREBASE_PROJECT_ID`.

## Steps to Get Firebase Admin Credentials:

1. **Go to Firebase Console**: https://console.firebase.google.com/
2. **Select your project** (use the same project ID as `NEXT_PUBLIC_FIREBASE_PROJECT_ID` from your `.env.local`)
3. **Navigate to**: Project Settings (gear icon) → **Service Accounts** tab
4. **Click**: "Generate New Private Key" button
5. **Download**: The JSON file will be downloaded (it will be named something like `your-project-firebase-adminsdk-xxxxx.json`)

### What's in the JSON file?

The downloaded JSON file contains:
- `project_id` → Use this for `FIREBASE_PROJECT_ID`
- `client_email` → Use this for `FIREBASE_CLIENT_EMAIL`
- `private_key` → Use this for `FIREBASE_PRIVATE_KEY`

## Add Credentials to .env.local:

### Method 1: Using the Helper Script (Easiest) ⭐

1. Download the service account JSON file from Firebase Console
2. Run this command in your project root:
   ```bash
   node scripts/setup-firebase-admin.js path/to/your-service-account.json
   ```
3. Copy the output and paste it into your `.env.local` file
4. Done! ✅

### Method 2: Manual Copy-Paste

Open the downloaded JSON file and copy the values. Add these three lines to your `.env.local` file:

```env
# Firebase Admin SDK (for impersonation feature)
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project-id.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYOUR_PRIVATE_KEY_HERE\n-----END PRIVATE KEY-----\n"
```

### Quick Copy-Paste Method:

1. Open the downloaded JSON file in a text editor
2. Find these three values:
   - `"project_id": "your-project-id"` → Copy the value for `FIREBASE_PROJECT_ID`
   - `"client_email": "firebase-adminsdk-..."` → Copy the value for `FIREBASE_CLIENT_EMAIL`
   - `"private_key": "-----BEGIN PRIVATE KEY-----..."` → Copy the ENTIRE value (including quotes) for `FIREBASE_PRIVATE_KEY`

3. In your `.env.local`, add:
   ```env
   FIREBASE_PROJECT_ID=your-project-id
   FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project-id.iam.gserviceaccount.com
   FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYOUR_ACTUAL_KEY_HERE\n-----END PRIVATE KEY-----\n"
   ```

### Important Notes:

- **FIREBASE_PROJECT_ID**: You can use the same value as `NEXT_PUBLIC_FIREBASE_PROJECT_ID` if you already have it
- **FIREBASE_CLIENT_EMAIL**: This will look like `firebase-adminsdk-xxxxx@your-project-id.iam.gserviceaccount.com`
- **FIREBASE_PRIVATE_KEY**: 
  - Must be wrapped in **double quotes**
  - Must include `\n` for newlines (don't replace `\n` with actual line breaks)
  - Keep the entire private key in ONE line
  - The key from the JSON file already has newlines - you need to replace actual newlines with `\n` characters

### Example:

If your JSON file has:
```json
{
  "project_id": "my-awesome-project",
  "client_email": "firebase-adminsdk-abc123@my-awesome-project.iam.gserviceaccount.com",
  "private_key": "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC...\n-----END PRIVATE KEY-----\n"
}
```

Your `.env.local` should have:
```env
FIREBASE_PROJECT_ID=my-awesome-project
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-abc123@my-awesome-project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC...\n-----END PRIVATE KEY-----\n"
```

**Note:** The private key in the JSON might have actual newlines. When copying to `.env.local`, make sure to:
1. Keep it all on one line
2. Replace actual newlines with `\n` (backslash + n)
3. Wrap the entire value in double quotes

## Restart Your Dev Server:

After adding the credentials:

```bash
npm run dev
```

## What This Enables:

✅ **Impersonation Feature**: Admin can click "Login as Client" or "Login as Subcontractor" buttons
✅ Admin can test the user experience from client/subcontractor perspective
✅ Secure token-based impersonation with 1-hour expiration
✅ Full access to client/subcontractor portals while impersonating

## Testing the Impersonation Feature:

1. **Login as Admin**
2. **Go to Admin Portal → Clients** (or Subcontractors)
3. **Find a client/subcontractor card**
4. **Click "Login as Client"** (or "Login as Subcontractor") button
5. ✅ You should be automatically logged in as that user and redirected to their portal!

## Troubleshooting:

### Error: "Firebase Admin credentials are not configured"

- Make sure all three variables are in your `.env.local` file
- Make sure you restarted your dev server after adding the variables
- Check that `FIREBASE_PRIVATE_KEY` is wrapped in double quotes
- Verify that `\n` characters are present in the private key (not actual newlines)

### Error: "Invalid credentials"

- Double-check that you copied the exact values from the JSON file
- Make sure the private key includes the `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----` markers
- Verify that newlines in the private key are represented as `\n` (backslash + n), not actual line breaks
