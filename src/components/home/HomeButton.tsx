'use client';

import { useThemeColors } from '../../hooks/useThemeColors';
import {
  Sun,
  Moon,
  Calendar,
  Hand,
  Settings,
  AlertCircle,
  MessagesSquare,
  CirclePlay,
  type LucideIcon,
} from 'lucide-react';

const ICON_MAP: Record<string, LucideIcon> = {
  'sunny-outline': Sun,
  'moon-outline': Moon,
  'calendar-outline': Calendar,
  'hand-left-outline': Hand,
  'settings-outline': Settings,
  'alert-circle-outline': AlertCircle,
  'messages-outline': MessagesSquare,
  'video-outline': CirclePlay,
};

interface HomeButtonProps {
  icon: string;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}

export function HomeButton({ icon, label, onPress, disabled }: HomeButtonProps) {
  const { colors } = useThemeColors();
  const IconComponent = ICON_MAP[icon] ?? Sun;

  return (
    <button
      onClick={onPress}
      disabled={disabled}
      className="flex flex-col items-center justify-center gap-3 rounded-2xl border p-5 transition-opacity active:opacity-70"
      style={{
        backgroundColor: colors.SETTINGS_SECTION_BG,
        borderColor: colors.BORDER,
        opacity: disabled ? 0.4 : 1,
        width: 'calc(50% - 6px)',
        minHeight: 124,
      }}
    >
      <div
        className="w-12 h-12 rounded-full flex items-center justify-center"
        style={{ backgroundColor: colors.PRIMARY + '15' }}
      >
        <IconComponent size={24} color={colors.PRIMARY} />
      </div>
      <span
        className="text-base font-medium text-center leading-snug"
        style={{ color: colors.TEXT_PRIMARY }}
      >
        {label}
      </span>
    </button>
  );
}
