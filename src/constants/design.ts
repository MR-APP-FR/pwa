/** Système d'espacement — multiples de 4 px */
export const SPACE = {
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
} as const;

/** Rayons uniformisés */
export const RADIUS = {
  xs: 6,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  full: 9999,
} as const;

/** Ombre unique pour toutes les cartes */
export const SHADOW = {
  card: '0 2px 8px rgba(44, 40, 37, 0.06)',
  cardHover: '0 4px 16px rgba(44, 40, 37, 0.08)',
} as const;

/** Hiérarchie typographique */
export const TYPO = {
  fontDisplay: "'Sora', sans-serif",
  fontBody: "'Inter', sans-serif",
  titleXl: { size: 24, weight: 700, lineHeight: 1.2 },
  titleLg: { size: 20, weight: 700, lineHeight: 1.25 },
  titleMd: { size: 16, weight: 600, lineHeight: 1.3 },
  body: { size: 15, weight: 400, lineHeight: 1.5 },
  bodySm: { size: 14, weight: 400, lineHeight: 1.45 },
  caption: { size: 11, weight: 600, lineHeight: 1.3, letterSpacing: '0.06em' },
} as const;

/** Cible tactile minimale (accessibilité) */
export const TOUCH_TARGET = 44;
