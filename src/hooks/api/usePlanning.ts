'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '../../lib/supabase/client';
import { useCurrentUser } from './useCurrentUser';
import { useAppDate } from '../useAppDate';
import type { PlanningColleague, PlanningSiteDetails, PlanningWithColleague } from '../../database/types';
import { formatSiteName } from '../../lib/formatSiteName';

interface UsePlanningParams {
  year: number;
  month: number;
}

interface PlanningRowDb {
  id: number;
  year: number;
  month: number;
  day: number;
  site_id: number;
  user_id: number | null;
  double_id: number | null;
  user_confirmed: boolean | null;
  double_confirmed: boolean | null;
  closed: boolean | null;
  site:
    | {
        name: string | null;
        adresse: string | null;
        metro: string | null;
        indication: string | null;
        latitude: number | null;
        longitude: number | null;
      }
    | {
        name: string | null;
        adresse: string | null;
        metro: string | null;
        indication: string | null;
        latitude: number | null;
        longitude: number | null;
      }[]
    | null;
}

interface UserColleagueRow {
  id: number;
  fullname: string | null;
  user_info:
    | {
        first_name: string | null;
        last_name: string | null;
        telephone: string | null;
        couleur: string | null;
      }
    | {
        first_name: string | null;
        last_name: string | null;
        telephone: string | null;
        couleur: string | null;
      }[]
    | null;
}

const PLANNING_SELECT =
  'id, year, month, day, site_id, user_id, double_id, user_confirmed, double_confirmed, closed, site:site_id(name, adresse, metro, indication, latitude, longitude)';

function planningMonthTriplet(year: number, month: number): { year: number; month: number }[] {
  const prev = month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
  const next = month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
  return [prev, { year, month }, next];
}

/** Mois couvrant [from, to] inclus (dates locales). */
function monthsCoveringRange(from: Date, to: Date): { year: number; month: number }[] {
  const out: { year: number; month: number }[] = [];
  const cursor = new Date(from.getFullYear(), from.getMonth(), 1);
  const end = new Date(to.getFullYear(), to.getMonth(), 1);
  while (cursor <= end) {
    out.push({ year: cursor.getFullYear(), month: cursor.getMonth() + 1 });
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return out;
}

function normalizeSite(site: PlanningRowDb['site']): { name: string; details: PlanningSiteDetails | null } {
  if (!site) return { name: '', details: null };
  const s = Array.isArray(site) ? site[0] : site;
  if (!s) return { name: '', details: null };
  return {
    name: formatSiteName(s.name ?? ''),
    details: {
      adresse: s.adresse ?? null,
      metro: s.metro ?? null,
      indication: s.indication ?? null,
      latitude: s.latitude ?? null,
      longitude: s.longitude ?? null,
    },
  };
}

function mapColleagueFromUserRow(row: UserColleagueRow): PlanningColleague {
  const ui = Array.isArray(row.user_info) ? row.user_info[0] : row.user_info;
  return {
    id: row.id,
    fullname: row.fullname ?? '',
    first_name: ui?.first_name ?? '',
    last_name: ui?.last_name ?? undefined,
    telephone: ui?.telephone ?? null,
    couleur: ui?.couleur ?? null,
  };
}

function toPlanningWithColleague(
  row: PlanningRowDb,
  employeeId: number,
  colleagues: Map<number, PlanningColleague>,
): PlanningWithColleague {
  const isPrincipal = row.user_id === employeeId;
  const role: 'principal' | 'double' = isPrincipal ? 'principal' : 'double';
  const colleagueUserId = isPrincipal ? row.double_id : row.user_id;
  const colleague =
    colleagueUserId != null ? (colleagues.get(colleagueUserId) ?? null) : null;

  const { name: site_name, details: site_details } = normalizeSite(row.site);

  return {
    id: row.id,
    year: row.year,
    month: row.month,
    day: row.day,
    site_id: row.site_id,
    site_name,
    site_details,
    user_id: row.user_id ?? 0,
    double_id: row.double_id,
    user_confirmed: row.user_confirmed ?? false,
    double_confirmed: row.double_confirmed,
    closed: row.closed === true,
    role,
    colleague,
  };
}

async function fetchColleagues(
  userId: number,
  rows: PlanningRowDb[],
): Promise<Map<number, PlanningColleague>> {
  const colleagueIds = new Set<number>();
  for (const row of rows) {
    const isPrincipal = row.user_id === userId;
    const otherId = isPrincipal ? row.double_id : row.user_id;
    if (otherId != null) colleagueIds.add(otherId);
  }

  const colleagues = new Map<number, PlanningColleague>();
  if (colleagueIds.size === 0) return colleagues;

  const supabase = createClient();
  const { data: userRows, error: usersError } = await supabase
    .from('user')
    .select('id, fullname, user_info(first_name, last_name, telephone, couleur)')
    .in('id', [...colleagueIds]);

  if (usersError) {
    throw new Error(`usePlanning colleagues fetch failed: ${usersError.message}`);
  }

  for (const u of (userRows ?? []) as UserColleagueRow[]) {
    colleagues.set(u.id, mapColleagueFromUserRow(u));
  }
  return colleagues;
}

async function fetchPlanningMonths(
  userId: number,
  months: { year: number; month: number }[],
): Promise<PlanningWithColleague[]> {
  const supabase = createClient();

  const monthResults = await Promise.all(
    months.map(async ({ year: y, month: m }) => {
      const { data, error } = await supabase
        .from('planning')
        .select(PLANNING_SELECT)
        .or(`user_id.eq.${userId},double_id.eq.${userId}`)
        .eq('year', y)
        .eq('month', m);

      if (error) {
        throw new Error(`usePlanning fetch failed: ${error.message}`);
      }
      return (data ?? []) as PlanningRowDb[];
    }),
  );

  const byId = new Map<number, PlanningRowDb>();
  for (const rows of monthResults) {
    for (const row of rows) {
      byId.set(row.id, row);
    }
  }
  const merged = [...byId.values()];
  const colleagues = await fetchColleagues(userId, merged);
  return merged.map((row) => toPlanningWithColleague(row, userId, colleagues));
}

async function fetchPlanningForUser(
  userId: number,
  year: number,
  month: number,
): Promise<PlanningWithColleague[]> {
  return fetchPlanningMonths(userId, planningMonthTriplet(year, month));
}

async function fetchPlanningById(
  userId: number,
  planningId: number,
): Promise<PlanningWithColleague | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('planning')
    .select(PLANNING_SELECT)
    .eq('id', planningId)
    .or(`user_id.eq.${userId},double_id.eq.${userId}`)
    .maybeSingle();

  if (error) {
    throw new Error(`usePlanningById fetch failed: ${error.message}`);
  }
  if (!data) return null;

  const row = data as PlanningRowDb;
  const colleagues = await fetchColleagues(userId, [row]);
  return toPlanningWithColleague(row, userId, colleagues);
}

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function planningRowDate(row: PlanningWithColleague): Date {
  return new Date(row.year, row.month - 1, row.day);
}

/**
 * Planning semaine UI (mois courant ±1 pour les semaines à cheval).
 */
export function usePlanning(params: UsePlanningParams) {
  const { data: currentUser } = useCurrentUser();
  const employeeId = currentUser?.user.id ?? null;

  return useQuery({
    queryKey: ['planning', employeeId, params.year, params.month],
    enabled: employeeId !== null,
    queryFn: async () => {
      if (employeeId === null) {
        return { planning: [] as PlanningWithColleague[] };
      }
      const planning = await fetchPlanningForUser(employeeId, params.year, params.month);
      return { planning };
    },
    staleTime: 60 * 1000,
  });
}

/**
 * Une mission par id planning (ouverture / fermeture / fiche mission).
 */
export function usePlanningById(planningId: number | null) {
  const { data: currentUser } = useCurrentUser();
  const employeeId = currentUser?.user.id ?? null;
  const id = planningId != null && Number.isFinite(planningId) && planningId > 0 ? planningId : null;

  return useQuery({
    queryKey: ['planning-by-id', employeeId, id],
    enabled: employeeId !== null && id !== null,
    queryFn: async () => {
      if (employeeId === null || id === null) return null;
      return fetchPlanningById(employeeId, id);
    },
    staleTime: 60 * 1000,
  });
}

/**
 * Accueil / « prochaine mission » : fenêtre [today, today+daysAhead] sans mois précédent.
 */
export function useUpcomingPlanning(daysAhead = 60) {
  const { data: currentUser } = useCurrentUser();
  const employeeId = currentUser?.user.id ?? null;
  const { today: appToday } = useAppDate();
  const today = startOfLocalDay(appToday);
  const to = new Date(today);
  to.setDate(to.getDate() + daysAhead);
  const fromKey = `${today.getFullYear()}-${today.getMonth() + 1}-${today.getDate()}`;
  const toKey = `${to.getFullYear()}-${to.getMonth() + 1}-${to.getDate()}`;

  return useQuery({
    queryKey: ['planning-upcoming', employeeId, fromKey, toKey],
    enabled: employeeId !== null,
    queryFn: async () => {
      if (employeeId === null) {
        return { planning: [] as PlanningWithColleague[] };
      }
      const from = new Date(
        Number(fromKey.split('-')[0]),
        Number(fromKey.split('-')[1]) - 1,
        Number(fromKey.split('-')[2]),
      );
      const until = new Date(
        Number(toKey.split('-')[0]),
        Number(toKey.split('-')[1]) - 1,
        Number(toKey.split('-')[2]),
      );
      const months = monthsCoveringRange(from, until);
      const all = await fetchPlanningMonths(employeeId, months);
      const fromTs = from.getTime();
      const toTs = until.getTime();
      const planning = all.filter((row) => {
        const ts = planningRowDate(row).getTime();
        return ts >= fromTs && ts <= toTs;
      });
      return { planning };
    },
    staleTime: 60 * 1000,
  });
}
