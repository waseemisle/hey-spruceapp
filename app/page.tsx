import Link from 'next/link';
import Logo from '@/components/ui/logo';

export default function Home() {
  return (
    <div className="min-h-screen bg-white text-gray-900">
      <div className="container mx-auto px-4 py-16">
        <div className="text-center mb-16">
          <div className="flex justify-center mb-6">
            <Logo href="/" size="xl" />
          </div>
          <p className="text-lg text-gray-600 mb-1 font-medium">
            Facility Maintenance Infrastructure
          </p>
          <p className="text-sm text-gray-500 mb-2">
            Now serving all of LA County
          </p>
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mt-4 mb-2 tracking-tight">
            Facility maintenance built for scale.
          </h1>
          <p className="text-gray-600 max-w-xl mx-auto">
            A service company first, supported by software. End-to-end cleaning and maintenance operations for multi-location hospitality.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          {/* Admin Portal Card */}
          <Link href="/admin-portal">
            <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-8 hover:shadow-md hover:border-gray-300 transition-all cursor-pointer">
              <div className="bg-gray-900 w-16 h-16 rounded-lg flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-2 text-center">
                Admin Portal
              </h2>
              <p className="text-gray-600 text-center text-sm">
                Manage users, approve requests, handle work orders and invoices
              </p>
            </div>
          </Link>

          {/* Client Portal Card */}
          <Link href="/client-portal">
            <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-8 hover:shadow-md hover:border-gray-300 transition-all cursor-pointer">
              <div className="bg-gray-900 w-16 h-16 rounded-lg flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-2 text-center">
                Client Portal
              </h2>
              <p className="text-gray-600 text-center text-sm">
                Create locations, submit work orders, manage quotes and invoices
              </p>
            </div>
          </Link>

          {/* Subcontractor Portal Card */}
          <Link href="/subcontractor-portal">
            <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-8 hover:shadow-md hover:border-gray-300 transition-all cursor-pointer">
              <div className="bg-gray-900 w-16 h-16 rounded-lg flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-2 text-center">
                Subcontractor Portal
              </h2>
              <p className="text-gray-600 text-center text-sm">
                View work orders, submit quotes, complete assigned jobs
              </p>
            </div>
          </Link>
        </div>

        <div className="mt-16 text-center">
          <Link href="/portal-login">
            <button className="bg-gray-900 text-white font-semibold py-3 px-8 rounded-lg hover:bg-gray-800 transition-colors">
              Login to Your Portal
            </button>
          </Link>
        </div>

        <div className="mt-12 text-center">
          <p className="text-gray-600 mb-4 text-sm">New User? Register Here:</p>
          <div className="flex justify-center gap-4">
            <Link href="/register-client">
              <button className="bg-white border-2 border-gray-300 text-gray-900 font-semibold py-2 px-6 rounded-lg hover:bg-gray-50 hover:border-gray-400 transition-colors">
                Register as Client
              </button>
            </Link>
            <Link href="/register-subcontractor">
              <button className="bg-white border-2 border-gray-300 text-gray-900 font-semibold py-2 px-6 rounded-lg hover:bg-gray-50 hover:border-gray-400 transition-colors">
                Register as Subcontractor
              </button>
            </Link>
          </div>
        </div>

        <footer className="mt-16 text-center text-gray-500 text-sm border-t border-gray-200 pt-8">
          <p>© {new Date().getFullYear()} GroundOps LLC. All rights reserved.</p>
          <p className="mt-2">Support: info@groundops.com | Phone: (323) 555-1234</p>
          <p className="mt-1"><a href="https://www.groundops.co" className="text-gray-600 hover:underline">groundops.co</a></p>
        </footer>
      </div>
    </div>
  );
}
