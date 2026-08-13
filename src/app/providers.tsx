'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { usePathname } from 'next/navigation';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { Header } from '../components/layout/Header';
import { InstallBanner } from '../components/pwa/InstallBanner';
import { useThemeColors } from '../hooks/useThemeColors';

const BARE_PATHS = new Set(['/login']);

/** Permet à un layout de page (ex: FormScrollLayout) de masquer le Header sticky global
 *  pendant qu'il rend son propre Header (variant scrollant). */
const GlobalHeaderVisibilityContext = createContext<{ hide: () => void; show: () => void } | null>(null);

export function useSuppressGlobalHeader() {
  const ctx = useContext(GlobalHeaderVisibilityContext);
  if (!ctx) {
    throw new Error('useSuppressGlobalHeader must be used within Providers');
  }
  return ctx;
}

function AppShell({ children }: { children: ReactNode }) {
  const { colors } = useThemeColors();
  const pathname = usePathname();
  const bare = BARE_PATHS.has(pathname);

  const [suppressCount, setSuppressCount] = useState(0);
  const hide = useCallback(() => setSuppressCount((c) => c + 1), []);
  const show = useCallback(() => setSuppressCount((c) => Math.max(0, c - 1)), []);
  const visibility = useMemo(() => ({ hide, show }), [hide, show]);

  if (bare) {
    return (
      <div
        className="mx-auto flex min-h-screen max-w-md flex-col"
        style={{ backgroundColor: colors.BG_SECONDARY }}
      >
        {children}
      </div>
    );
  }

  return (
    <GlobalHeaderVisibilityContext.Provider value={visibility}>
      <div
        className="mx-auto flex min-h-screen max-w-md flex-col"
        style={{ backgroundColor: colors.BG_SECONDARY }}
      >
        {suppressCount === 0 && <Header />}
        <main className="flex flex-1 flex-col">{children}</main>
        <InstallBanner />
      </div>
    </GlobalHeaderVisibilityContext.Provider>
  );
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <AppShell>{children}</AppShell>
    </QueryClientProvider>
  );
}
