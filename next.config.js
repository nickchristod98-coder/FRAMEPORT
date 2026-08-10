/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    appDir: true
  },
  images: {
    // allow supabase storage domain (set at runtime via NEXT_PUBLIC_SUPABASE_URL)
    domains: []
  }
};

module.exports = nextConfig;
