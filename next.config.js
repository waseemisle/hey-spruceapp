/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    domains: [
      'res.cloudinary.com',
      'firebasestorage.googleapis.com',
      'heyspruceappv2.firebasestorage.app',
      'cdn.prod.website-files.com'
    ],
  },
  env: {
    NEXT_PUBLIC_BASE_URL: process.env.NEXT_PUBLIC_BASE_URL || 'https://hey-spruce-appv2.vercel.app',
  },
}

module.exports = nextConfig
