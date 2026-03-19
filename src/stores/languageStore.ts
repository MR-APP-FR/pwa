import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Language } from '../types/i18n.types';

interface LanguageState {
  language: Language;
  setLanguage: (language: Language) => void;
}

export const useLanguageStore = create<LanguageState>()(
  persist(
    (set) => ({
      language: 'fr',
      setLanguage: (language) => set({ language }),
    }),
    { name: 'language-storage' }
  )
);
