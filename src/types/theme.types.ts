export interface ThemeColors extends Record<string, string> {
  PRIMARY: string;
  PRIMARY_LIGHT: string;
  DANGER: string;
  SUCCESS: string;
  SUCCESS_STRONG: string;
  DANGER_STRONG: string;
  TAB_ACTIVE: string;
  TAB_INACTIVE: string;
  TAB_BAR_BG: string;
  TAB_BAR_BORDER: string;
  HEADER_BG: string;
  HEADER_TEXT: string;
  BG_PRIMARY: string;
  BG_SECONDARY: string;
  BG_TERTIARY: string;
  TEXT_PRIMARY: string;
  TEXT_SECONDARY: string;
  TEXT_INVERSE: string;
  SETTINGS_SECTION_BG: string;
  SETTINGS_SEPARATOR: string;
  SETTINGS_ICON_BG: string;
  BORDER: string;
}

export type ThemeMode = 'system' | 'light' | 'dark';
