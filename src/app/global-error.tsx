'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="fr">
      <body
        style={{
          margin: 0,
          minHeight: '100dvh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 16,
          padding: 24,
          fontFamily: 'system-ui, sans-serif',
          background: '#f7f6f4',
          color: '#2c2825',
          textAlign: 'center',
        }}
      >
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>
          Manège — erreur
        </h1>
        <p style={{ margin: 0, color: '#6e6a66', maxWidth: 320 }}>
          L&apos;application a rencontré un problème. Réessaie ou recharge la page.
        </p>
        <p style={{ margin: 0, fontSize: 12, color: '#9a9692' }}>
          {error.digest ? `ref: ${error.digest}` : null}
        </p>
        <button
          type="button"
          onClick={reset}
          style={{
            marginTop: 8,
            padding: '12px 20px',
            borderRadius: 16,
            background: '#292D82',
            color: '#fff',
            fontWeight: 600,
            border: 'none',
            cursor: 'pointer',
          }}
        >
          Réessayer
        </button>
      </body>
    </html>
  );
}
