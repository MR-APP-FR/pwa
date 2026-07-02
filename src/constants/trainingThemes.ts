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
  emoji: string;
  labelKey: string;
  colSpan?: 1 | 2;
}

/** Thèmes vidéo formation — ordre et disposition alignés sur la maquette legacy. */
export const TRAINING_THEMES: TrainingTheme[] = [
  {
    id: 'opening',
    emoji: '☎️',
    labelKey: 'screens.training.themes.opening',
  },
  {
    id: 'revenue',
    emoji: '💰',
    labelKey: 'screens.training.themes.revenue',
  },
  {
    id: 'issues',
    emoji: '⚠️',
    labelKey: 'screens.training.themes.issues',
  },
  {
    id: 'forbidden',
    emoji: '⛔️',
    labelKey: 'screens.training.themes.forbidden',
  },
  {
    id: 'payments',
    emoji: '💳',
    labelKey: 'screens.training.themes.payments',
  },
  {
    id: 'cleaning',
    emoji: '🧼',
    labelKey: 'screens.training.themes.cleaning',
  },
  {
    id: 'closing',
    emoji: '🔐',
    labelKey: 'screens.training.themes.closing',
  },
  {
    id: 'double',
    emoji: '🙌🏻',
    labelKey: 'screens.training.themes.double',
  },
];
