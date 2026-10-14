import type { NextConfig } from 'next';

/** The Travel API (services/api). Only the server talks to providers; the browser only talks to us. */
const apiUrl = process.env.TRAVEL_API_URL ?? 'http://localhost:4000';

const config: NextConfig = {
  // Workspace packages are shipped as TypeScript source.
  transpilePackages: ['@travel-where-to/shared', '@travel-where-to/domain', '@travel-where-to/ranking'],
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${apiUrl}/api/:path*` }];
  },
};

export default config;
