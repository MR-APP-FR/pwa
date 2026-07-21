import Link from 'next/link';

export default function NotFound() {
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
        Page introuvable
      </h1>
      <p style={{ margin: 0, color: 'var(--color-text-secondary)' }}>
        Cette page n&apos;existe pas.
      </p>
      <Link
        href="/"
        style={{
          marginTop: 8,
          padding: '12px 20px',
          borderRadius: 'var(--radius-md)',
          background: 'var(--color-primary)',
          color: '#fff',
          fontWeight: 600,
        }}
      >
        Retour à l&apos;accueil
      </Link>
    </main>
  );
}
