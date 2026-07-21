export default function Loading() {
  return (
    <main
      style={{
        minHeight: '100dvh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--color-bg)',
        color: 'var(--color-text-secondary)',
      }}
      aria-busy="true"
      aria-live="polite"
    >
      Chargement…
    </main>
  );
}
