import Link from 'next/link';

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-600 via-violet-600 to-purple-800">
      <div className="container mx-auto px-4 py-16">
        <div className="text-center mb-16">
          <h1 className="text-6xl font-bold text-white mb-4">
            HEY SPRUCE APP
          </h1>
          <p className="text-xl text-white/90 mb-2">
            Complete Property Maintenance Management System
          </p>
          <p className="text-md text-white/80">
            Version 2.0.1
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          {/* Admin Portal Card */}
          <Link href="/admin-portal">
            <div className="bg-white rounded-lg shadow-2xl p-8 hover:scale-105 transition-transform cursor-pointer">
              <div className="bg-red-500 w-16 h-16 rounded-full flex items-center justify-center mb-4 mx-auto">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2 text-center">
                Admin Portal
              </h2>
              <p className="text-gray-600 text-center">
                Manage users, approve requests, handle work orders and invoices
              </p>
            </div>
          </Link>

          {/* Client Portal Card */}
          <Link href="/client-portal">
            <div className="bg-white rounded-lg shadow-2xl p-8 hover:scale-105 transition-transform cursor-pointer">
              <div className="bg-blue-500 w-16 h-16 rounded-full flex items-center justify-center mb-4 mx-auto">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2 text-center">
                Client Portal
              </h2>
              <p className="text-gray-600 text-center">
                Create locations, submit work orders, manage quotes and invoices
              </p>
            </div>
          </Link>

          {/* Subcontractor Portal Card */}
          <Link href="/subcontractor-portal">
            <div className="bg-white rounded-lg shadow-2xl p-8 hover:scale-105 transition-transform cursor-pointer">
              <div className="bg-green-500 w-16 h-16 rounded-full flex items-center justify-center mb-4 mx-auto">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2 text-center">
                Subcontractor Portal
              </h2>
              <p className="text-gray-600 text-center">
                View work orders, submit quotes, complete assigned jobs
              </p>
            </div>
          </Link>
        </div>

        <div className="mt-16 text-center">
          <Link href="/portal-login">
            <button className="bg-white text-purple-600 font-bold py-3 px-8 rounded-lg shadow-lg hover:bg-purple-50 transition-colors">
              Login to Your Portal
            </button>
          </Link>
        </div>

        <div className="mt-12 text-center">
          <p className="text-white/80 mb-4">New User? Register Here:</p>
          <div className="flex justify-center gap-4">
            <Link href="/register-client">
              <button className="bg-white/10 backdrop-blur-sm text-white font-semibold py-2 px-6 rounded-lg border-2 border-white/30 hover:bg-white/20 transition-colors">
                Register as Client
              </button>
            </Link>
            <Link href="/register-subcontractor">
              <button className="bg-white/10 backdrop-blur-sm text-white font-semibold py-2 px-6 rounded-lg border-2 border-white/30 hover:bg-white/20 transition-colors">
                Register as Subcontractor
              </button>
            </Link>
          </div>
        </div>

        <footer className="mt-16 text-center text-white/60 text-sm">
          <p>© 2024 Hey Spruce App. All rights reserved.</p>
          <p className="mt-2">Support: support@heyspruce.com | Phone: 877-253-2646</p>
        </footer>
      </div>
    </div>
  );
}
