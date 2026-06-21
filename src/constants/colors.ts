import type { ThemeColors } from '../types/theme.types';
import { SHADOW } from './design';

/**
 * Couleurs du logo « Les Manèges » — teintes légèrement adoucies pour l'UI.
 * L'accent principal est le bleu (lettre L), pas le rouge.
 */
export const LOGO = {
  blue: '#292D82',
  blueMuted: '#E8F1FA',
  orange: '#F7941D',
  orangeMuted: '#FEF4E8',
  red: '#E04A47',
  redMuted: '#FDECEB',
  green: '#3DB54A',
  greenMuted: '#E8F7EA',
  purple: '#9B4DAD',
  purpleMuted: '#F3E8F6',
  yellow: '#E8B020',
  yellowMuted: '#FDF6E3',
  pink: '#D94F8C',
  pinkMuted: '#FCE8F2',
} as const;

export const NEUTRALS = {
  white: '#FFFFFF',
  bg: '#F7F6F4',
  bgSubtle: '#EFEEEB',
  border: '#E5E3DF',
  text: '#2C2825',
  textSecondary: '#6E6A66',
  textMuted: '#9C9894',
} as const;

const BRAND = {
  PRIMARY: LOGO.blue,
  PRIMARY_DARK: '#1E5090',
  PRIMARY_LIGHT: '#4A8FD4',
  PRIMARY_MUTED: LOGO.blueMuted,
  SECONDARY: LOGO.orange,
  SECONDARY_LIGHT: '#FBB040',
  SECONDARY_MUTED: LOGO.orangeMuted,
  TERTIARY: NEUTRALS.text,
  TERTIARY_MUTED: NEUTRALS.textSecondary,
  DANGER: LOGO.red,
  SUCCESS: LOGO.green,
  SUCCESS_STRONG: LOGO.green,
  DANGER_STRONG: LOGO.red,
  ACCENT_BLUE: LOGO.blue,
  ACCENT_BLUE_MUTED: LOGO.blueMuted,
  ACCENT_ORANGE: LOGO.orange,
  ACCENT_ORANGE_MUTED: LOGO.orangeMuted,
  ACCENT_RED: LOGO.red,
  ACCENT_RED_MUTED: LOGO.redMuted,
  ACCENT_GREEN: LOGO.green,
  ACCENT_GREEN_MUTED: LOGO.greenMuted,
  ACCENT_PURPLE: LOGO.purple,
  ACCENT_PURPLE_MUTED: LOGO.purpleMuted,
  ACCENT_YELLOW: LOGO.yellow,
  ACCENT_YELLOW_MUTED: LOGO.yellowMuted,
  ACCENT_PINK: LOGO.pink,
  ACCENT_PINK_MUTED: LOGO.pinkMuted,
} as const;

export const LIGHT_THEME: ThemeColors = {
  ...BRAND,
  TAB_ACTIVE: LOGO.blue,
  TAB_INACTIVE: NEUTRALS.textMuted,
  TAB_BAR_BG: NEUTRALS.white,
  TAB_BAR_BORDER: NEUTRALS.border,
  HEADER_BG: NEUTRALS.bg,
  HEADER_TEXT: NEUTRALS.text,
  BG_PRIMARY: NEUTRALS.white,
  BG_SECONDARY: NEUTRALS.bg,
  BG_TERTIARY: NEUTRALS.bgSubtle,
  TEXT_PRIMARY: NEUTRALS.text,
  TEXT_SECONDARY: NEUTRALS.textSecondary,
  TEXT_MUTED: NEUTRALS.textMuted,
  TEXT_INVERSE: NEUTRALS.white,
  SETTINGS_SECTION_BG: NEUTRALS.white,
  SETTINGS_SEPARATOR: NEUTRALS.border,
  SETTINGS_ICON_BG: LOGO.blueMuted,
  BORDER: NEUTRALS.border,
  CARD_SHADOW: SHADOW.card,
};

/** Fond de la carte « affectation du jour » */
export const HOME_ASSIGNMENT_BG = '#292D82';

/** Fond des icônes des boutons d'accueil */
export const HOME_BUTTON_ICON_BG: Record<string, string> = {
  'sunny-outline': '#ED7723',
  'moon-outline': '#E1313C',
  'calendar-outline': '#1F9ED1',
  'hand-left-outline': '#37AB38',
  'messages-outline': '#991C86',
  'video-outline': '#FAB12F',
  'map-pin-outline': '#E71380',
};

/** Couleurs tournantes pour les cartes planning */
export const PLANNING_DAY_ACCENTS: (keyof typeof BRAND)[] = [
  'ACCENT_BLUE',
  'ACCENT_ORANGE',
  'ACCENT_YELLOW',
  'ACCENT_GREEN',
  'ACCENT_PURPLE',
  'ACCENT_PINK',
  'ACCENT_RED',
];
