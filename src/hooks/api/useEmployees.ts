'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '../../lib/supabase/client';

/**
 * Liste minimale d'employé pour le profile switcher (GRE-87).
 * Lit `public.user` (RLS autorise tous les authentifiés en SELECT — et même
 * anon en mode démo car le client est anon-key only).
 */
export interface EmployeeOption {
  id: number;
  login: string;
  email: string;
  fullname: string | null;
  actif: boolean;
}

const QUERY_KEY = ['employees', 'demo-switcher'] as const;

export function useEmployees() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: async (): Promise<EmployeeOption[]> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('user')
        .select('id, login, email, fullname, actif')
        .eq('actif', true)
        .order('fullname', { ascending: true, nullsFirst: false });

      if (error) {
        throw new Error(`useEmployees failed: ${error.message}`);
      }

      return (data ?? []) as EmployeeOption[];
    },
    staleTime: 5 * 60 * 1000,
  });
}
