import type { NextConfig } from 'next';
const config: NextConfig = {
  poweredByHeader: false,
  async rewrites() { return [{ source: '/', destination: '/index.html' }]; },
  async headers() {
    const privateHeaders = [
      { key: 'Referrer-Policy', value: 'no-referrer' },
      { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
      { key: 'Cache-Control', value: 'private, no-store' },
    ];
    return [
      { source: '/:path*', headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'X-Frame-Options', value: 'DENY' },
      ] },
      { source: '/api/:path*', headers: privateHeaders },
      { source: '/order/:path*', headers: privateHeaders },
    ];
  },
};
export default config;
