'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { Header } from '../components/layout/Header';
import { InstallBanner } from '../components/pwa/InstallBanner';
import { useThemeColors } from '../hooks/useThemeColors';

function AppShell({ children }: { children: ReactNode }) {
  const { colors } = useThemeColors();

  return (
    <div
      className="min-h-screen flex flex-col max-w-md mx-auto"
      style={{ backgroundColor: colors.BG_SECONDARY }}
    >
      <Header />
      <main className="flex-1 flex flex-col">{children}</main>
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
