import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Version du déploiement courant (SHA Vercel).
 * Comparée côté client à `NEXT_PUBLIC_APP_VERSION` pour forcer un reload.
 */
export async function GET() {
  const version =
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.VERCEL_DEPLOYMENT_ID ||
    process.env.NEXT_PUBLIC_APP_VERSION ||
    'dev';

  return NextResponse.json(
    { version },
    {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    },
  );
}
