import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface DemoState {
  /** ISO date string (YYYY-MM-DD) overriding today, or null to use real date. */
  overrideDateIso: string | null;
  setOverrideDateIso: (iso: string | null) => void;
}

export const useDemoStore = create<DemoState>()(
  persist(
    (set) => ({
      overrideDateIso: null,
      setOverrideDateIso: (iso) => set({ overrideDateIso: iso }),
    }),
    { name: 'pwa-demo-date' },
  ),
);
