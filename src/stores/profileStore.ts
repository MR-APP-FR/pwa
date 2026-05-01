import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Cf. GRE-87. Stocke en localStorage l'id de l'employé sélectionné dans le
 * profile switcher de mode démo (auth réelle différée — voir GRE-88, GRE-90).
 *
 * Quand l'auth réelle sera livrée, ce store sera supprimé et `useCurrentUser`
 * (GRE-89) basculera sur la session Supabase.
 */
interface ProfileState {
  selectedUserId: number | null;
  setSelectedUserId: (id: number) => void;
  clear: () => void;
}

export const useProfileStore = create<ProfileState>()(
  persist(
    (set) => ({
      selectedUserId: null,
      setSelectedUserId: (id) => set({ selectedUserId: id }),
      clear: () => set({ selectedUserId: null }),
    }),
    { name: 'pwa-demo-profile' },
  ),
);
