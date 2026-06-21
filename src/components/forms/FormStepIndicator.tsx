'use client';

import { useThemeColors } from '../../hooks/useThemeColors';

interface FormStepIndicatorProps {
  step: number;
  totalSteps: number;
  labels: string[];
}

export function FormStepIndicator({ step, totalSteps, labels }: FormStepIndicatorProps) {
  const { colors } = useThemeColors();

  return (
    <div className="flex items-center gap-2 px-1 py-2">
      {Array.from({ length: totalSteps }, (_, index) => {
        const stepNumber = index + 1;
        const isActive = stepNumber === step;
        const isDone = stepNumber < step;
        const accent =
          stepNumber === 1 ? colors.ACCENT_BLUE : colors.ACCENT_PURPLE;

        return (
          <div key={stepNumber} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
            <div className="flex w-full items-center gap-2">
              {index > 0 && (
                <div
                  className="h-0.5 flex-1 rounded-full"
                  style={{ backgroundColor: isDone ? accent : colors.BORDER }}
                />
              )}
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold"
                style={{
                  backgroundColor: isActive || isDone ? accent : colors.BG_TERTIARY,
                  color: isActive || isDone ? colors.TEXT_INVERSE : colors.TEXT_MUTED,
                  fontFamily: 'var(--font-display)',
                  boxShadow: isActive ? `0 0 0 3px ${accent}33` : 'none',
                }}
              >
                {stepNumber}
              </span>
              {index < totalSteps - 1 && (
                <div
                  className="h-0.5 flex-1 rounded-full"
                  style={{ backgroundColor: isDone ? accent : colors.BORDER }}
                />
              )}
            </div>
            <span
              className="w-full truncate text-center text-[10px] font-bold uppercase tracking-wide"
              style={{
                color: isActive ? accent : colors.TEXT_MUTED,
                fontFamily: 'var(--font-display)',
              }}
            >
              {labels[index]}
            </span>
          </div>
        );
      })}
    </div>
  );
}
