'use server';

import type { SupabaseClient } from '@supabase/supabase-js';
import { requireEmployeeSession } from '../../lib/auth/employee';
import { isMaintenanceRole } from '../../lib/staff-role';
import { parisWallClockToDate, toIsoDateString, toParisLocalDate } from '../../lib/parisTime';
import { formatSiteName } from '../../lib/formatSiteName';
import {
  MEDIA_BUCKET,
  OPEN_INTERVENTION_STATUSES,
  canComplete,
  canHold,
  canPause,
  canResume,
  canSchedule,
  canStart,
  normalizeMaintenanceStatus,
} from '../../lib/interventions/fsm';
import type {
  InterventionEvent,
  InterventionHoldReason,
  InterventionMedia,
  InterventionPart,
  InterventionPartStatus,
  InterventionVisit,
  MaintenanceIntervention,
  MaintenanceInterventionDetail,
  MaintenancePartListItem,
} from '../../database/types';

type SessionOk = Awaited<ReturnType<typeof requireEmployeeSession>> & { ok: true };

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

async function insertEvent(
  supabase: SupabaseClient,
  opts: {
    interventionId: number;
    actorUserId: number;
    kind: string;
    body?: string | null;
    visitId?: number | null;
    payload?: Record<string, unknown>;
  },
) {
  await supabase.from('intervention_event').insert({
    intervention_id: opts.interventionId,
    actor_user_id: opts.actorUserId,
    kind: opts.kind,
    body: opts.body ?? null,
    visit_id: opts.visitId ?? null,
    payload: opts.payload ?? {},
  });
}

async function loadTicket(
  supabase: SupabaseClient,
  id: number,
): Promise<Record<string, unknown> | null> {
  const { data, error } = await supabase
    .from('intervention')
    .select(
      'id, site_id, description, pannes_autre, sujet_ids, status, urgent, assignee_user_id, scheduled_at, completed_at, resolution_notes, hold_reason, active_visit_id, reported_at, updated_at',
    )
    .eq('id', id)
    .maybeSingle();
  if (error || !data) return null;
  return data as Record<string, unknown>;
}

async function enrichRows(
  supabase: SupabaseClient,
  rawRows: Record<string, unknown>[],
): Promise<MaintenanceIntervention[]> {
  if (rawRows.length === 0) return [];

  const siteIds = [...new Set(rawRows.map((r) => Number(r.site_id)))];
  const sujetIdSet = new Set<number>();
  for (const r of rawRows) {
    for (const sid of (r.sujet_ids as number[] | null) ?? []) sujetIdSet.add(sid);
  }

  const [sitesRes, sujetsRes, groupsRes] = await Promise.all([
    supabase.from('site').select('id, name, group_id').in('id', siteIds),
    sujetIdSet.size > 0
      ? supabase.from('sujets').select('id, name, site_id').in('id', [...sujetIdSet])
      : Promise.resolve({ data: [] as { id: number; name: string; site_id: number }[], error: null }),
    supabase.from('groupe').select('id, name').order('id'),
  ]);

  if (sitesRes.error) throw new Error('Erreur chargement sites');
  if ('error' in sujetsRes && sujetsRes.error) throw new Error('Erreur chargement sujets');
  if (groupsRes.error) throw new Error('Erreur chargement zones');

  const siteById = new Map<number, { name: string; group_id: number | null }>();
  for (const s of sitesRes.data ?? []) {
    siteById.set(s.id, {
      name: formatSiteName(s.name),
      group_id: s.group_id == null ? null : Number(s.group_id),
    });
  }
  const groupNameById = new Map<number, string>();
  for (const g of groupsRes.data ?? []) {
    groupNameById.set(g.id, g.name);
  }
  const sujetById = new Map<number, { name: string; site_id: number }>();
  for (const sj of sujetsRes.data ?? []) {
    sujetById.set(sj.id, { name: sj.name, site_id: sj.site_id });
  }

  return rawRows.map((r) => {
    const siteId = Number(r.site_id);
    const site = siteById.get(siteId);
    const groupId = site?.group_id ?? null;
    const sujetIds = (r.sujet_ids as number[] | null) ?? [];
    const sujetNames: string[] = [];
    for (const sid of sujetIds) {
      const sj = sujetById.get(sid);
      if (sj) sujetNames.push(sj.name);
    }
    const hold = r.hold_reason as string | null;
    return {
      id: Number(r.id),
      site_id: siteId,
      site_name: site?.name ?? `Site #${siteId}`,
      group_id: groupId,
      group_name: groupId != null ? (groupNameById.get(groupId) ?? `Zone #${groupId}`) : 'Sans zone',
      description: String(r.description ?? ''),
      pannes_autre: (r.pannes_autre as string | null) ?? null,
      sujet_ids: sujetIds,
      sujet_names: sujetNames,
      status: normalizeMaintenanceStatus(String(r.status)),
      urgent: Boolean(r.urgent),
      assignee_user_id: r.assignee_user_id == null ? null : Number(r.assignee_user_id),
      scheduled_at: (r.scheduled_at as string | null) ?? null,
      completed_at: (r.completed_at as string | null) ?? null,
      resolution_notes: (r.resolution_notes as string | null) ?? null,
      hold_reason:
        hold === 'pieces' || hold === 'retour' || hold === 'autre'
          ? hold
          : null,
      active_visit_id: r.active_visit_id == null ? null : Number(r.active_visit_id),
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
      'id, site_id, description, pannes_autre, sujet_ids, status, urgent, assignee_user_id, scheduled_at, completed_at, resolution_notes, hold_reason, active_visit_id, reported_at, updated_at',
    )
    .in('status', OPEN_INTERVENTION_STATUSES)
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

export async function listSitesForMaintenance(): Promise<
  { ok: true; sites: { id: number; name: string }[] } | { ok: false; error: string }
> {
  const session = await requireMaintenanceSession();
  if (!session.ok) return session;

  const { data, error } = await session.supabase
    .from('site')
    .select('id, name, statut')
    .order('name');

  if (error) return { ok: false, error: error.message };

  const sites = (data ?? [])
    .filter((s) => String(s.statut ?? '').toLowerCase() === 'actif' || s.statut == null)
    .map((s) => ({ id: s.id, name: formatSiteName(s.name) }));

  return { ok: true, sites };
}

export async function getMaintenanceInterventionDetail(
  id: number,
): Promise<{ ok: true; detail: MaintenanceInterventionDetail } | { ok: false; error: string }> {
  const session = await requireMaintenanceSession();
  if (!session.ok) return session;

  const raw = await loadTicket(session.supabase, id);
  if (!raw) return { ok: false, error: 'Ticket introuvable.' };

  const [tickets, eventsRes, partsRes, mediaRes, visitRes] = await Promise.all([
    enrichRows(session.supabase, [raw]),
    session.supabase
      .from('intervention_event')
      .select('id, intervention_id, visit_id, actor_user_id, kind, body, payload, created_at')
      .eq('intervention_id', id)
      .order('created_at', { ascending: false }),
    session.supabase
      .from('intervention_part')
      .select(
        'id, intervention_id, label, status, ordered_at, received_at, ref, note, created_by, created_at, updated_at',
      )
      .eq('intervention_id', id)
      .order('created_at', { ascending: true }),
    session.supabase
      .from('intervention_media')
      .select(
        'id, intervention_id, visit_id, event_id, kind, storage_path, mime, created_by, created_at',
      )
      .eq('intervention_id', id)
      .order('created_at', { ascending: false }),
    raw.active_visit_id
      ? session.supabase
          .from('intervention_visit')
          .select(
            'id, intervention_id, tech_user_id, scheduled_date, started_at, ended_at, outcome, pause_seconds, note',
          )
          .eq('id', Number(raw.active_visit_id))
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (eventsRes.error || partsRes.error || mediaRes.error) {
    return { ok: false, error: 'Impossible de charger le détail.' };
  }

  const media: InterventionMedia[] = [];
  for (const m of mediaRes.data ?? []) {
    const { data: signed } = await session.supabase.storage
      .from(MEDIA_BUCKET)
      .createSignedUrl(m.storage_path, 3600);
    media.push({
      id: Number(m.id),
      intervention_id: Number(m.intervention_id),
      visit_id: m.visit_id == null ? null : Number(m.visit_id),
      event_id: m.event_id == null ? null : Number(m.event_id),
      kind: m.kind === 'video' ? 'video' : 'photo',
      storage_path: m.storage_path,
      mime: m.mime ?? null,
      created_by: m.created_by == null ? null : Number(m.created_by),
      created_at: String(m.created_at),
      signed_url: signed?.signedUrl ?? null,
    });
  }

  const events: InterventionEvent[] = (eventsRes.data ?? []).map((e) => ({
    id: Number(e.id),
    intervention_id: Number(e.intervention_id),
    visit_id: e.visit_id == null ? null : Number(e.visit_id),
    actor_user_id: e.actor_user_id == null ? null : Number(e.actor_user_id),
    kind: e.kind as InterventionEvent['kind'],
    body: e.body ?? null,
    payload: (e.payload as Record<string, unknown>) ?? {},
    created_at: String(e.created_at),
  }));

  const parts: InterventionPart[] = (partsRes.data ?? []).map((p) => ({
    id: Number(p.id),
    intervention_id: Number(p.intervention_id),
    label: p.label,
    status: p.status as InterventionPartStatus,
    ordered_at: p.ordered_at ?? null,
    received_at: p.received_at ?? null,
    ref: p.ref ?? null,
    note: p.note ?? null,
    created_by: p.created_by == null ? null : Number(p.created_by),
    created_at: String(p.created_at),
    updated_at: String(p.updated_at),
  }));

  let activeVisit: InterventionVisit | null = null;
  if (visitRes.data) {
    const v = visitRes.data;
    activeVisit = {
      id: Number(v.id),
      intervention_id: Number(v.intervention_id),
      tech_user_id: Number(v.tech_user_id),
      scheduled_date: v.scheduled_date ?? null,
      started_at: String(v.started_at),
      ended_at: v.ended_at ?? null,
      outcome: (v.outcome as InterventionVisit['outcome']) ?? null,
      pause_seconds: Number(v.pause_seconds ?? 0),
      note: v.note ?? null,
    };
  }

  return {
    ok: true,
    detail: {
      ticket: tickets[0],
      events,
      parts,
      media,
      activeVisit,
    },
  };
}

export async function createMaintenanceIntervention(input: {
  siteId: number;
  description: string;
  urgent?: boolean;
  sujetIds?: number[];
}): Promise<{ ok: true; id: number } | { ok: false; error: string }> {
  const session = await requireMaintenanceSession();
  if (!session.ok) return session;

  const text = input.description.trim();
  if (!text) return { ok: false, error: 'Décris le problème.' };
  if (!Number.isFinite(input.siteId) || input.siteId <= 0) {
    return { ok: false, error: 'Choisis un site.' };
  }

  const sujetIds = [...new Set((input.sujetIds ?? []).filter((x) => x > 0))];

  const { data, error } = await session.supabase
    .from('intervention')
    .insert({
      site_id: input.siteId,
      daily_info_id: null,
      reported_by: session.userId,
      description: text,
      sujet_ids: sujetIds,
      pannes_autre: text,
      urgent: Boolean(input.urgent),
      status: 'signalee',
      assignee_user_id: session.userId,
    })
    .select('id')
    .single();

  if (error || !data) {
    return { ok: false, error: `Création impossible : ${error?.message ?? 'erreur'}` };
  }

  await insertEvent(session.supabase, {
    interventionId: Number(data.id),
    actorUserId: session.userId,
    kind: 'created',
    body: text,
  });

  return { ok: true, id: Number(data.id) };
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

  const current = await loadTicket(session.supabase, id);
  if (!current) return { ok: false, error: 'Ticket introuvable.' };
  const status = normalizeMaintenanceStatus(String(current.status));
  if (!canSchedule(status) && status !== 'en_cours' && status !== 'en_pause') {
    return { ok: false, error: 'Ticket déjà clôturé.' };
  }
  if (status === 'en_cours' || status === 'en_pause') {
    return { ok: false, error: 'Mets en pause / termine la visite avant de reprogrammer.' };
  }

  const { error } = await session.supabase
    .from('intervention')
    .update({
      assignee_user_id: session.userId,
      scheduled_at: at.toISOString(),
      status: 'planifiee',
      completed_at: null,
      hold_reason: null,
    })
    .eq('id', id);

  if (error) return { ok: false, error: `Impossible de planifier : ${error.message}` };

  await insertEvent(session.supabase, {
    interventionId: id,
    actorUserId: session.userId,
    kind: note?.trim() ? 'rescheduled' : 'scheduled',
    body: note?.trim()
      ? `Planifié le ${dateIso} - ${note.trim()}`
      : `Planifié le ${dateIso}`,
    payload: { date: dateIso },
  });

  return { ok: true };
}

export async function rescheduleMaintenanceIntervention(
  id: number,
  dateIso: string,
  note: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const text = note.trim();
  if (!text) return { ok: false, error: 'Indique pourquoi tu reportes.' };
  return scheduleMaintenanceIntervention(id, dateIso, text);
}

async function endOpenSegment(
  supabase: SupabaseClient,
  visitId: number,
): Promise<number> {
  const { data: seg } = await supabase
    .from('intervention_time_segment')
    .select('id, started_at')
    .eq('visit_id', visitId)
    .is('ended_at', null)
    .maybeSingle();

  if (!seg) return 0;
  const ended = new Date();
  const started = new Date(seg.started_at);
  const seconds = Math.max(0, Math.floor((ended.getTime() - started.getTime()) / 1000));
  await supabase
    .from('intervention_time_segment')
    .update({ ended_at: ended.toISOString() })
    .eq('id', seg.id);
  return seconds;
}

export async function startMaintenanceIntervention(
  id: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await requireMaintenanceSession();
  if (!session.ok) return session;

  const current = await loadTicket(session.supabase, id);
  if (!current) return { ok: false, error: 'Ticket introuvable.' };
  const status = normalizeMaintenanceStatus(String(current.status));
  if (!canStart(status)) {
    return { ok: false, error: 'Impossible de démarrer ce ticket.' };
  }

  const { data: otherActive } = await session.supabase
    .from('intervention')
    .select('id')
    .eq('assignee_user_id', session.userId)
    .in('status', ['en_cours', 'en_pause'])
    .neq('id', id)
    .limit(1);

  if ((otherActive ?? []).length > 0) {
    return {
      ok: false,
      error: `Termine ou mets en pause le ticket #${otherActive![0].id} d'abord.`,
    };
  }

  const todayIso = toIsoDateString(toParisLocalDate());
  const { data: visit, error: visitErr } = await session.supabase
    .from('intervention_visit')
    .insert({
      intervention_id: id,
      tech_user_id: session.userId,
      scheduled_date: todayIso,
      started_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (visitErr || !visit) {
    return { ok: false, error: `Visite impossible : ${visitErr?.message ?? 'erreur'}` };
  }

  await session.supabase.from('intervention_time_segment').insert({
    visit_id: visit.id,
    started_at: new Date().toISOString(),
  });

  const { error } = await session.supabase
    .from('intervention')
    .update({
      status: 'en_cours',
      assignee_user_id: session.userId,
      active_visit_id: visit.id,
      completed_at: null,
      hold_reason: null,
      scheduled_at: current.scheduled_at ?? parisWallClockToDate(todayIso, { hour: 12, minute: 0 })?.toISOString(),
    })
    .eq('id', id);

  if (error) return { ok: false, error: error.message };

  await insertEvent(session.supabase, {
    interventionId: id,
    actorUserId: session.userId,
    kind: 'started',
    body: 'Intervention démarrée',
    visitId: Number(visit.id),
  });

  return { ok: true };
}

export async function pauseMaintenanceIntervention(
  id: number,
  note?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await requireMaintenanceSession();
  if (!session.ok) return session;

  const current = await loadTicket(session.supabase, id);
  if (!current) return { ok: false, error: 'Ticket introuvable.' };
  const status = normalizeMaintenanceStatus(String(current.status));
  if (!canPause(status)) return { ok: false, error: 'Pas de chrono actif.' };

  const visitId = current.active_visit_id == null ? null : Number(current.active_visit_id);
  if (!visitId) return { ok: false, error: 'Visite introuvable.' };

  const worked = await endOpenSegment(session.supabase, visitId);
  if (worked > 0) {
    const { data: visit } = await session.supabase
      .from('intervention_visit')
      .select('pause_seconds')
      .eq('id', visitId)
      .maybeSingle();
    // pause_seconds tracks paused time separately; work time is in segments
    void visit;
  }

  const { error } = await session.supabase
    .from('intervention')
    .update({ status: 'en_pause' })
    .eq('id', id);

  if (error) return { ok: false, error: error.message };

  await insertEvent(session.supabase, {
    interventionId: id,
    actorUserId: session.userId,
    kind: 'paused',
    body: note?.trim() || 'Pause',
    visitId,
  });

  return { ok: true };
}

export async function resumeMaintenanceIntervention(
  id: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await requireMaintenanceSession();
  if (!session.ok) return session;

  const current = await loadTicket(session.supabase, id);
  if (!current) return { ok: false, error: 'Ticket introuvable.' };
  const status = normalizeMaintenanceStatus(String(current.status));
  if (!canResume(status)) return { ok: false, error: 'Le ticket n’est pas en pause.' };

  const visitId = current.active_visit_id == null ? null : Number(current.active_visit_id);
  if (!visitId) return { ok: false, error: 'Visite introuvable.' };

  await session.supabase.from('intervention_time_segment').insert({
    visit_id: visitId,
    started_at: new Date().toISOString(),
  });

  const { error } = await session.supabase
    .from('intervention')
    .update({ status: 'en_cours' })
    .eq('id', id);

  if (error) return { ok: false, error: error.message };

  await insertEvent(session.supabase, {
    interventionId: id,
    actorUserId: session.userId,
    kind: 'resumed',
    body: 'Reprise',
    visitId,
  });

  return { ok: true };
}

async function closeActiveVisit(
  session: SessionOk,
  current: Record<string, unknown>,
  outcome: 'termine' | 'a_replanifier' | 'attente_pieces',
  note: string | null,
) {
  const visitId = current.active_visit_id == null ? null : Number(current.active_visit_id);
  if (!visitId) return null;
  await endOpenSegment(session.supabase, visitId);
  await session.supabase
    .from('intervention_visit')
    .update({
      ended_at: new Date().toISOString(),
      outcome,
      note,
    })
    .eq('id', visitId);
  return visitId;
}

export async function holdMaintenanceIntervention(
  id: number,
  reason: InterventionHoldReason,
  note: string,
  rescheduleDateIso?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await requireMaintenanceSession();
  if (!session.ok) return session;

  const text = note.trim();
  if (!text) return { ok: false, error: 'Ajoute une note.' };

  const current = await loadTicket(session.supabase, id);
  if (!current) return { ok: false, error: 'Ticket introuvable.' };
  const status = normalizeMaintenanceStatus(String(current.status));
  if (!canHold(status) && status !== 'en_attente') {
    return { ok: false, error: 'Impossible de mettre en attente.' };
  }

  const visitId = await closeActiveVisit(
    session,
    current,
    reason === 'pieces' ? 'attente_pieces' : 'a_replanifier',
    text,
  );

  let scheduled_at: string | null = (current.scheduled_at as string | null) ?? null;
  let nextStatus: 'en_attente' | 'planifiee' = 'en_attente';
  if (rescheduleDateIso) {
    const at = parisWallClockToDate(rescheduleDateIso, { hour: 12, minute: 0 });
    if (!at) return { ok: false, error: 'Date invalide.' };
    scheduled_at = at.toISOString();
    nextStatus = 'planifiee';
  }

  const { error } = await session.supabase
    .from('intervention')
    .update({
      status: nextStatus,
      hold_reason: reason,
      active_visit_id: null,
      assignee_user_id: session.userId,
      scheduled_at,
      completed_at: null,
    })
    .eq('id', id);

  if (error) return { ok: false, error: error.message };

  await insertEvent(session.supabase, {
    interventionId: id,
    actorUserId: session.userId,
    kind: 'hold',
    body: text,
    visitId,
    payload: { reason, date: rescheduleDateIso ?? null },
  });

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

  const current = await loadTicket(session.supabase, id);
  if (!current) return { ok: false, error: 'Ticket introuvable.' };
  const status = normalizeMaintenanceStatus(String(current.status));
  if (!canComplete(status) && status !== 'signalee') {
    return { ok: false, error: 'Ticket déjà clôturé.' };
  }

  const visitId = await closeActiveVisit(session, current, 'termine', text);

  const prevNotes = (current.resolution_notes as string | null)?.trim();
  const stamp = toIsoDateString(toParisLocalDate());
  const resolution = prevNotes
    ? `${prevNotes}\n[${stamp}] Réparé - ${text}`
    : `[${stamp}] Réparé - ${text}`;

  const { error } = await session.supabase
    .from('intervention')
    .update({
      assignee_user_id: session.userId,
      status: 'cloturee',
      completed_at: new Date().toISOString(),
      resolution_notes: resolution,
      active_visit_id: null,
      hold_reason: null,
    })
    .eq('id', id);

  if (error) return { ok: false, error: `Impossible de clôturer : ${error.message}` };

  await insertEvent(session.supabase, {
    interventionId: id,
    actorUserId: session.userId,
    kind: 'completed',
    body: text,
    visitId,
  });

  return { ok: true };
}

export async function addMaintenanceComment(
  id: number,
  body: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await requireMaintenanceSession();
  if (!session.ok) return session;
  const text = body.trim();
  if (!text) return { ok: false, error: 'Commentaire vide.' };

  const current = await loadTicket(session.supabase, id);
  if (!current) return { ok: false, error: 'Ticket introuvable.' };

  await insertEvent(session.supabase, {
    interventionId: id,
    actorUserId: session.userId,
    kind: 'comment',
    body: text,
    visitId: current.active_visit_id == null ? null : Number(current.active_visit_id),
  });
  return { ok: true };
}

export async function listMaintenanceParts(): Promise<
  { ok: true; parts: MaintenancePartListItem[] } | { ok: false; error: string }
> {
  const session = await requireMaintenanceSession();
  if (!session.ok) return session;

  const { data: tickets, error: ticketsErr } = await session.supabase
    .from('intervention')
    .select('id, site_id, description, pannes_autre, status, urgent')
    .in('status', OPEN_INTERVENTION_STATUSES);

  if (ticketsErr) {
    return { ok: false, error: `Impossible de charger les tickets : ${ticketsErr.message}` };
  }

  const openTickets = tickets ?? [];
  if (openTickets.length === 0) return { ok: true, parts: [] };

  const ticketIds = openTickets.map((t) => Number(t.id));
  const ticketById = new Map(openTickets.map((t) => [Number(t.id), t]));

  const { data: parts, error: partsErr } = await session.supabase
    .from('intervention_part')
    .select(
      'id, intervention_id, label, status, ordered_at, received_at, ref, note, created_by, created_at, updated_at',
    )
    .in('intervention_id', ticketIds)
    .order('status', { ascending: true })
    .order('updated_at', { ascending: false });

  if (partsErr) {
    return { ok: false, error: `Impossible de charger les pièces : ${partsErr.message}` };
  }

  const siteIds = [...new Set(openTickets.map((t) => Number(t.site_id)))];
  const [sitesRes, groupsRes] = await Promise.all([
    supabaseSites(session.supabase, siteIds),
    session.supabase.from('groupe').select('id, name').order('id'),
  ]);

  if (!sitesRes.ok) return { ok: false, error: sitesRes.error };
  if (groupsRes.error) return { ok: false, error: 'Erreur chargement zones' };

  const groupNameById = new Map<number, string>();
  for (const g of groupsRes.data ?? []) groupNameById.set(g.id, g.name);

  const statusOrder: Record<string, number> = {
    a_commander: 0,
    commande: 1,
    recu: 2,
  };

  const rows: MaintenancePartListItem[] = (parts ?? []).map((p) => {
    const ticket = ticketById.get(Number(p.intervention_id));
    const siteId = ticket ? Number(ticket.site_id) : 0;
    const site = sitesRes.byId.get(siteId);
    const groupId = site?.group_id ?? null;
    const other = (ticket?.pannes_autre as string | null)?.trim();
    const desc = String(ticket?.description ?? '').trim();
    return {
      id: Number(p.id),
      intervention_id: Number(p.intervention_id),
      label: String(p.label),
      status: (p.status as InterventionPartStatus) ?? 'a_commander',
      ordered_at: (p.ordered_at as string | null) ?? null,
      received_at: (p.received_at as string | null) ?? null,
      ref: (p.ref as string | null) ?? null,
      note: (p.note as string | null) ?? null,
      created_by: p.created_by == null ? null : Number(p.created_by),
      created_at: String(p.created_at),
      updated_at: String(p.updated_at),
      site_id: siteId,
      site_name: site?.name ?? `Site #${siteId}`,
      group_name:
        groupId != null ? (groupNameById.get(groupId) ?? `Zone #${groupId}`) : 'Sans zone',
      ticket_label: other || desc || `Ticket #${p.intervention_id}`,
      ticket_status: normalizeMaintenanceStatus(String(ticket?.status ?? 'signalee')),
      ticket_urgent: Boolean(ticket?.urgent),
    };
  });

  rows.sort((a, b) => {
    const so = (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9);
    if (so !== 0) return so;
    return a.site_name.localeCompare(b.site_name, 'fr');
  });

  return { ok: true, parts: rows };
}

async function supabaseSites(
  supabase: SupabaseClient,
  siteIds: number[],
): Promise<
  | { ok: true; byId: Map<number, { name: string; group_id: number | null }> }
  | { ok: false; error: string }
> {
  if (siteIds.length === 0) return { ok: true, byId: new Map() };
  const { data, error } = await supabase
    .from('site')
    .select('id, name, group_id')
    .in('id', siteIds);
  if (error) return { ok: false, error: 'Erreur chargement sites' };
  const byId = new Map<number, { name: string; group_id: number | null }>();
  for (const s of data ?? []) {
    byId.set(s.id, {
      name: formatSiteName(s.name),
      group_id: s.group_id == null ? null : Number(s.group_id),
    });
  }
  return { ok: true, byId };
}

export async function addMaintenancePart(
  id: number,
  label: string,
  status: InterventionPartStatus = 'a_commander',
  ref?: string,
): Promise<{ ok: true; partId: number } | { ok: false; error: string }> {
  const session = await requireMaintenanceSession();
  if (!session.ok) return session;
  const text = label.trim();
  if (!text) return { ok: false, error: 'Nom de pièce requis.' };

  const now = new Date().toISOString();
  const { data, error } = await session.supabase
    .from('intervention_part')
    .insert({
      intervention_id: id,
      label: text,
      status,
      ref: ref?.trim() || null,
      created_by: session.userId,
      ordered_at: status === 'commande' || status === 'recu' ? now : null,
      received_at: status === 'recu' ? now : null,
    })
    .select('id')
    .single();

  if (error || !data) return { ok: false, error: error?.message ?? 'Erreur pièce' };

  await insertEvent(session.supabase, {
    interventionId: id,
    actorUserId: session.userId,
    kind: 'part',
    body: `${text} (${status})`,
    payload: { partId: data.id, status },
  });

  return { ok: true, partId: Number(data.id) };
}

export async function updateMaintenancePartStatus(
  partId: number,
  status: InterventionPartStatus,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await requireMaintenanceSession();
  if (!session.ok) return session;

  const { data: part, error: readErr } = await session.supabase
    .from('intervention_part')
    .select('id, intervention_id, label, status')
    .eq('id', partId)
    .maybeSingle();

  if (readErr || !part) return { ok: false, error: 'Pièce introuvable.' };

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    status,
    updated_at: now,
  };
  if (status === 'commande') patch.ordered_at = now;
  if (status === 'recu') {
    patch.received_at = now;
    if (!part) patch.ordered_at = now;
  }

  const { error } = await session.supabase
    .from('intervention_part')
    .update(patch)
    .eq('id', partId);

  if (error) return { ok: false, error: error.message };

  await insertEvent(session.supabase, {
    interventionId: Number(part.intervention_id),
    actorUserId: session.userId,
    kind: 'part',
    body: `${part.label} → ${status}`,
    payload: { partId, status },
  });

  return { ok: true };
}

export async function uploadMaintenanceMedia(
  id: number,
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await requireMaintenanceSession();
  if (!session.ok) return session;

  const file = formData.get('file');
  if (!(file instanceof File)) return { ok: false, error: 'Fichier manquant.' };

  const current = await loadTicket(session.supabase, id);
  if (!current) return { ok: false, error: 'Ticket introuvable.' };

  const mime = file.type || 'application/octet-stream';
  const isVideo = mime.startsWith('video/');
  const isPhoto = mime.startsWith('image/');
  if (!isVideo && !isPhoto) {
    return { ok: false, error: 'Photo ou vidéo uniquement.' };
  }
  if (isVideo && file.size > 40 * 1024 * 1024) {
    return { ok: false, error: 'Vidéo trop lourde (max 40 Mo).' };
  }
  if (isPhoto && file.size > 12 * 1024 * 1024) {
    return { ok: false, error: 'Photo trop lourde (max 12 Mo).' };
  }

  const ext =
    file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') ||
    (isVideo ? 'mp4' : 'jpg');
  const path = `interventions/${id}/${session.userId}/${Date.now()}.${ext}`;

  const bytes = new Uint8Array(await file.arrayBuffer());
  const { error: upErr } = await session.supabase.storage
    .from(MEDIA_BUCKET)
    .upload(path, bytes, { contentType: mime, upsert: false });

  if (upErr) return { ok: false, error: `Upload : ${upErr.message}` };

  const { data: eventRow } = await session.supabase
    .from('intervention_event')
    .insert({
      intervention_id: id,
      actor_user_id: session.userId,
      kind: 'media',
      body: isVideo ? 'Vidéo ajoutée' : 'Photo ajoutée',
      visit_id: current.active_visit_id == null ? null : Number(current.active_visit_id),
      payload: { path, mime },
    })
    .select('id')
    .single();

  const { error: mediaErr } = await session.supabase.from('intervention_media').insert({
    intervention_id: id,
    visit_id: current.active_visit_id == null ? null : Number(current.active_visit_id),
    event_id: eventRow?.id ?? null,
    kind: isVideo ? 'video' : 'photo',
    storage_path: path,
    mime,
    created_by: session.userId,
  });

  if (mediaErr) return { ok: false, error: mediaErr.message };
  return { ok: true };
}
