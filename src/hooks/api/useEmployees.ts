'use client';

import { useQuery } from '@tanstack/react-query';
import { fetchDemoEmployees } from '../../app/profil/actions';

/**
 * Liste minimale d'employé pour le profile switcher (GRE-87).
 * Chargée via server action (service-role, RPC ou requête anon).
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
    queryFn: fetchDemoEmployees,
    staleTime: 5 * 60 * 1000,
    retry: 2,
  });
}
