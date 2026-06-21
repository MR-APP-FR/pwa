'use client';

import type { ThemeColors } from '../../types/theme.types';
import { RADIUS } from '../../constants/design';

interface SegmentedControlProps<T extends string> {
  values: { label: string; value: T }[];
  selectedValue: T;
  onValueChange: (value: T) => void;
  colors: ThemeColors;
}

export function SegmentedControl<T extends string>({
  values,
  selectedValue,
  onValueChange,
  colors,
}: SegmentedControlProps<T>) {
  return (
    <div
      className="flex p-1"
      style={{ backgroundColor: colors.BG_TERTIARY, borderRadius: RADIUS.sm }}
    >
      {values.map((item) => {
        const isSelected = item.value === selectedValue;
        return (
          <button
            key={item.value}
            onClick={() => onValueChange(item.value)}
            className="min-h-[44px] flex-1 px-3 py-2 text-sm font-semibold transition-all duration-150"
            style={{
              borderRadius: RADIUS.sm - 2,
              backgroundColor: isSelected ? colors.SETTINGS_SECTION_BG : 'transparent',
              color: isSelected ? colors.PRIMARY : colors.TEXT_SECONDARY,
              boxShadow: isSelected ? colors.CARD_SHADOW : 'none',
              fontFamily: 'var(--font-display)',
            }}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
