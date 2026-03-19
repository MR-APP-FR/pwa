'use client';

import type { ThemeColors } from '../../types/theme.types';

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
      className="flex rounded-lg overflow-hidden border"
      style={{ borderColor: colors.BORDER, backgroundColor: colors.BG_TERTIARY }}
    >
      {values.map((item) => {
        const isSelected = item.value === selectedValue;
        return (
          <button
            key={item.value}
            onClick={() => onValueChange(item.value)}
            className="flex-1 py-2 px-3 text-sm font-medium transition-colors"
            style={{
              backgroundColor: isSelected ? colors.PRIMARY : 'transparent',
              color: isSelected ? colors.TEXT_INVERSE : colors.TEXT_PRIMARY,
            }}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
