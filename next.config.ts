import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
    // This project is API-only — no frontend pages served
    // Disable image optimization (not needed for API)
    images: {
        unoptimized: true,
    },
    // Enable standalone output for Docker/Railway deployment
    output: 'standalone',
    // Security: disable x-powered-by header
    poweredByHeader: false,
};

export default nextConfig;
