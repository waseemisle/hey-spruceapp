# Demo Users Status

## ✅ Working Accounts (Ready to Use)

### 1. Admin Account
- **Email:** `demo.admin@heyspruce.com`
- **Password:** `demo123`
- **Status:** ✅ **READY TO USE**
- **UID:** `KVaytOqzmSYqLA6XkKsOhrvyOT13`

### 2. Subcontractor Account  
- **Email:** `demo.sub@heyspruce.com`
- **Password:** `demo123`
- **Status:** ✅ **READY TO USE**
- **UID:** `HmOXbbG17aM1GWHEkNGIhPJppan1`

---

## ⚠️ Needs Fix

### 3. Client Account
- **Email:** `demo.client@heyspruce.com`
- **Current Status:** ❌ **NEEDS PASSWORD RESET**
- **Issue:** User exists in Firebase Auth but with a different password
- **Solution:** Choose one of the following:

#### Option A: Reset Password in Firebase Console (Recommended)
1. Go to [Firebase Console](https://console.firebase.google.com)
2. Select project: `heyspruceappv2`
3. Navigate to: **Authentication** > **Users**
4. Find: `demo.client@heyspruce.com`
5. Click the three dots (...) > **Reset password**
6. Set new password to: `demo123`
7. Run: `node scripts/final-setup-all-users.mjs` again

#### Option B: Use Current Password
1. Run: `node scripts/fix-client-user.mjs`
2. Enter the current password when prompted
3. The script will update the database profile

#### Option C: Delete and Recreate
1. Go to Firebase Console > Authentication
2. Delete user: `demo.client@heyspruce.com`
3. Run: `node scripts/final-setup-all-users.mjs`
4. New user will be created with `demo123` password

---

## 🚀 How to Test

### Login URL
```
http://localhost:3000/portal-login
```

### Steps to Login:
1. Go to the login page
2. **Select the correct portal type** (Admin/Client/Subcontractor)
3. Enter email and password
4. Click "Sign In"

### Available Test Accounts:

#### ✅ Test as Admin
```
Email: demo.admin@heyspruce.com
Password: demo123
Portal: Admin
```

#### ✅ Test as Subcontractor
```
Email: demo.sub@heyspruce.com
Password: demo123
Portal: Subcontractor
```

#### ⚠️  Test as Client (After Fix)
```
Email: demo.client@heyspruce.com
Password: demo123
Portal: Client
```

---

## 📝 Quick Reference Scripts

### Check User Status
```bash
node scripts/check-demo-users.mjs
```

### Setup All Users
```bash
node scripts/final-setup-all-users.mjs
```

### Fix Client User Only
```bash
node scripts/fix-client-user.mjs
```

---

## ✨ Current Status Summary

| User Type | Email | Password | Status |
|-----------|-------|----------|--------|
| Admin | demo.admin@heyspruce.com | demo123 | ✅ Ready |
| Subcontractor | demo.sub@heyspruce.com | demo123 | ✅ Ready |
| Client | demo.client@heyspruce.com | ??? | ⚠️ Needs Fix |

---

**Last Updated:** Just now  
**2 out of 3 users are ready for testing!**
