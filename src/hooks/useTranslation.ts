'use client';

import { useLanguageStore } from '../stores/languageStore';
import i18n from '../i18n/i18n';
import type { Language } from '../types/i18n.types';

export function useTranslation() {
  const { language, setLanguage } = useLanguageStore();
  i18n.locale = language;

  const t = (key: string, options?: Record<string, string>) => {
    return i18n.t(key, options);
  };

  return { t, language, setLanguage: setLanguage as (l: Language) => void };
}
