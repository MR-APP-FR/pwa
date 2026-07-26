'use client';

import { useRouter } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { useThemeColors } from '../../hooks/useThemeColors';
import { RADIUS } from '../../constants/design';

interface PageHeaderStep {
  current: number;
  total: number;
  labels: string[];
  hints?: string[];
}

type PageHeaderAccent = 'primary' | 'green' | 'red' | 'purple' | 'yellow' | 'pink' | 'orange';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  detail?: string;
  subtitleColor?: string;
  detailColor?: string;
  showBack?: boolean;
  onBack?: () => void;
  step?: PageHeaderStep;
  /** sticky par défaut ; static pour FormPinnedPageHeader */
  pin?: 'sticky' | 'static';
  /** Couleur de la section (pastille de titre, pas d'étape) ; 'primary' (bleu marine) par défaut. */
  accent?: PageHeaderAccent;
}

const BACK_SIZE = 44;

export function PageHeader({
  title,
  subtitle,
  detail,
  subtitleColor,
  detailColor,
  showBack = false,
  onBack,
  step,
  pin = 'sticky',
  accent = 'primary',
}: PageHeaderProps) {
  const { colors } = useThemeColors();
  const router = useRouter();

  const handleBack = () => {
    if (onBack) {
      onBack();
      return;
    }
    router.back();
  };

  const ACCENT_MAP: Record<PageHeaderAccent, { color: string; muted: string }> = {
    primary: { color: colors.PRIMARY, muted: colors.PRIMARY_MUTED },
    green: { color: colors.ACCENT_GREEN, muted: colors.ACCENT_GREEN_MUTED },
    red: { color: colors.ACCENT_RED, muted: colors.ACCENT_RED_MUTED },
    purple: { color: colors.ACCENT_PURPLE, muted: colors.ACCENT_PURPLE_MUTED },
    yellow: { color: colors.ACCENT_YELLOW, muted: colors.ACCENT_YELLOW_MUTED },
    pink: { color: colors.ACCENT_PINK, muted: colors.ACCENT_PINK_MUTED },
    orange: { color: colors.ACCENT_ORANGE, muted: colors.ACCENT_ORANGE_MUTED },
  };
  const sectionAccent = ACCENT_MAP[accent];
  const stepAccent = colors.PRIMARY;
  const stepLabel = step ? step.labels[step.current - 1] : undefined;
  const stepHint = step?.hints?.[step.current - 1];

  return (
    <div
      className={pin === 'sticky' ? 'sticky z-50' : 'relative z-50'}
      style={{
        top: pin === 'sticky' ? 'env(safe-area-inset-top)' : undefined,
        backgroundColor: colors.HEADER_BG,
        borderBottom: `1px solid ${colors.BORDER}`,
      }}
    >
      <div className="flex items-center gap-3 px-4 py-3" style={{ minHeight: step ? 64 : 56 }}>
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
              backgroundColor: colors.PRIMARY_MUTED,
            }}
          >
            <ChevronLeft size={24} color={colors.PRIMARY} strokeWidth={2.5} />
          </button>
        ) : (
          <div className="w-1 shrink-0" />
        )}

        <div className="flex min-w-0 flex-1 flex-col items-center text-center">
          {subtitle ? (
            <div className="flex min-w-0 flex-col items-center gap-0.5">
              <span
                className="px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider"
                style={{
                  borderRadius: RADIUS.xs,
                  backgroundColor: sectionAccent.muted,
                  color: sectionAccent.color,
                  boxShadow: `inset 0 0 0 0.5px ${sectionAccent.color}`,
                  fontFamily: 'var(--font-display)',
                }}
              >
                {title}
              </span>
              <p
                className="min-w-0 break-words text-[17px] font-bold uppercase leading-tight"
                style={{
                  color: subtitleColor ?? colors.TEXT_PRIMARY,
                  fontFamily: 'var(--font-display)',
                }}
              >
                {subtitle}
              </p>
              {detail && (
                <p
                  className="min-w-0 break-words text-[15px] font-bold uppercase leading-tight"
                  style={{
                    color: detailColor ?? colors.TEXT_SECONDARY,
                    fontFamily: 'var(--font-display)',
                  }}
                >
                  {detail}
                </p>
              )}
            </div>
          ) : (
            <p
              className="text-[18px] font-bold uppercase leading-tight"
              style={{ color: colors.TEXT_PRIMARY, fontFamily: 'var(--font-display)' }}
            >
              {title}
            </p>
          )}

          {step && (
            <div className="mt-2 flex items-center justify-center gap-2">
              <div className="flex shrink-0 items-center gap-1">
                {Array.from({ length: step.total }, (_, i) => {
                  const n = i + 1;
                  const active = n === step.current;
                  const done = n < step.current;
                  const dotColor = done || active ? stepAccent : colors.BORDER;
                  return (
                    <span
                      key={n}
                      className="rounded-full"
                      style={{
                        width: active ? 20 : 7,
                        height: 7,
                        backgroundColor: dotColor,
                        transition: 'width 0.2s ease',
                      }}
                    />
                  );
                })}
              </div>
              <p
                className="min-w-0 text-[13px] leading-snug"
                style={{ color: colors.TEXT_SECONDARY }}
              >
                <span
                  className="font-bold"
                  style={{ color: stepAccent, fontFamily: 'var(--font-display)' }}
                >
                  {step.current}/{step.total} {stepLabel}
                </span>
                {stepHint && <span> · {stepHint}</span>}
              </p>
            </div>
          )}
        </div>

        {showBack ? <div className="shrink-0" style={{ width: BACK_SIZE }} /> : <div className="w-1 shrink-0" />}
      </div>
    </div>
  );
}
