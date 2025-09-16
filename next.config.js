/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  images: {
    domains: ['uokmehjqcxmcoavnszid.supabase.co', 'cdn.prod.website-files.com'],
  },
  trailingSlash: false,
  generateEtags: false,
  poweredByHeader: false,
}

export default nextConfig
