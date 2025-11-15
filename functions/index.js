const functions = require('firebase-functions');
const admin = require('firebase-admin');

// Initialize Firebase Admin (automatically uses ADC when deployed)
admin.initializeApp();

// Generate impersonation token
exports.generateImpersonationToken = functions.https.onCall(async (data, context) => {
  try {
    // Verify the requesting user is authenticated
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { userId, role } = data;

    if (!userId || !role) {
      throw new functions.https.HttpsError('invalid-argument', 'User ID and role are required');
    }

    if (role !== 'client' && role !== 'subcontractor') {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Invalid role. Only client and subcontractor can be impersonated'
      );
    }

    // Check if the requesting user is an admin
    const adminDoc = await admin.firestore().collection('adminUsers').doc(context.auth.uid).get();
    if (!adminDoc.exists) {
      throw new functions.https.HttpsError('permission-denied', 'Only admins can impersonate users');
    }

    // Verify the target user exists
    const collectionName = role === 'client' ? 'clients' : 'subcontractors';
    const userDoc = await admin.firestore().collection(collectionName).doc(userId).get();

    if (!userDoc.exists) {
      throw new functions.https.HttpsError('not-found', `${role} not found`);
    }

    const userData = userDoc.data();

    // Generate a custom token for impersonation
    const customToken = await admin.auth().createCustomToken(userId, {
      impersonating: true,
      originalAdmin: context.auth.uid,
      role: role,
    });

    // Create impersonation token
    const tokenData = JSON.stringify({
      customToken,
      userId,
      role,
      expiresAt: Date.now() + 3600000, // 1 hour
    });
    const impersonationToken = Buffer.from(tokenData)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');

    return {
      success: true,
      impersonationToken,
      user: {
        id: userId,
        name: userData.fullName || userData.businessName || 'Unknown',
        email: userData.email,
      },
      expiresAt: 'after 1 hour',
    };
  } catch (error) {
    console.error('Error generating impersonation token:', error);
    throw new functions.https.HttpsError('internal', error.message || 'Failed to generate impersonation token');
  }
});
