'use client';

import { useRouter } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { useThemeColors } from '../../hooks/useThemeColors';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  detail?: string;
  showBack?: boolean;
  onBack?: () => void;
}

export function PageHeader({ title, subtitle, detail, showBack = false, onBack }: PageHeaderProps) {
  const { colors } = useThemeColors();
  const router = useRouter();

  const handleBack = () => {
    if (onBack) {
      onBack();
      return;
    }
    router.back();
  };

  return (
    <div
      className="sticky top-0 z-30 px-5 py-4"
      style={{
        backgroundColor: colors.HEADER_BG,
        borderBottom: `1px solid ${colors.BORDER}`,
      }}
    >
      <div className="flex items-start gap-3">
        {showBack && (
          <button
            type="button"
            onClick={handleBack}
            aria-label="Retour"
            className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border transition-opacity active:opacity-70"
            style={{
              borderColor: colors.BORDER,
              backgroundColor: colors.BG_SECONDARY,
            }}
          >
            <ChevronLeft size={20} color={colors.TEXT_PRIMARY} strokeWidth={2} />
          </button>
        )}

        <div className="min-w-0 flex-1">
          <p
            className="text-xs font-semibold uppercase tracking-wider"
            style={{ color: colors.TEXT_SECONDARY }}
          >
            {title}
          </p>
          {subtitle && (
            <p
              className="mt-0.5 text-xl font-bold leading-tight tracking-tight truncate"
              style={{ color: colors.TEXT_PRIMARY }}
            >
              {subtitle}
            </p>
          )}
          {detail && (
            <p className="mt-0.5 text-sm capitalize" style={{ color: colors.TEXT_SECONDARY }}>
              {detail}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
