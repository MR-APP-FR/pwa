'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { Header } from '../components/layout/Header';
import { InstallBanner } from '../components/pwa/InstallBanner';
import { useThemeColors } from '../hooks/useThemeColors';

const FORM_SCROLL_PATHS = new Set(['/opening', '/closing', '/availability']);

function AppShell({ children }: { children: ReactNode }) {
  const { colors } = useThemeColors();
  const pathname = usePathname();
  const formScrollLayout = FORM_SCROLL_PATHS.has(pathname);

  return (
    <div
      className="mx-auto flex min-h-screen max-w-md flex-col"
      style={{ backgroundColor: colors.BG_SECONDARY }}
    >
      {!formScrollLayout && <Header />}
      <main className="flex flex-1 flex-col">{children}</main>
      <InstallBanner />
    </div>
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
