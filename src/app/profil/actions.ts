'use server';

import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '../../lib/supabase/server';
import { createAdminClient } from '../../lib/supabase/admin';
import type { EmployeeOption } from '../../hooks/api/useEmployees';

function filterActiveEmployees(rows: EmployeeOption[]): EmployeeOption[] {
  return rows.filter((u) => u.actif !== false);
}

async function queryEmployeesTable(client: SupabaseClient): Promise<EmployeeOption[]> {
  const { data, error } = await client
    .from('user')
    .select('id, login, email, fullname, actif')
    .or('actif.eq.true,actif.is.null')
    .order('fullname', { ascending: true, nullsFirst: false });

  if (error) {
    throw new Error(`fetchDemoEmployees failed: ${error.message}`);
  }

  return filterActiveEmployees((data ?? []) as EmployeeOption[]);
}

/**
 * Liste des employés pour le profile switcher démo (GRE-87).
 * Ordre de fallback : service-role → RPC `get_demo_employees` → requête anon.
 */
export async function fetchDemoEmployees(): Promise<EmployeeOption[]> {
  const admin = createAdminClient();
  if (admin) {
    try {
      const rows = await queryEmployeesTable(admin);
      if (rows.length > 0) return rows;
    } catch {
      // Fallback ci-dessous
    }
  }

  const supabase = await createClient();

  const rpc = await supabase.rpc('get_demo_employees');
  if (!rpc.error && Array.isArray(rpc.data) && rpc.data.length > 0) {
    return rpc.data as EmployeeOption[];
  }

  return queryEmployeesTable(supabase);
}
