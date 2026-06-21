import {
  Ban,
  CircleDollarSign,
  CreditCard,
  HandMetal,
  LockKeyhole,
  Phone,
  Sparkles,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react';

export type TrainingThemeId =
  | 'opening'
  | 'revenue'
  | 'issues'
  | 'forbidden'
  | 'payments'
  | 'cleaning'
  | 'closing'
  | 'double';

export interface TrainingTheme {
  id: TrainingThemeId;
  icon: LucideIcon;
  color: 'ACCENT_RED' | 'ACCENT_YELLOW' | 'ACCENT_ORANGE' | 'ACCENT_PINK' | 'ACCENT_PURPLE' | 'ACCENT_BLUE';
  muted:
    | 'ACCENT_RED_MUTED'
    | 'ACCENT_YELLOW_MUTED'
    | 'ACCENT_ORANGE_MUTED'
    | 'ACCENT_PINK_MUTED'
    | 'ACCENT_PURPLE_MUTED'
    | 'ACCENT_BLUE_MUTED';
  labelKey: string;
  colSpan?: 1 | 2;
}

/** Thèmes vidéo formation — ordre et disposition alignés sur la maquette legacy. */
export const TRAINING_THEMES: TrainingTheme[] = [
  {
    id: 'opening',
    icon: Phone,
    color: 'ACCENT_RED',
    muted: 'ACCENT_RED_MUTED',
    labelKey: 'screens.training.themes.opening',
  },
  {
    id: 'revenue',
    icon: CircleDollarSign,
    color: 'ACCENT_YELLOW',
    muted: 'ACCENT_YELLOW_MUTED',
    labelKey: 'screens.training.themes.revenue',
  },
  {
    id: 'issues',
    icon: TriangleAlert,
    color: 'ACCENT_YELLOW',
    muted: 'ACCENT_YELLOW_MUTED',
    labelKey: 'screens.training.themes.issues',
  },
  {
    id: 'forbidden',
    icon: Ban,
    color: 'ACCENT_RED',
    muted: 'ACCENT_RED_MUTED',
    labelKey: 'screens.training.themes.forbidden',
  },
  {
    id: 'payments',
    icon: CreditCard,
    color: 'ACCENT_ORANGE',
    muted: 'ACCENT_ORANGE_MUTED',
    labelKey: 'screens.training.themes.payments',
  },
  {
    id: 'cleaning',
    icon: Sparkles,
    color: 'ACCENT_PINK',
    muted: 'ACCENT_PINK_MUTED',
    labelKey: 'screens.training.themes.cleaning',
  },
  {
    id: 'closing',
    icon: LockKeyhole,
    color: 'ACCENT_PURPLE',
    muted: 'ACCENT_PURPLE_MUTED',
    labelKey: 'screens.training.themes.closing',
  },
  {
    id: 'double',
    icon: HandMetal,
    color: 'ACCENT_BLUE',
    muted: 'ACCENT_BLUE_MUTED',
    labelKey: 'screens.training.themes.double',
    colSpan: 2,
  },
];
