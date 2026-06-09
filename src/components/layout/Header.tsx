'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Settings } from 'lucide-react';
import { useThemeColors } from '../../hooks/useThemeColors';
import { useTranslation } from '../../hooks/useTranslation';

export function Header() {
  const { colors } = useThemeColors();

  return (
    <header
      className="sticky top-0 z-40"
      style={{
        backgroundColor: colors.HEADER_BG,
        borderBottom: `1px solid ${colors.BORDER}`,
        paddingTop: 'max(12px, env(safe-area-inset-top))',
      }}
    >
      <div className="relative flex items-center justify-center py-3">
        <Link href="/" className="flex items-center justify-center no-underline">
          <Image src="/logo.png" alt="Manège" width={190} height={57} />
        </Link>
      </div>
      <DemoModeBanner />
    </header>
  );
}

function DemoModeBanner() {
  const { t } = useTranslation();

  return (
    <div
      className="flex items-center justify-between gap-2 px-3 py-1.5"
      style={{
        color: '#FFFFFF',
        backgroundColor: '#2A2A2A',
      }}
      aria-label="Mode démo, pas d'authentification réelle"
    >
      <span className="text-[10px] font-semibold uppercase tracking-wider">Mode démo</span>
      <Link
        href="/profil"
        className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider no-underline transition-opacity active:opacity-70"
        style={{ color: '#FFFFFF' }}
        aria-label={t('screens.home.settingsButton')}
      >
        <Settings size={12} strokeWidth={2.25} />
        {t('screens.home.settingsButton')}
      </Link>
    </div>
  );
}
