'use client';

import { useRouter } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { useThemeColors } from '../../hooks/useThemeColors';
import { RADIUS } from '../../constants/design';

export type PageHeaderAccent =
  | 'primary'
  | 'blue'
  | 'green'
  | 'red'
  | 'purple'
  | 'yellow'
  | 'pink'
  | 'orange'
  | 'gray';

interface PageHeaderProps {
  title: string;
  showBack?: boolean;
  onBack?: () => void;
  /** sticky par défaut ; static pour FormPinnedPageHeader */
  pin?: 'sticky' | 'static';
  /** Couleur de la section (homepage) ; 'primary' (bleu marine) par défaut. */
  accent?: PageHeaderAccent;
}

const BACK_SIZE = 44;

export function usePageHeaderAccent(accent: PageHeaderAccent = 'primary') {
  const { colors } = useThemeColors();
  const map: Record<PageHeaderAccent, { color: string; muted: string }> = {
    primary: { color: colors.PRIMARY, muted: colors.PRIMARY_MUTED },
    blue: { color: colors.ACCENT_BLUE, muted: colors.ACCENT_BLUE_MUTED },
    green: { color: colors.ACCENT_GREEN, muted: colors.ACCENT_GREEN_MUTED },
    red: { color: colors.ACCENT_RED, muted: colors.ACCENT_RED_MUTED },
    purple: { color: colors.ACCENT_PURPLE, muted: colors.ACCENT_PURPLE_MUTED },
    yellow: { color: colors.ACCENT_YELLOW, muted: colors.ACCENT_YELLOW_MUTED },
    pink: { color: colors.ACCENT_PINK, muted: colors.ACCENT_PINK_MUTED },
    orange: { color: colors.ACCENT_ORANGE, muted: colors.ACCENT_ORANGE_MUTED },
    gray: { color: colors.TEXT_SECONDARY, muted: colors.BG_TERTIARY },
  };
  return map[accent];
}

export function PageHeader({
  title,
  showBack = false,
  onBack,
  pin = 'sticky',
  accent = 'primary',
}: PageHeaderProps) {
  const { colors } = useThemeColors();
  const router = useRouter();
  const sectionAccent = usePageHeaderAccent(accent);

  const handleBack = () => {
    if (onBack) {
      onBack();
      return;
    }
    router.back();
  };

  return (
    <div
      className={pin === 'sticky' ? 'sticky z-50' : 'relative z-50'}
      style={{
        top: pin === 'sticky' ? 'env(safe-area-inset-top)' : undefined,
        backgroundColor: colors.HEADER_BG,
        borderBottom: `1px solid ${colors.BORDER}`,
      }}
    >
      <div className="flex items-center gap-3 px-4 py-3" style={{ minHeight: 56 }}>
        {showBack ? (
          <button
            type="button"
            onClick={handleBack}
            aria-label="Retour"
            className="flex shrink-0 items-center justify-center transition-transform active:scale-95"
            style={{
              width: BACK_SIZE,
              height: BACK_SIZE,
              borderRadius: RADIUS.sm,
              backgroundColor: sectionAccent.muted,
            }}
          >
            <ChevronLeft size={24} color={sectionAccent.color} strokeWidth={2.5} />
          </button>
        ) : (
          <div className="w-1 shrink-0" />
        )}

        <div className="flex min-w-0 flex-1 flex-col items-center text-center">
          <p
            className="min-w-0 break-words text-[18px] font-bold uppercase leading-tight"
            style={{ color: sectionAccent.color, fontFamily: 'var(--font-display)' }}
          >
            {title}
          </p>
        </div>

        {showBack ? <div className="shrink-0" style={{ width: BACK_SIZE }} /> : <div className="w-1 shrink-0" />}
      </div>
    </div>
  );
}
