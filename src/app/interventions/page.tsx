'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '../../components/layout/PageHeader';
import { useThemeColors } from '../../hooks/useThemeColors';
import { useTranslation } from '../../hooks/useTranslation';
import { useCurrentUser } from '../../hooks/api/useCurrentUser';
import { useMaintenanceInterventions } from '../../hooks/api/useMaintenanceInterventions';
import { useAppDate } from '../../hooks/useAppDate';
import { isMaintenanceRole } from '../../lib/staff-role';
import { maintenanceTicketText } from '../../lib/interventions/labels';
import {
  EVENT_KIND_LABELS,
  INTERVENTION_STATUS_LABELS,
  PART_STATUS_LABELS,
  canComplete,
  canHold,
  canPause,
  canResume,
  canStart,
} from '../../lib/interventions/fsm';
import { isBrowserOffline } from '../../lib/offline';
import { parseIsoDateAsLocalDate, toIsoDateString, toParisLocalDate } from '../../lib/parisTime';
import { RADIUS } from '../../constants/design';
import type {
  InterventionHoldReason,
  InterventionPartStatus,
  MaintenanceIntervention,
  MaintenanceInterventionDetail,
} from '../../database/types';
import {
  addMaintenanceComment,
  addMaintenancePart,
  completeMaintenanceIntervention,
  createMaintenanceIntervention,
  getMaintenanceInterventionDetail,
  holdMaintenanceIntervention,
  listSitesForMaintenance,
  pauseMaintenanceIntervention,
  rescheduleMaintenanceIntervention,
  resumeMaintenanceIntervention,
  scheduleMaintenanceIntervention,
  startMaintenanceIntervention,
  updateMaintenancePartStatus,
  uploadMaintenanceMedia,
} from './actions';

type Tab = 'today' | 'week' | 'backlog';

function parisDateFromScheduledAt(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return toIsoDateString(toParisLocalDate(d));
}

function addDaysIso(iso: string, days: number): string {
  const d = parseIsoDateAsLocalDate(iso);
  d.setDate(d.getDate() + days);
  return toIsoDateString(d);
}

function mondayOf(iso: string): string {
  const d = parseIsoDateAsLocalDate(iso);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return toIsoDateString(d);
}

function statusTone(status: MaintenanceIntervention['status'], primary: string): string {
  if (status === 'en_cours') return '#16a34a';
  if (status === 'en_pause') return '#ca8a04';
  if (status === 'en_attente') return '#d97706';
  if (status === 'planifiee') return primary;
  if (status === 'cloturee') return '#6b7280';
  return '#ea580c';
}

export default function InterventionsPage() {
  const { t } = useTranslation();
  const { colors } = useThemeColors();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { today } = useAppDate();
  const todayIso = toIsoDateString(today);

  const { data: currentUser, isLoading: userLoading } = useCurrentUser();
  const isMaintenance = isMaintenanceRole(currentUser?.user.role);
  const { data: tickets, isLoading, error, refetch } = useMaintenanceInterventions(isMaintenance);

  const [tab, setTab] = useState<Tab>('today');
  const [weekStart, setWeekStart] = useState(() => mondayOf(todayIso));
  const [selectedDay, setSelectedDay] = useState(todayIso);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [detail, setDetail] = useState<MaintenanceInterventionDetail | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);

  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDaysIso(weekStart, i)),
    [weekStart],
  );

  const grouped = useMemo(() => {
    const list = tickets ?? [];
    const todayList: MaintenanceIntervention[] = [];
    const backlog: MaintenanceIntervention[] = [];
    const byDay = new Map<string, MaintenanceIntervention[]>();

    for (const ticket of list) {
      const day = parisDateFromScheduledAt(ticket.scheduled_at);
      if (ticket.status === 'en_cours' || ticket.status === 'en_pause') {
        todayList.push(ticket);
        continue;
      }
      if (!day) {
        backlog.push(ticket);
        continue;
      }
      const arr = byDay.get(day) ?? [];
      arr.push(ticket);
      byDay.set(day, arr);
      if (day === todayIso || day < todayIso) todayList.push(ticket);
    }

    return { todayList, backlog, byDay };
  }, [tickets, todayIso]);

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ['maintenanceInterventions'] });
    void refetch();
  }

  function openDetail(id: number) {
    setFormError(null);
    setDetailId(id);
    setDetail(null);
    startTransition(async () => {
      const res = await getMaintenanceInterventionDetail(id);
      if (!res.ok) {
        setFormError(res.error);
        return;
      }
      setDetail(res.detail);
    });
  }

  function refreshDetail() {
    if (detailId == null) return;
    startTransition(async () => {
      const res = await getMaintenanceInterventionDetail(detailId);
      if (res.ok) setDetail(res.detail);
      invalidate();
    });
  }

  function closeDetail() {
    setDetailId(null);
    setDetail(null);
    setFormError(null);
  }

  if (userLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-sm text-gray-500">
        Chargement…
      </div>
    );
  }

  if (!isMaintenance) {
    return (
      <div className="p-4">
        <PageHeader title={t('interventions.title') || 'Interventions'} />
        <p className="mt-4 text-sm text-gray-600">Accès réservé à la maintenance.</p>
        <button type="button" className="mt-4 text-sm underline" onClick={() => router.push('/')}>
          Retour
        </button>
      </div>
    );
  }

  const listForTab =
    tab === 'today'
      ? grouped.todayList
      : tab === 'backlog'
        ? grouped.backlog
        : (grouped.byDay.get(selectedDay) ?? []);

  return (
    <div
      className="mx-auto flex min-h-[100dvh] w-full max-w-lg flex-col pb-[calc(4.5rem+env(safe-area-inset-bottom))]"
      style={{ background: colors.BG_PRIMARY }}
    >
      <div className="px-4 pt-3">
        <PageHeader title="Interventions" />
      </div>

      {error ? (
        <p className="px-4 text-sm text-red-600">{String(error)}</p>
      ) : null}

      <div className="mt-2 flex gap-1 px-3">
        {(
          [
            ['today', 'Aujourd’hui'],
            ['week', 'Semaine'],
            ['backlog', 'File'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className="flex-1 py-2 text-sm font-semibold"
            style={{
              borderRadius: RADIUS.md,
              background: tab === key ? colors.PRIMARY : 'transparent',
              color: tab === key ? '#fff' : colors.TEXT_PRIMARY,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'week' ? (
        <div className="mt-3 px-3">
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              className="px-2 text-sm"
              onClick={() => setWeekStart(addDaysIso(weekStart, -7))}
            >
              ←
            </button>
            <span className="text-xs font-medium text-gray-600">
              {weekDays[0].slice(5)} → {weekDays[6].slice(5)}
            </span>
            <button
              type="button"
              className="px-2 text-sm"
              onClick={() => setWeekStart(addDaysIso(weekStart, 7))}
            >
              →
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1">
            {weekDays.map((day) => {
              const count = grouped.byDay.get(day)?.length ?? 0;
              const isSel = day === selectedDay;
              const isToday = day === todayIso;
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => setSelectedDay(day)}
                  className="flex flex-col items-center py-2 text-[11px]"
                  style={{
                    borderRadius: RADIUS.md,
                    background: isSel ? colors.PRIMARY : isToday ? `${colors.PRIMARY}22` : '#f3f4f6',
                    color: isSel ? '#fff' : colors.TEXT_PRIMARY,
                  }}
                >
                  <span>
                    {parseIsoDateAsLocalDate(day).toLocaleDateString('fr-FR', { weekday: 'narrow' })}
                  </span>
                  <span className="font-semibold">{Number(day.slice(8))}</span>
                  {count > 0 ? <span className="text-[10px] opacity-80">{count}</span> : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="mt-3 flex-1 space-y-2 overflow-y-auto px-3">
        {isLoading ? (
          <p className="text-sm text-gray-500">Chargement…</p>
        ) : listForTab.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-500">Aucun ticket ici.</p>
        ) : (
          listForTab.map((ticket) => (
            <button
              key={ticket.id}
              type="button"
              onClick={() => openDetail(ticket.id)}
              className="w-full border border-black/5 bg-white p-3 text-left shadow-sm"
              style={{ borderRadius: RADIUS.lg }}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{ticket.site_name}</p>
                  <p className="mt-0.5 line-clamp-2 text-sm text-gray-700">
                    {maintenanceTicketText(ticket)}
                  </p>
                </div>
                {ticket.urgent ? (
                  <span className="shrink-0 rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700">
                    URGENT
                  </span>
                ) : null}
              </div>
              <div className="mt-2 flex items-center gap-2 text-[11px]">
                <span
                  className="rounded px-1.5 py-0.5 font-medium text-white"
                  style={{ background: statusTone(ticket.status, colors.PRIMARY) }}
                >
                  {INTERVENTION_STATUS_LABELS[ticket.status]}
                </span>
                {parisDateFromScheduledAt(ticket.scheduled_at) ? (
                  <span className="text-gray-500">
                    {parisDateFromScheduledAt(ticket.scheduled_at)}
                  </span>
                ) : null}
              </div>
            </button>
          ))
        )}
      </div>

      {/* Bottom nav + FAB */}
      <div
        className="fixed bottom-0 left-0 right-0 z-40 border-t border-black/10 bg-white/95 backdrop-blur"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="relative mx-auto flex max-w-lg items-center justify-around px-2 py-2">
          <button type="button" className="text-xs font-medium" onClick={() => setTab('today')}>
            Jour
          </button>
          <button type="button" className="text-xs font-medium" onClick={() => setTab('week')}>
            Semaine
          </button>
          <button
            type="button"
            aria-label="Créer"
            onClick={() => setCreateOpen(true)}
            className="absolute left-1/2 top-0 flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center text-2xl font-light text-white shadow-lg"
            style={{ borderRadius: 999, background: colors.PRIMARY }}
          >
            +
          </button>
          <button type="button" className="text-xs font-medium" onClick={() => setTab('backlog')}>
            File
          </button>
          <button type="button" className="text-xs font-medium" onClick={() => void refetch()}>
            Sync
          </button>
        </div>
      </div>

      {createOpen ? (
        <CreateSheet
          colors={colors}
          pending={pending}
          onClose={() => setCreateOpen(false)}
          onCreate={(payload) => {
            if (isBrowserOffline()) {
              setFormError(t('forms.common.errorOffline'));
              return;
            }
            startTransition(async () => {
              const res = await createMaintenanceIntervention(payload);
              if (!res.ok) {
                setFormError(res.error);
                return;
              }
              setCreateOpen(false);
              invalidate();
              openDetail(res.id);
            });
          }}
        />
      ) : null}

      {detailId != null ? (
        <TicketSheet
          colors={colors}
          pending={pending}
          formError={formError}
          detail={detail}
          todayIso={todayIso}
          onClose={closeDetail}
          onAction={(fn) => {
            if (isBrowserOffline()) {
              setFormError(t('forms.common.errorOffline'));
              return;
            }
            setFormError(null);
            startTransition(async () => {
              const res = await fn();
              if (res && !res.ok) {
                setFormError(res.error);
                return;
              }
              refreshDetail();
            });
          }}
        />
      ) : null}
    </div>
  );
}

function CreateSheet({
  colors,
  pending,
  onClose,
  onCreate,
}: {
  colors: { PRIMARY: string; TEXT_PRIMARY: string };
  pending: boolean;
  onClose: () => void;
  onCreate: (p: { siteId: number; description: string; urgent: boolean }) => void;
}) {
  const [sites, setSites] = useState<{ id: number; name: string }[]>([]);
  const [siteId, setSiteId] = useState<number>(0);
  const [description, setDescription] = useState('');
  const [urgent, setUrgent] = useState(false);

  useEffect(() => {
    void listSitesForMaintenance().then((res) => {
      if (res.ok) {
        setSites(res.sites);
        if (res.sites[0]) setSiteId(res.sites[0].id);
      }
    });
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40">
      <button type="button" className="flex-1" aria-label="Fermer" onClick={onClose} />
      <div
        className="max-h-[85dvh] overflow-y-auto bg-white p-4"
        style={{ borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl }}
      >
        <h2 className="text-lg font-semibold" style={{ color: colors.TEXT_PRIMARY }}>
          Nouveau ticket
        </h2>
        <label className="mt-3 block text-xs font-medium text-gray-600">Site</label>
        <select
          className="mt-1 w-full rounded-lg border border-gray-200 p-3 text-sm"
          value={siteId}
          onChange={(e) => setSiteId(Number(e.target.value))}
        >
          {sites.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <label className="mt-3 block text-xs font-medium text-gray-600">Problème</label>
        <textarea
          className="mt-1 w-full rounded-lg border border-gray-200 p-3 text-sm"
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Décris la panne…"
        />
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} />
          Urgent
        </label>
        <button
          type="button"
          disabled={pending || !siteId || !description.trim()}
          className="mt-4 w-full py-3 text-sm font-semibold text-white disabled:opacity-50"
          style={{ borderRadius: RADIUS.lg, background: colors.PRIMARY }}
          onClick={() => onCreate({ siteId, description, urgent })}
        >
          Créer
        </button>
      </div>
    </div>
  );
}

function TicketSheet({
  colors,
  pending,
  formError,
  detail,
  todayIso,
  onClose,
  onAction,
}: {
  colors: { PRIMARY: string; TEXT_PRIMARY: string };
  pending: boolean;
  formError: string | null;
  detail: MaintenanceInterventionDetail | null;
  todayIso: string;
  onClose: () => void;
  onAction: (fn: () => Promise<{ ok: true } | { ok: false; error: string } | void>) => void;
}) {
  const [note, setNote] = useState('');
  const [dateIso, setDateIso] = useState(todayIso);
  const [holdReason, setHoldReason] = useState<InterventionHoldReason>('pieces');
  const [partLabel, setPartLabel] = useState('');
  const [panel, setPanel] = useState<
    'none' | 'schedule' | 'complete' | 'hold' | 'comment' | 'part'
  >('none');
  const fileRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);

  const ticket = detail?.ticket;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/40">
      <button type="button" className="h-10 shrink-0" aria-label="Fermer" onClick={onClose} />
      <div
        className="flex min-h-0 flex-1 flex-col bg-white"
        style={{ borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl }}
      >
        {!ticket ? (
          <p className="p-6 text-sm text-gray-500">Chargement…</p>
        ) : (
          <>
            <div className="shrink-0 border-b border-gray-100 px-4 pb-3 pt-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-lg font-semibold">{ticket.site_name}</p>
                  <p className="mt-1 text-sm text-gray-700">{maintenanceTicketText(ticket)}</p>
                </div>
                <button type="button" className="text-sm text-gray-500" onClick={onClose}>
                  Fermer
                </button>
              </div>
              <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                <span
                  className="rounded px-1.5 py-0.5 font-medium text-white"
                  style={{ background: statusTone(ticket.status, colors.PRIMARY) }}
                >
                  {INTERVENTION_STATUS_LABELS[ticket.status]}
                </span>
                {ticket.urgent ? (
                  <span className="rounded bg-red-100 px-1.5 py-0.5 font-bold text-red-700">
                    URGENT
                  </span>
                ) : null}
                {ticket.hold_reason ? (
                  <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-800">
                    {ticket.hold_reason}
                  </span>
                ) : null}
              </div>
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-3">
              {formError ? <p className="text-sm text-red-600">{formError}</p> : null}

              {/* Primary actions */}
              <div className="grid grid-cols-2 gap-2">
                {canStart(ticket.status) ? (
                  <ActionBtn
                    label="Démarrer"
                    primary
                    colors={colors}
                    disabled={pending}
                    onClick={() => onAction(() => startMaintenanceIntervention(ticket.id))}
                  />
                ) : null}
                {canPause(ticket.status) ? (
                  <ActionBtn
                    label="Pause"
                    colors={colors}
                    disabled={pending}
                    onClick={() => onAction(() => pauseMaintenanceIntervention(ticket.id))}
                  />
                ) : null}
                {canResume(ticket.status) ? (
                  <ActionBtn
                    label="Reprendre"
                    primary
                    colors={colors}
                    disabled={pending}
                    onClick={() => onAction(() => resumeMaintenanceIntervention(ticket.id))}
                  />
                ) : null}
                {canComplete(ticket.status) || ticket.status === 'signalee' ? (
                  <ActionBtn
                    label="Terminer"
                    colors={colors}
                    disabled={pending}
                    onClick={() => setPanel('complete')}
                  />
                ) : null}
                <ActionBtn
                  label="Planifier"
                  colors={colors}
                  disabled={pending}
                  onClick={() => setPanel('schedule')}
                />
                {canHold(ticket.status) ? (
                  <ActionBtn
                    label="Attente / pièces"
                    colors={colors}
                    disabled={pending}
                    onClick={() => setPanel('hold')}
                  />
                ) : null}
                <ActionBtn
                  label="Commentaire"
                  colors={colors}
                  disabled={pending}
                  onClick={() => setPanel('comment')}
                />
                <ActionBtn
                  label="Pièce"
                  colors={colors}
                  disabled={pending}
                  onClick={() => setPanel('part')}
                />
                <ActionBtn
                  label="Photo"
                  colors={colors}
                  disabled={pending}
                  onClick={() => fileRef.current?.click()}
                />
                <ActionBtn
                  label="Vidéo"
                  colors={colors}
                  disabled={pending}
                  onClick={() => videoRef.current?.click()}
                />
              </div>

              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (!f) return;
                  const fd = new FormData();
                  fd.set('file', f);
                  onAction(() => uploadMaintenanceMedia(ticket.id, fd));
                }}
              />
              <input
                ref={videoRef}
                type="file"
                accept="video/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (!f) return;
                  const fd = new FormData();
                  fd.set('file', f);
                  onAction(() => uploadMaintenanceMedia(ticket.id, fd));
                }}
              />

              {panel !== 'none' ? (
                <div className="rounded-xl border border-gray-200 p-3">
                  {panel === 'schedule' ? (
                    <>
                      <label className="text-xs font-medium text-gray-600">Jour</label>
                      <input
                        type="date"
                        className="mt-1 w-full rounded-lg border p-2 text-sm"
                        value={dateIso}
                        onChange={(e) => setDateIso(e.target.value)}
                      />
                      <textarea
                        className="mt-2 w-full rounded-lg border p-2 text-sm"
                        rows={2}
                        placeholder="Note (optionnel / obligatoire si report)"
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                      />
                      <button
                        type="button"
                        disabled={pending}
                        className="mt-2 w-full py-2 text-sm font-semibold text-white"
                        style={{ borderRadius: RADIUS.md, background: colors.PRIMARY }}
                        onClick={() =>
                          onAction(async () => {
                            const res = note.trim()
                              ? await rescheduleMaintenanceIntervention(ticket.id, dateIso, note)
                              : await scheduleMaintenanceIntervention(ticket.id, dateIso);
                            if (res.ok) setPanel('none');
                            return res;
                          })
                        }
                      >
                        Enregistrer
                      </button>
                    </>
                  ) : null}
                  {panel === 'complete' ? (
                    <>
                      <textarea
                        className="w-full rounded-lg border p-2 text-sm"
                        rows={3}
                        placeholder="Ce qui a été fait…"
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                      />
                      <button
                        type="button"
                        disabled={pending || !note.trim()}
                        className="mt-2 w-full py-2 text-sm font-semibold text-white"
                        style={{ borderRadius: RADIUS.md, background: '#16a34a' }}
                        onClick={() =>
                          onAction(async () => {
                            const res = await completeMaintenanceIntervention(ticket.id, note);
                            if (res.ok) {
                              setPanel('none');
                              onClose();
                            }
                            return res;
                          })
                        }
                      >
                        Clôturer
                      </button>
                    </>
                  ) : null}
                  {panel === 'hold' ? (
                    <>
                      <select
                        className="w-full rounded-lg border p-2 text-sm"
                        value={holdReason}
                        onChange={(e) => setHoldReason(e.target.value as InterventionHoldReason)}
                      >
                        <option value="pieces">Attente pièces</option>
                        <option value="retour">Retour plus tard</option>
                        <option value="autre">Autre</option>
                      </select>
                      <input
                        type="date"
                        className="mt-2 w-full rounded-lg border p-2 text-sm"
                        value={dateIso}
                        onChange={(e) => setDateIso(e.target.value)}
                      />
                      <textarea
                        className="mt-2 w-full rounded-lg border p-2 text-sm"
                        rows={2}
                        placeholder="Détail…"
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                      />
                      <button
                        type="button"
                        disabled={pending || !note.trim()}
                        className="mt-2 w-full py-2 text-sm font-semibold text-white"
                        style={{ borderRadius: RADIUS.md, background: '#d97706' }}
                        onClick={() =>
                          onAction(async () => {
                            const res = await holdMaintenanceIntervention(
                              ticket.id,
                              holdReason,
                              note,
                              dateIso,
                            );
                            if (res.ok) setPanel('none');
                            return res;
                          })
                        }
                      >
                        Mettre en attente
                      </button>
                    </>
                  ) : null}
                  {panel === 'comment' ? (
                    <>
                      <textarea
                        className="w-full rounded-lg border p-2 text-sm"
                        rows={3}
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                      />
                      <button
                        type="button"
                        disabled={pending || !note.trim()}
                        className="mt-2 w-full py-2 text-sm font-semibold text-white"
                        style={{ borderRadius: RADIUS.md, background: colors.PRIMARY }}
                        onClick={() =>
                          onAction(async () => {
                            const res = await addMaintenanceComment(ticket.id, note);
                            if (res.ok) {
                              setNote('');
                              setPanel('none');
                            }
                            return res;
                          })
                        }
                      >
                        Publier
                      </button>
                    </>
                  ) : null}
                  {panel === 'part' ? (
                    <>
                      <input
                        className="w-full rounded-lg border p-2 text-sm"
                        placeholder="Nom de la pièce"
                        value={partLabel}
                        onChange={(e) => setPartLabel(e.target.value)}
                      />
                      <button
                        type="button"
                        disabled={pending || !partLabel.trim()}
                        className="mt-2 w-full py-2 text-sm font-semibold text-white"
                        style={{ borderRadius: RADIUS.md, background: colors.PRIMARY }}
                        onClick={() =>
                          onAction(async () => {
                            const res = await addMaintenancePart(ticket.id, partLabel);
                            if (res.ok) {
                              setPartLabel('');
                              setPanel('none');
                            }
                            return res;
                          })
                        }
                      >
                        Ajouter
                      </button>
                    </>
                  ) : null}
                  <button
                    type="button"
                    className="mt-2 w-full text-center text-xs text-gray-500"
                    onClick={() => setPanel('none')}
                  >
                    Annuler
                  </button>
                </div>
              ) : null}

              {/* Parts */}
              {(detail?.parts.length ?? 0) > 0 ? (
                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Pièces
                  </h3>
                  <ul className="mt-2 space-y-2">
                    {detail!.parts.map((p) => (
                      <li
                        key={p.id}
                        className="flex items-center justify-between gap-2 rounded-lg bg-gray-50 px-3 py-2 text-sm"
                      >
                        <span className="min-w-0 truncate font-medium">{p.label}</span>
                        <select
                          className="rounded border border-gray-200 bg-white px-1 py-1 text-[11px]"
                          value={p.status}
                          disabled={pending}
                          onChange={(e) =>
                            onAction(() =>
                              updateMaintenancePartStatus(
                                p.id,
                                e.target.value as InterventionPartStatus,
                              ),
                            )
                          }
                        >
                          {(Object.keys(PART_STATUS_LABELS) as InterventionPartStatus[]).map(
                            (s) => (
                              <option key={s} value={s}>
                                {PART_STATUS_LABELS[s]}
                              </option>
                            ),
                          )}
                        </select>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {/* Media */}
              {(detail?.media.length ?? 0) > 0 ? (
                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Médias
                  </h3>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    {detail!.media.map((m) =>
                      m.kind === 'video' ? (
                        <a
                          key={m.id}
                          href={m.signed_url ?? '#'}
                          target="_blank"
                          rel="noreferrer"
                          className="flex aspect-square items-center justify-center rounded-lg bg-gray-900 text-xs text-white"
                        >
                          Vidéo
                        </a>
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          key={m.id}
                          src={m.signed_url ?? undefined}
                          alt=""
                          className="aspect-square rounded-lg object-cover"
                        />
                      ),
                    )}
                  </div>
                </section>
              ) : null}

              {/* Timeline */}
              <section className="pb-8">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Timeline
                </h3>
                <ol className="mt-2 space-y-3 border-l-2 border-gray-200 pl-3">
                  {(detail?.events ?? []).map((ev) => (
                    <li key={ev.id} className="relative text-sm">
                      <span className="absolute -left-[17px] top-1.5 h-2 w-2 rounded-full bg-gray-400" />
                      <p className="text-[11px] font-semibold text-gray-500">
                        {EVENT_KIND_LABELS[ev.kind] ?? ev.kind} ·{' '}
                        {new Date(ev.created_at).toLocaleString('fr-FR', {
                          day: '2-digit',
                          month: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                      {ev.body ? <p className="mt-0.5 text-gray-800">{ev.body}</p> : null}
                    </li>
                  ))}
                </ol>
              </section>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ActionBtn({
  label,
  onClick,
  disabled,
  primary,
  colors,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
  colors: { PRIMARY: string };
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="py-2.5 text-sm font-semibold disabled:opacity-50"
      style={{
        borderRadius: RADIUS.md,
        background: primary ? colors.PRIMARY : '#f3f4f6',
        color: primary ? '#fff' : '#111',
      }}
    >
      {label}
    </button>
  );
}
