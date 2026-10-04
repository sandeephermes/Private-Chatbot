import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Private by design: never let a CDN, analytics, or error reporter phone home.
  // Everything the app needs is served from this origin.
  poweredByHeader: false,
  // Next 16 blocks dev assets from origins it does not recognise, which stops
  // hydration for anyone browsing via 127.0.0.1 instead of localhost.
  allowedDevOrigins: ['127.0.0.1', 'localhost'],
}

export default nextConfig