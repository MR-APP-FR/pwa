'use client';

import { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main
      style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        padding: 24,
        background: 'var(--color-bg)',
        color: 'var(--color-text)',
        textAlign: 'center',
      }}
    >
      <h1
        className="font-display"
        style={{ fontSize: 22, fontWeight: 700, margin: 0 }}
      >
        Une erreur est survenue
      </h1>
      <p style={{ margin: 0, color: 'var(--color-text-secondary)', maxWidth: 320 }}>
        Réessaie. Si le problème continue, reconnecte-toi ou recharge l&apos;app.
      </p>
      <button
        type="button"
        onClick={reset}
        style={{
          marginTop: 8,
          padding: '12px 20px',
          borderRadius: 'var(--radius-md)',
          background: 'var(--color-primary)',
          color: '#fff',
          fontWeight: 600,
        }}
      >
        Réessayer
      </button>
    </main>
  );
}
