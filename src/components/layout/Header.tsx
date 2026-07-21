'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Settings } from 'lucide-react';
import { useThemeColors } from '../../hooks/useThemeColors';
import { useTranslation } from '../../hooks/useTranslation';
import { RADIUS } from '../../constants/design';

interface HeaderProps {
  variant?: 'sticky' | 'static';
}

export function Header({ variant = 'sticky' }: HeaderProps) {
  const { colors } = useThemeColors();
  const { t } = useTranslation();

  return (
    <header
      className={variant === 'sticky' ? 'sticky top-0 z-40' : 'relative z-0'}
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="w-10 shrink-0" aria-hidden />

        <Link
          href="/"
          className="flex min-w-0 flex-1 items-center justify-center no-underline"
          aria-label="Accueil Les Manèges Ravoire"
        >
          <Image
            src="/logo.png"
            alt="Les Manèges Ravoire"
            width={200}
            height={56}
            priority
            className="h-14 w-auto"
            style={{ width: 'auto' }}
          />
        </Link>

        <Link
          href="/profil"
          className="flex h-10 w-10 shrink-0 items-center justify-center transition-transform active:scale-95"
          style={{
            borderRadius: RADIUS.sm,
            backgroundColor: colors.SECONDARY_MUTED,
          }}
          aria-label={t('screens.home.settingsButton')}
        >
          <Settings size={20} color={colors.SECONDARY} strokeWidth={2.25} />
        </Link>
      </div>
    </header>
  );
}
