import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Check if the path starts with /admin-portal
  if (pathname.startsWith('/admin-portal')) {
    // For now, we'll let the client-side handle the role checking
    // This middleware can be enhanced later with server-side session checking
    return NextResponse.next()
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/admin-portal/:path*',
  ]
}

