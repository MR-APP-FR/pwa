'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '../../lib/supabase/client';

/**
 * Liste minimale d'employé pour le profile switcher (GRE-87).
 * Via RPC `get_demo_employees` (SECURITY DEFINER) — même pattern client
 * que useSites / usePlanning / useCurrentUser.
 */
export interface EmployeeOption {
  id: number;
  login: string;
  email: string;
  fullname: string | null;
  actif: boolean;
}

const QUERY_KEY = ['employees', 'demo-switcher'] as const;

async function fetchDemoEmployees(): Promise<EmployeeOption[]> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('get_demo_employees');

  if (error) {
    throw new Error(`useEmployees failed: ${error.message}`);
  }

  return (data ?? []) as EmployeeOption[];
}

export function useEmployees() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: fetchDemoEmployees,
    staleTime: 5 * 60 * 1000,
    retry: 2,
  });
}
