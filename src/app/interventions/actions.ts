'use server';

import type { SupabaseClient } from '@supabase/supabase-js';
import { requireEmployeeSession } from '../../lib/auth/employee';
import { isMaintenanceRole } from '../../lib/staff-role';
import { parisWallClockToDate, toIsoDateString, toParisLocalDate } from '../../lib/parisTime';
import { formatSiteName } from '../../lib/formatSiteName';
import type {
  MaintenanceIntervention,
  MaintenanceInterventionStatus,
} from '../../database/types';

const OPEN_STATUSES: MaintenanceInterventionStatus[] = ['signalee', 'planifiee'];

function normalizeStatus(raw: string): MaintenanceInterventionStatus {
  if (raw === 'planifiee') return 'planifiee';
  if (raw === 'cloturee') return 'cloturee';
  return 'signalee';
}

function appendNote(existing: string | null, line: string): string {
  const stamp = toIsoDateString(toParisLocalDate());
  const entry = `[${stamp}] ${line.trim()}`;
  const prev = existing?.trim();
  if (!prev) return entry;
  return `${prev}\n${entry}`;
}

async function requireMaintenanceSession() {
  const session = await requireEmployeeSession();
  if (!session.ok) return session;

  const { data: userRow, error } = await session.supabase
    .from('user')
    .select('id, role')
    .eq('id', session.userId)
    .maybeSingle();

  if (error || !userRow) {
    return { ok: false as const, error: 'Impossible de vérifier le rôle.' };
  }
  if (!isMaintenanceRole(userRow.role)) {
    return { ok: false as const, error: 'Accès réservé à la maintenance.' };
  }

  return session;
}

async function enrichRows(
  supabase: SupabaseClient,
  rawRows: Record<string, unknown>[],
): Promise<MaintenanceIntervention[]> {
  if (rawRows.length === 0) return [];

  const siteIds = [...new Set(rawRows.map((r) => Number(r.site_id)))];
  const sujetIdSet = new Set<number>();
  for (const r of rawRows) {
    const ids = (r.sujet_ids as number[] | null) ?? [];
    for (const sid of ids) sujetIdSet.add(sid);
  }

  const [sitesRes, sujetsRes] = await Promise.all([
    supabase.from('site').select('id, name').in('id', siteIds),
    sujetIdSet.size > 0
      ? supabase.from('sujets').select('id, name, site_id').in('id', [...sujetIdSet])
      : Promise.resolve({ data: [] as { id: number; name: string; site_id: number }[], error: null }),
  ]);

  if (sitesRes.error) throw new Error('Erreur chargement sites');
  if ('error' in sujetsRes && sujetsRes.error) throw new Error('Erreur chargement sujets');

  const siteNameById = new Map<number, string>();
  for (const s of sitesRes.data ?? []) {
    siteNameById.set(s.id, formatSiteName(s.name));
  }
  const sujetById = new Map<number, { name: string; site_id: number }>();
  for (const sj of sujetsRes.data ?? []) {
    sujetById.set(sj.id, { name: sj.name, site_id: sj.site_id });
  }

  return rawRows.map((r) => {
    const siteId = Number(r.site_id);
    const sujetIds = (r.sujet_ids as number[] | null) ?? [];
    const sujetNames: string[] = [];
    for (const sid of sujetIds) {
      const sj = sujetById.get(sid);
      if (sj) sujetNames.push(sj.name);
    }
    return {
      id: Number(r.id),
      site_id: siteId,
      site_name: siteNameById.get(siteId) ?? `Site #${siteId}`,
      description: String(r.description ?? ''),
      pannes_autre: (r.pannes_autre as string | null) ?? null,
      sujet_ids: sujetIds,
      sujet_names: sujetNames,
      status: normalizeStatus(String(r.status)),
      urgent: Boolean(r.urgent),
      assignee_user_id: r.assignee_user_id == null ? null : Number(r.assignee_user_id),
      scheduled_at: (r.scheduled_at as string | null) ?? null,
      completed_at: (r.completed_at as string | null) ?? null,
      resolution_notes: (r.resolution_notes as string | null) ?? null,
      reported_at: String(r.reported_at),
      updated_at: String(r.updated_at),
    };
  });
}

export async function listMaintenanceInterventions(): Promise<
  { ok: true; tickets: MaintenanceIntervention[] } | { ok: false; error: string }
> {
  const session = await requireMaintenanceSession();
  if (!session.ok) return session;

  const { data, error } = await session.supabase
    .from('intervention')
    .select(
      'id, site_id, description, pannes_autre, sujet_ids, status, urgent, assignee_user_id, scheduled_at, completed_at, resolution_notes, reported_at, updated_at',
    )
    .in('status', OPEN_STATUSES)
    .order('urgent', { ascending: false })
    .order('scheduled_at', { ascending: true, nullsFirst: false })
    .order('id', { ascending: true });

  if (error) {
    return { ok: false, error: `Impossible de charger les tickets : ${error.message}` };
  }

  try {
    const tickets = await enrichRows(session.supabase, (data ?? []) as Record<string, unknown>[]);
    return { ok: true, tickets };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur enrichissement' };
  }
}

export async function scheduleMaintenanceIntervention(
  id: number,
  dateIso: string,
  note?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await requireMaintenanceSession();
  if (!session.ok) return session;

  const at = parisWallClockToDate(dateIso, { hour: 12, minute: 0 });
  if (!at) return { ok: false, error: 'Date invalide.' };

  const { data: current, error: readErr } = await session.supabase
    .from('intervention')
    .select('id, resolution_notes, status')
    .eq('id', id)
    .maybeSingle();

  if (readErr || !current) {
    return { ok: false, error: 'Ticket introuvable.' };
  }
  if (normalizeStatus(String(current.status)) === 'cloturee') {
    return { ok: false, error: 'Ticket déjà clôturé.' };
  }

  const noteLine = note?.trim()
    ? `Planifié le ${dateIso} - ${note.trim()}`
    : `Planifié le ${dateIso}`;

  const { error } = await session.supabase
    .from('intervention')
    .update({
      assignee_user_id: session.userId,
      scheduled_at: at.toISOString(),
      status: 'planifiee',
      completed_at: null,
      resolution_notes: appendNote(current.resolution_notes, noteLine),
    })
    .eq('id', id);

  if (error) {
    return { ok: false, error: `Impossible de planifier : ${error.message}` };
  }
  return { ok: true };
}

export async function completeMaintenanceIntervention(
  id: number,
  note: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await requireMaintenanceSession();
  if (!session.ok) return session;

  const text = note.trim();
  if (!text) return { ok: false, error: 'Indique une note de résolution.' };

  const { data: current, error: readErr } = await session.supabase
    .from('intervention')
    .select('id, resolution_notes, status')
    .eq('id', id)
    .maybeSingle();

  if (readErr || !current) {
    return { ok: false, error: 'Ticket introuvable.' };
  }
  if (normalizeStatus(String(current.status)) === 'cloturee') {
    return { ok: false, error: 'Ticket déjà clôturé.' };
  }

  const { error } = await session.supabase
    .from('intervention')
    .update({
      assignee_user_id: session.userId,
      status: 'cloturee',
      completed_at: new Date().toISOString(),
      resolution_notes: appendNote(current.resolution_notes, `Réparé - ${text}`),
    })
    .eq('id', id);

  if (error) {
    return { ok: false, error: `Impossible de clôturer : ${error.message}` };
  }
  return { ok: true };
}

export async function rescheduleMaintenanceIntervention(
  id: number,
  dateIso: string,
  note: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await requireMaintenanceSession();
  if (!session.ok) return session;

  const at = parisWallClockToDate(dateIso, { hour: 12, minute: 0 });
  if (!at) return { ok: false, error: 'Date invalide.' };

  const text = note.trim();
  if (!text) return { ok: false, error: 'Indique pourquoi tu reportes.' };

  const { data: current, error: readErr } = await session.supabase
    .from('intervention')
    .select('id, resolution_notes, status')
    .eq('id', id)
    .maybeSingle();

  if (readErr || !current) {
    return { ok: false, error: 'Ticket introuvable.' };
  }
  if (normalizeStatus(String(current.status)) === 'cloturee') {
    return { ok: false, error: 'Ticket déjà clôturé.' };
  }

  const { error } = await session.supabase
    .from('intervention')
    .update({
      assignee_user_id: session.userId,
      scheduled_at: at.toISOString(),
      status: 'planifiee',
      completed_at: null,
      resolution_notes: appendNote(current.resolution_notes, `Reporté au ${dateIso} - ${text}`),
    })
    .eq('id', id);

  if (error) {
    return { ok: false, error: `Impossible de reporter : ${error.message}` };
  }
  return { ok: true };
}
