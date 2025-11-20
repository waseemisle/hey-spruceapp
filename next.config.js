const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
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
    ],
  },
  env: {
    NEXT_PUBLIC_BASE_URL: process.env.NEXT_PUBLIC_BASE_URL || 'https://hey-spruce-appv2.vercel.app',
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

module.exports = nextConfig
