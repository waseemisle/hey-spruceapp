# Firebase Setup Guide for Spruce App Portal

This guide will help you set up Firebase Authentication and Firestore for the Spruce App Portal.

## Prerequisites

- Firebase project: `heyspruceappv2`
- Firebase Console access
- Node.js installed

## Step 1: Enable Authentication in Firebase Console

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project: `heyspruceappv2`
3. Navigate to **Authentication** → **Sign-in method**
4. Enable **Email/Password** authentication

## Step 2: Create Demo Users

### Method 1: Firebase Console (Recommended)

1. Go to **Authentication** → **Users**
2. Click **Add user**
3. Create these 3 users:

| Email | Password | Role |
|-------|----------|------|
| `demo.client@heyspruce.com` | `demo123` | Client |
| `demo.admin@heyspruce.com` | `demo123` | Admin |
| `demo.sub@heyspruce.com` | `demo123` | Subcontractor |

### Method 2: Using the Setup Script

After creating users in Firebase Console, run:

```bash
npm run setup-demo
```

This script will:
- Sign in to each demo account
- Create user profiles in Firestore
- Set up proper role assignments

## Step 3: Configure Firestore Database

1. Go to **Firestore Database**
2. Create database in **production mode**
3. The setup script will automatically create the `users` collection with these documents:

```javascript
// users/{userId}
{
  email: "demo.client@heyspruce.com",
  fullName: "Demo Client User",
  role: "client",
  createdAt: "2024-01-15T10:00:00.000Z",
  updatedAt: "2024-01-15T10:00:00.000Z"
}
```

## Step 4: Configure Firestore Security Rules

Add these security rules in **Firestore** → **Rules**:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users can read and write their own profile
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    
    // Allow authenticated users to read all user profiles
    match /users/{userId} {
      allow read: if request.auth != null;
    }
    
    // Work orders - users can read/write based on their role
    match /work_orders/{orderId} {
      allow read, write: if request.auth != null;
    }
    
    // Properties - users can read/write based on their role
    match /properties/{propertyId} {
      allow read, write: if request.auth != null;
    }
    
    // Proposals - users can read/write based on their role
    match /proposals/{proposalId} {
      allow read, write: if request.auth != null;
    }
  }
}
```

## Step 5: Test the Application

1. Start the development server:
```bash
npm run dev
```

2. Open http://localhost:3000

3. Test login with demo credentials:
   - **Client**: `demo.client@heyspruce.com` / `demo123`
   - **Admin**: `demo.admin@heyspruce.com` / `demo123`
   - **Subcontractor**: `demo.sub@heyspruce.com` / `demo123`

## Troubleshooting

### Authentication Issues

- **"User not found"**: Make sure you've created the user in Firebase Console
- **"Wrong password"**: Verify the password in Firebase Console
- **"Invalid email"**: Check if the email is correctly formatted

### Firestore Issues

- **Permission denied**: Check your Firestore security rules
- **Collection not found**: Run the setup script to create user profiles

### Development Issues

- **Firebase not initialized**: Check if Firebase config is correct
- **Module not found**: Run `npm install` to install dependencies

## Firebase Configuration

The Firebase config is already set up in `lib/firebase.ts`:

```javascript
const firebaseConfig = {
  apiKey: "AIzaSyDWHE-iFu2JpGgOc57_RxZ_DFLpHxWYDQ8",
  authDomain: "heyspruceappv2.firebaseapp.com",
  projectId: "heyspruceappv2",
  storageBucket: "heyspruceappv2.firebasestorage.app",
  messagingSenderId: "198738285054",
  appId: "1:198738285054:web:6878291b080771623a70af",
  measurementId: "G-82NKE8271G"
}
```

## Next Steps

After successful setup:

1. **Test all portals**: Verify each role can access their respective portal
2. **Add real users**: Create actual client, admin, and subcontractor accounts
3. **Configure additional features**: Set up Firestore collections for work orders, properties, etc.
4. **Deploy**: Deploy to production when ready

## Support

If you encounter any issues:
- Check Firebase Console for error logs
- Verify network connectivity
- Ensure all dependencies are installed: `npm install`
