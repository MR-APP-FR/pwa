import type { NextConfig } from 'next';
import path from 'path';
import { fileURLToPath } from 'url';

/** Identifiant de build pour le reload auto PWA (client vs `/api/version`). */
const appVersion =
  process.env.VERCEL_GIT_COMMIT_SHA ||
  process.env.VERCEL_DEPLOYMENT_ID ||
  'dev';

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_APP_VERSION: appVersion,
  },
  turbopack: {
    root: path.dirname(fileURLToPath(import.meta.url)),
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '4mb',
    },
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [{ key: 'Permissions-Policy', value: 'geolocation=(self)' }],
      },
    ];
  },
};

export default nextConfig;
