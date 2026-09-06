'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useThemeColors } from '../../hooks/useThemeColors';
import { useTranslation } from '../../hooks/useTranslation';
import { RADIUS } from '../../constants/design';

export interface DurationValue {
  minutes: number | null;
  seconds: number | null;
}

interface FormDurationInputProps {
  label: string;
  value: DurationValue;
  onChange: (value: DurationValue) => void;
  required?: boolean;
  error?: boolean;
}

const ITEM_H = 36;
const VISIBLE_ROWS = 3;
const PAD_ROWS = Math.floor(VISIBLE_ROWS / 2);
const WHEEL_H = ITEM_H * VISIBLE_ROWS;
const MAX_MINUTES = 9;
const COL_W = 72;

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function WheelColumn({
  values,
  selected,
  formatLabel,
  ariaLabel,
  onSelect,
}: {
  values: number[];
  selected: number;
  formatLabel: (n: number) => string;
  ariaLabel: string;
  onSelect: (n: number) => void;
}) {
  const { colors } = useThemeColors();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const settleTimer = useRef<number | null>(null);
  const ignoreScroll = useRef(true);

  const scrollToIndex = useCallback((index: number, behavior: ScrollBehavior) => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTo({ top: index * ITEM_H, behavior });
  }, []);

  useEffect(() => {
    const index = Math.max(0, values.indexOf(selected));
    ignoreScroll.current = true;
    scrollToIndex(index, 'instant');
    const id = window.setTimeout(() => {
      ignoreScroll.current = false;
    }, 80);
    return () => window.clearTimeout(id);
  }, [selected, values, scrollToIndex]);

  const commitFromScroll = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const index = Math.min(values.length - 1, Math.max(0, Math.round(el.scrollTop / ITEM_H)));
    const next = values[index];
    if (next !== selected) onSelect(next);
    else scrollToIndex(index, 'smooth');
  }, [onSelect, selected, scrollToIndex, values]);

  const onScroll = () => {
    if (ignoreScroll.current) return;
    if (settleTimer.current != null) window.clearTimeout(settleTimer.current);
    settleTimer.current = window.setTimeout(commitFromScroll, 80);
  };

  return (
    <div
      className="relative shrink-0"
      style={{ width: COL_W }}
      role="listbox"
      aria-label={ariaLabel}
    >
      <div
        ref={scrollerRef}
        onScroll={onScroll}
        className="overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{
          height: WHEEL_H,
          WebkitMaskImage:
            'linear-gradient(to bottom, transparent, black 18%, black 82%, transparent)',
          maskImage: 'linear-gradient(to bottom, transparent, black 18%, black 82%, transparent)',
        }}
      >
        <div style={{ height: PAD_ROWS * ITEM_H }} />
        {values.map((n) => {
          const active = n === selected;
          return (
            <button
              key={n}
              type="button"
              role="option"
              aria-selected={active}
              onClick={() => onSelect(n)}
              className="flex w-full items-center justify-center"
              style={{
                height: ITEM_H,
                lineHeight: `${ITEM_H}px`,
                color: active ? colors.TEXT_PRIMARY : colors.TEXT_SECONDARY,
                fontWeight: active ? 650 : 500,
                fontVariantNumeric: 'tabular-nums',
                fontSize: 22,
                letterSpacing: 0,
              }}
            >
              {formatLabel(n)}
            </button>
          );
        })}
        <div style={{ height: PAD_ROWS * ITEM_H }} />
      </div>
    </div>
  );
}

export function FormDurationInput({
  label,
  value,
  onChange,
  required,
  error,
}: FormDurationInputProps) {
  const { colors } = useThemeColors();
  const { t } = useTranslation();

  const minutes = value.minutes ?? 0;
  const seconds = value.seconds ?? 0;
  const minuteValues = Array.from({ length: MAX_MINUTES + 1 }, (_, i) => i);
  const secondValues = Array.from({ length: 60 }, (_, i) => i);

  return (
    <div className="space-y-1.5">
      {label.trim().length > 0 && (
        <label className="text-sm font-semibold leading-snug" style={{ color: colors.TEXT_PRIMARY }}>
          {label}
          {required && (
            <span className="ml-0.5" style={{ color: colors.DANGER }} aria-hidden>
              *
            </span>
          )}
        </label>
      )}
      <div
        className="relative overflow-hidden"
        style={{
          backgroundColor: colors.BG_SECONDARY,
          borderRadius: RADIUS.md,
          border: `1px solid ${error ? colors.DANGER : colors.BORDER}`,
        }}
        aria-required={required || undefined}
        aria-invalid={error || undefined}
      >
        <div className="relative" style={{ height: WHEEL_H }}>
          <div
            aria-hidden
            className="pointer-events-none absolute left-3 right-3 top-1/2 z-0 -translate-y-1/2 rounded-xl"
            style={{
              height: ITEM_H,
              backgroundColor: error ? colors.ACCENT_RED_MUTED : colors.BG_PRIMARY,
              border: `1px solid ${error ? colors.DANGER : colors.BORDER}`,
            }}
          />
          <div className="relative z-10 flex h-full items-center justify-center">
            <WheelColumn
              values={minuteValues}
              selected={minutes}
              formatLabel={pad2}
              ariaLabel={t('forms.common.durationMinutes')}
              onSelect={(n) => onChange({ minutes: n, seconds: value.seconds ?? 0 })}
            />
            <div
              className="flex shrink-0 items-center justify-center"
              style={{
                width: 20,
                height: ITEM_H,
                color: colors.TEXT_PRIMARY,
                fontSize: 22,
                fontWeight: 700,
                lineHeight: 1,
                fontVariantNumeric: 'tabular-nums',
              }}
              aria-hidden
            >
              :
            </div>
            <WheelColumn
              values={secondValues}
              selected={seconds}
              formatLabel={pad2}
              ariaLabel={t('forms.common.durationSeconds')}
              onSelect={(n) => onChange({ minutes: value.minutes ?? 0, seconds: n })}
            />
          </div>
        </div>
        <div className="flex justify-center pb-2">
          <span
            className="text-center text-[11px] font-semibold uppercase tracking-wide"
            style={{ color: colors.TEXT_SECONDARY, width: COL_W }}
          >
            {t('forms.common.durationMinutes')}
          </span>
          <span style={{ width: 20 }} aria-hidden />
          <span
            className="text-center text-[11px] font-semibold uppercase tracking-wide"
            style={{ color: colors.TEXT_SECONDARY, width: COL_W }}
          >
            {t('forms.common.durationSeconds')}
          </span>
        </div>
      </div>
    </div>
  );
}
