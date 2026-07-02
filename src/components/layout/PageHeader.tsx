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
      <div
        className={`flex items-center gap-3 px-4 ${step ? 'py-3' : 'py-3'}`}
        style={{ minHeight: step ? 64 : 56 }}
      >
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

        <div className="min-w-0 flex-1">
          {subtitle ? (
            <div
              className={`flex min-w-0 flex-col ${showBack ? '' : 'gap-0.5'}`}
              style={showBack ? { height: BACK_SIZE } : undefined}
            >
              <span
                className="self-start px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider"
                style={{
                  borderRadius: RADIUS.xs,
                  backgroundColor: colors.SECONDARY_MUTED,
                  color: colors.SECONDARY,
                  boxShadow: `inset 0 0 0 0.5px ${colors.SECONDARY}`,
                  fontFamily: 'var(--font-display)',
                }}
              >
                {title}
              </span>
              <div className={showBack ? 'flex min-h-0 flex-1 items-end' : undefined}>
                <p
                  className={`min-w-0 font-bold uppercase ${showBack ? 'text-[17px] leading-none' : 'text-[17px] leading-tight'}`}
                  style={{
                    color: subtitleColor ?? colors.TEXT_PRIMARY,
                    fontFamily: 'var(--font-display)',
                  }}
                >
                  {subtitle}
                  {detail && (
                    <span style={{ color: detailColor ?? colors.TEXT_SECONDARY }}>
                      {' '}
                      · {detail}
                    </span>
                  )}
                </p>
              </div>
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
            <div className="mt-2 flex items-center gap-2">
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
      </div>
    </div>
  );
}
