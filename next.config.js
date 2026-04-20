const path = require('path');
const withPWA = require('@ducanh2912/next-pwa').default({
  dest: 'public',
  register: true,
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: false,
  reloadOnOnline: true,
  disable: false,
  workboxOptions: {
    disableDevLogs: true,
    runtimeCaching: [
      {
        urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
        handler: 'NetworkOnly',
      },
      {
        urlPattern: ({ url }) =>
          url.hostname.endsWith('googleapis.com') ||
          url.hostname.endsWith('firebaseio.com') ||
          url.hostname.endsWith('firebasestorage.app') ||
          url.hostname.endsWith('firebaseapp.com'),
        handler: 'NetworkOnly',
      },
      {
        urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp|ico)$/i,
        handler: 'CacheFirst',
        options: {
          cacheName: 'static-image-assets',
          expiration: { maxEntries: 128, maxAgeSeconds: 30 * 24 * 60 * 60 },
        },
      },
      {
        urlPattern: /\.(?:js|css|woff2?|ttf|otf)$/i,
        handler: 'StaleWhileRevalidate',
        options: {
          cacheName: 'static-resources',
          expiration: { maxEntries: 64, maxAgeSeconds: 7 * 24 * 60 * 60 },
        },
      },
      {
        urlPattern: ({ request, url }) =>
          request.mode === 'navigate' && !url.pathname.startsWith('/api/'),
        handler: 'NetworkFirst',
        options: {
          cacheName: 'pages',
          networkTimeoutSeconds: 5,
          expiration: { maxEntries: 32, maxAgeSeconds: 24 * 60 * 60 },
        },
      },
    ],
    navigateFallback: '/offline',
    navigateFallbackDenylist: [/^\/api\//],
  },
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Rewrite to Firebase CF removed — GCP org policy (iam.allowedPolicyMemberDomains)
  // blocks allUsers on Cloud Functions. Requests now go to the local Vercel route at
  // app/api/maint-requests/route.ts which handles the same logic (compress + Cloudinary + Firestore).
  async redirects() {
    return [
      {
        source: '/portal-login',
        has: [{ type: 'host', value: 'hey-spruce-appv2.vercel.app' }],
        destination: 'https://groundopscos.vercel.app/portal-login',
        permanent: true,
      },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'res.cloudinary.com',
      },
      {
        protocol: 'https',
        hostname: 'firebasestorage.googleapis.com',
      },
      {
        protocol: 'https',
        hostname: 'heyspruceappv2.firebasestorage.app',
      },
      {
        protocol: 'https',
        hostname: 'cdn.prod.website-files.com',
      },
      {
        protocol: 'https',
        hostname: 'www.groundops.co',
      },
    ],
  },
  env: {
    NEXT_PUBLIC_BASE_URL: process.env.NEXT_PUBLIC_BASE_URL || 'https://groundopscos.vercel.app',
  },
  webpack: (config, { isServer }) => {
    // Ensure path aliases work correctly in both client and server builds
    const projectRoot = path.resolve(__dirname);
    config.resolve.alias = {
      ...config.resolve.alias,
      '@': projectRoot,
    };

    // Ensure extensions are resolved correctly
    if (!config.resolve.extensions) {
      config.resolve.extensions = [];
    }
    const extensions = ['.js', '.jsx', '.ts', '.tsx', '.json'];
    config.resolve.extensions = [
      ...extensions.filter(ext => !config.resolve.extensions.includes(ext)),
      ...config.resolve.extensions,
    ];

    return config;
  },
}

module.exports = withPWA(nextConfig);
