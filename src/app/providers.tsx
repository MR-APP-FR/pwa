'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { AdminViewBanner } from '../components/auth/AdminViewBanner';
import { Header } from '../components/layout/Header';
import { isBarePath, showsShellHeader } from '../components/layout/pageChrome';
import { InstallBanner } from '../components/pwa/InstallBanner';
import { PwaCutoverBootstrap, PushResubscribeOnAuth } from '../components/pwa/PwaCutover';
import { useThemeColors } from '../hooks/useThemeColors';

function AppShell({ children }: { children: ReactNode }) {
  const { colors } = useThemeColors();
  const pathname = usePathname();
  const bare = isBarePath(pathname);
  const shellHeader = showsShellHeader(pathname);

  if (bare) {
    return (
      <div
        className="mx-auto flex min-h-screen max-w-md flex-col"
        style={{ backgroundColor: colors.BG_SECONDARY }}
      >
        <PwaCutoverBootstrap />
        {children}
        {/* Aussi sur /login : invite d'install avant session */}
        <InstallBanner />
      </div>
    );
  }

  return (
    <div
      className="mx-auto flex min-h-screen max-w-md flex-col"
      style={{ backgroundColor: colors.BG_SECONDARY }}
    >
      <PwaCutoverBootstrap />
      <PushResubscribeOnAuth />
      <AdminViewBanner />
      {shellHeader ? <Header /> : null}
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
