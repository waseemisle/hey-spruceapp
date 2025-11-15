import { NextResponse } from 'next/server';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';

export const runtime = 'nodejs';

// Initialize Firebase client SDK for server-side use
const getFirebaseApp = () => {
  if (getApps().length === 0) {
    return initializeApp({
      apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
      authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
      appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    });
  }
  return getApp();
};

// POST - Generate impersonation token (calls Firebase Function)
export async function POST(request: Request) {
  try {
    const { userId, role } = await request.json();

    if (!userId || !role) {
      return NextResponse.json(
        { error: 'User ID and role are required' },
        { status: 400 }
      );
    }

    if (role !== 'client' && role !== 'subcontractor') {
      return NextResponse.json(
        { error: 'Invalid role. Only client and subcontractor can be impersonated' },
        { status: 400 }
      );
    }

    // Verify the requesting user is an admin
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Authorization header required' },
        { status: 401 }
      );
    }

    const idToken = authHeader.substring(7);

    // Call Firebase Function to generate impersonation token
    const app = getFirebaseApp();
    const functions = getFunctions(app);
    const generateToken = httpsCallable(functions, 'generateImpersonationToken');

    // Call the function with the ID token in the header
    const result = await generateToken({ userId, role }, {
      headers: {
        'Authorization': `Bearer ${idToken}`
      }
    });

    const data = result.data as any;

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ||
                   (request.headers.get('origin') || 'http://localhost:3000');

    const impersonationUrl = `${baseUrl}/api/auth/impersonate?token=${data.impersonationToken}`;

    return NextResponse.json({
      success: true,
      impersonationToken: data.impersonationToken,
      impersonationUrl,
      [role]: data.user,
      expiresAt: data.expiresAt,
    });
  } catch (error: any) {
    console.error('Error generating impersonation token:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate impersonation token' },
      { status: 500 }
    );
  }
}

// GET - Handle impersonation login
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');

    if (!token) {
      return NextResponse.json(
        { error: 'Impersonation token is required' },
        { status: 400 }
      );
    }

    // Decode the token (reverse the base64url encoding)
    let tokenData;
    try {
      // Add padding if needed
      let base64 = token.replace(/-/g, '+').replace(/_/g, '/');
      while (base64.length % 4) {
        base64 += '=';
      }
      const decoded = Buffer.from(base64, 'base64').toString('utf-8');
      tokenData = JSON.parse(decoded);
    } catch (error) {
      return NextResponse.json(
        { error: 'Invalid impersonation token' },
        { status: 400 }
      );
    }

    // Check if token is expired
    if (tokenData.expiresAt < Date.now()) {
      return NextResponse.json(
        { error: 'Impersonation token has expired' },
        { status: 401 }
      );
    }

    // Return HTML page that will sign in with the custom token
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Impersonating User...</title>
          <script src="https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js"></script>
          <script src="https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js"></script>
        </head>
        <body>
          <div style="display: flex; justify-content: center; align-items: center; height: 100vh; font-family: Arial, sans-serif;">
            <div style="text-align: center;">
              <h2>Logging in...</h2>
              <p>Please wait while we sign you in.</p>
            </div>
          </div>
          <script>
            const firebaseConfig = {
              apiKey: "${process.env.NEXT_PUBLIC_FIREBASE_API_KEY}",
              authDomain: "${process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN}",
              projectId: "${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}",
              storageBucket: "${process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET}",
              messagingSenderId: "${process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID}",
              appId: "${process.env.NEXT_PUBLIC_FIREBASE_APP_ID}"
            };
            
            firebase.initializeApp(firebaseConfig);
            const auth = firebase.auth();
            
            auth.signInWithCustomToken(${JSON.stringify(tokenData.customToken)})
              .then((userCredential) => {
                const role = "${tokenData.role}";
                if (role === 'client') {
                  window.location.href = '/client-portal';
                } else if (role === 'subcontractor') {
                  window.location.href = '/subcontractor-portal';
                } else {
                  window.location.href = '/';
                }
              })
              .catch((error) => {
                console.error('Error signing in:', error);
                document.body.innerHTML = '<div style="display: flex; justify-content: center; align-items: center; height: 100vh; font-family: Arial, sans-serif;"><div style="text-align: center;"><h2>Error</h2><p>Failed to sign in. Please try again.</p><a href="/admin-portal">Return to Admin Portal</a></div></div>';
              });
          </script>
        </body>
      </html>
    `;

    return new Response(html, {
      headers: {
        'Content-Type': 'text/html',
      },
    });
  } catch (error: any) {
    console.error('Error handling impersonation:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to handle impersonation' },
      { status: 500 }
    );
  }
}

