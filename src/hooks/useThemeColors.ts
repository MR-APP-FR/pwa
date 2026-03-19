'use client';

import { useThemeStore } from '../stores/themeStore';
import { LIGHT_THEME, DARK_THEME } from '../constants/colors';
import type { ThemeMode } from '../types/theme.types';
import { useEffect, useState } from 'react';

export function useThemeColors() {
  const { mode, setMode } = useThemeStore();
  const [systemDark, setSystemDark] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    setSystemDark(mq.matches);
    const handler = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const resolvedMode: 'light' | 'dark' =
    mode === 'system' ? (systemDark ? 'dark' : 'light') : mode;

  const colors = resolvedMode === 'dark' ? DARK_THEME : LIGHT_THEME;

  return { colors, mode, resolvedMode, setMode: setMode as (m: ThemeMode) => void };
}
