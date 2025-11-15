import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

// POST - Redirect to view-as API (simplified impersonation)
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const authHeader = request.headers.get('authorization');

    // Forward to view-as API
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ||
                   (request.headers.get('origin') || 'http://localhost:3000');

    const viewAsResponse = await fetch(`${baseUrl}/api/auth/view-as`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader || '',
      },
      body: JSON.stringify(body),
    });

    const data = await viewAsResponse.json();

    if (!viewAsResponse.ok) {
      return NextResponse.json(data, { status: viewAsResponse.status });
    }

    // Return with redirect URL
    return NextResponse.json({
      success: true,
      impersonationUrl: data.redirectUrl,
      [body.role]: data.user,
      viewAsToken: data.viewAsToken,
    });
  } catch (error: any) {
    console.error('Error in impersonation:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to start impersonation' },
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

