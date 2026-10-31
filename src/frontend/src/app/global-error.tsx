'use client';

/**
 * A failure in the root layout itself, where `error.tsx` cannot help: it
 * replaces the whole document, so it brings its own <html> and <body> and
 * cannot rely on the global stylesheet — hence inline styles.
 */
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#020617',
          color: '#e2e8f0',
          fontFamily: 'system-ui, sans-serif',
          textAlign: 'center',
          padding: '0 24px',
        }}
      >
        <div>
          <title>Something went wrong — Fit Ready IQ</title>
          <h1 style={{ fontSize: 18, fontWeight: 600 }}>Fit Ready IQ could not load</h1>
          <p style={{ fontSize: 14, color: '#94a3b8' }}>
            Your saved places and activities are not affected.
          </p>
          <button
            type="button"
            onClick={() => retry()}
            style={{
              marginTop: 16,
              padding: '8px 16px',
              borderRadius: 8,
              border: 0,
              background: '#2563eb',
              color: 'white',
              fontSize: 14,
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
          {error.digest && (
            <p style={{ marginTop: 24, fontSize: 11, color: '#475569', fontFamily: 'monospace' }}>
              Reference {error.digest}
            </p>
          )}
        </div>
      </body>
    </html>
  );
}
