'use client';

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  CalendarPlus,
  Camera,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  History,
  MapPin,
  MessageSquare,
  Package,
  Pause,
  Phone,
  Play,
  Plus,
  Video,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useThemeColors } from '../../hooks/useThemeColors';
import { useTranslation } from '../../hooks/useTranslation';
import { useMaintenanceInterventions } from '../../hooks/api/useMaintenanceInterventions';
import { useAppDate } from '../../hooks/useAppDate';
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
import { RADIUS, SHADOW } from '../../constants/design';
import { SwipeSheet } from '../common/SwipeSheet';
import type {
  InterventionHoldReason,
  InterventionPartStatus,
  MaintenanceIntervention,
  MaintenanceInterventionDetail,
  MaintenancePartListItem,
} from '../../database/types';
import type { ThemeColors } from '../../types/theme.types';
import {
  addMaintenanceComment,
  addMaintenancePart,
  completeMaintenanceIntervention,
  createMaintenanceIntervention,
  getMaintenanceInterventionDetail,
  holdMaintenanceIntervention,
  listMaintenanceParts,
  listSitesForMaintenance,
  pauseMaintenanceIntervention,
  rescheduleMaintenanceIntervention,
  resumeMaintenanceIntervention,
  scheduleMaintenanceIntervention,
  startMaintenanceIntervention,
  updateMaintenancePartStatus,
  uploadMaintenanceMedia,
} from '../../app/interventions/actions';

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

function formatWeekRange(startIso: string, endIso: string): string {
  const start = parseIsoDateAsLocalDate(startIso);
  const end = parseIsoDateAsLocalDate(endIso);
  const sameMonth = start.getMonth() === end.getMonth();
  const startLabel = start.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: sameMonth ? undefined : 'short',
  });
  const endLabel = end.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  return `${startLabel} – ${endLabel}`;
}

function statusTone(
  status: MaintenanceIntervention['status'],
  colors: ThemeColors,
): { bg: string; fg: string } {
  if (status === 'en_cours') return { bg: colors.ACCENT_GREEN_MUTED, fg: colors.ACCENT_GREEN };
  if (status === 'en_pause') return { bg: colors.ACCENT_YELLOW_MUTED, fg: '#9A7B10' };
  if (status === 'en_attente') return { bg: colors.ACCENT_ORANGE_MUTED, fg: colors.ACCENT_ORANGE };
  if (status === 'planifiee') return { bg: colors.PRIMARY_MUTED, fg: colors.PRIMARY };
  if (status === 'cloturee') return { bg: colors.BG_TERTIARY, fg: colors.TEXT_SECONDARY };
  return { bg: colors.ACCENT_ORANGE_MUTED, fg: colors.ACCENT_ORANGE };
}

export function MaintenanceHomeBoard() {
  const { t } = useTranslation();
  const { colors } = useThemeColors();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { today } = useAppDate();
  const todayIso = toIsoDateString(today);

  const { data: tickets, isLoading, error, refetch } = useMaintenanceInterventions(true);

  const [weekStart, setWeekStart] = useState(() => mondayOf(todayIso));
  const [selectedDay, setSelectedDay] = useState(todayIso);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [detail, setDetail] = useState<MaintenanceInterventionDetail | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const [partsOpen, setPartsOpen] = useState(false);
  const [parts, setParts] = useState<MaintenancePartListItem[]>([]);
  const [partsLoading, setPartsLoading] = useState(false);
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);

  const partsTodoCount = useMemo(
    () => parts.filter((p) => p.status === 'a_commander' || p.status === 'commande').length,
    [parts],
  );

  function refreshParts() {
    setPartsLoading(true);
    startTransition(async () => {
      const res = await listMaintenanceParts();
      setPartsLoading(false);
      if (res.ok) setParts(res.parts);
    });
  }

  function openParts() {
    setPartsOpen(true);
    refreshParts();
  }

  useEffect(() => {
    if (!tickets) return;
    void listMaintenanceParts().then((res) => {
      if (res.ok) setParts(res.parts);
    });
  }, [tickets]);

  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDaysIso(weekStart, i)),
    [weekStart],
  );

  const grouped = useMemo(() => {
    const list = tickets ?? [];
    const backlog: MaintenanceIntervention[] = [];
    const overdue: MaintenanceIntervention[] = [];
    const active: MaintenanceIntervention[] = [];
    const byDay = new Map<string, MaintenanceIntervention[]>();

    for (const ticket of list) {
      if (ticket.status === 'en_cours' || ticket.status === 'en_pause') {
        active.push(ticket);
      }
      if (ticket.status === 'cloturee') continue;

      const day = parisDateFromScheduledAt(ticket.scheduled_at);
      // Pas de date → file à planifier
      if (!day) {
        if (ticket.status !== 'en_cours' && ticket.status !== 'en_pause') {
          backlog.push(ticket);
        }
        continue;
      }

      // Date passée sans clôture → uniquement aujourd'hui + Planifier (pas de doublon sur le jour prévu)
      if (day < todayIso && ticket.status !== 'en_cours' && ticket.status !== 'en_pause') {
        overdue.push(ticket);
        backlog.push(ticket);
        continue;
      }

      const arr = byDay.get(day) ?? [];
      arr.push(ticket);
      byDay.set(day, arr);
    }

    return { backlog, overdue, active, byDay };
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

  const dayTickets = grouped.byDay.get(selectedDay) ?? [];
  const dayList =
    selectedDay === todayIso
      ? [
          ...grouped.active,
          // Retards (date < aujourd'hui) : visibles aussi sur le jour courant
          ...grouped.overdue.filter(
            (t) => !grouped.active.some((a) => a.id === t.id),
          ),
          ...dayTickets.filter(
            (t) =>
              t.status !== 'en_cours' &&
              t.status !== 'en_pause' &&
              !grouped.overdue.some((o) => o.id === t.id),
          ),
        ]
      : dayTickets;
  const dayLabel = parseIsoDateAsLocalDate(selectedDay).toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
  });

  const weekTitle = formatWeekRange(weekDays[0], weekDays[6]);

  return (
    <div
      className="relative mx-auto flex min-h-0 w-full max-w-md flex-1 flex-col"
      style={{ background: colors.BG_SECONDARY }}
    >
      <div className="min-h-0 flex-1 overflow-y-auto pb-2">
        <div
          className="sticky top-0 z-20 px-3 pb-3 pt-2"
          style={{
            background: colors.HEADER_BG,
            borderBottom: `1px solid ${colors.BORDER}`,
          }}
        >
          <div className="mb-3 flex items-center gap-1">
            <button
              type="button"
              aria-label="Semaine précédente"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
              style={{ background: colors.BG_PRIMARY, border: `1px solid ${colors.BORDER}` }}
              onClick={() => {
                const next = addDaysIso(weekStart, -7);
                setWeekStart(next);
                setSelectedDay(next);
              }}
            >
              <ChevronLeft size={20} color={colors.PRIMARY} />
            </button>
            <p
              className="min-w-0 flex-1 text-center text-[15px] font-semibold tracking-tight"
              style={{ color: colors.TEXT_PRIMARY, fontFamily: 'var(--font-display)' }}
            >
              {weekTitle}
            </p>
            <button
              type="button"
              aria-label="Semaine suivante"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
              style={{ background: colors.BG_PRIMARY, border: `1px solid ${colors.BORDER}` }}
              onClick={() => {
                const next = addDaysIso(weekStart, 7);
                setWeekStart(next);
                setSelectedDay(next);
              }}
            >
              <ChevronRight size={20} color={colors.PRIMARY} />
            </button>
          </div>

          <div
            className="grid grid-cols-7 gap-1 p-1.5"
            style={{
              background: colors.BG_PRIMARY,
              borderRadius: RADIUS.md,
              border: `1px solid ${colors.BORDER}`,
              boxShadow: SHADOW.card,
            }}
          >
            {weekDays.map((day) => {
              const count =
                (grouped.byDay.get(day)?.length ?? 0) +
                (day === todayIso
                  ? grouped.active.length + grouped.overdue.length
                  : 0);
              const isSel = day === selectedDay;
              const isToday = day === todayIso;
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => setSelectedDay(day)}
                  className="relative flex flex-col items-center gap-0.5 py-2 text-[11px] transition-colors"
                  style={{
                    borderRadius: 12,
                    background: isSel
                      ? colors.PRIMARY
                      : isToday
                        ? colors.PRIMARY_MUTED
                        : 'transparent',
                    color: isSel ? colors.TEXT_INVERSE : colors.TEXT_PRIMARY,
                  }}
                >
                  <span
                    className="font-medium"
                    style={{ color: isSel ? 'rgba(255,255,255,0.75)' : colors.TEXT_MUTED }}
                  >
                    {parseIsoDateAsLocalDate(day).toLocaleDateString('fr-FR', {
                      weekday: 'narrow',
                    })}
                  </span>
                  <span className="text-sm font-semibold leading-none">
                    {Number(day.slice(8))}
                  </span>
                  <span
                    className="mt-0.5 h-1.5 w-1.5 rounded-full"
                    style={{
                      background: count > 0
                        ? isSel
                          ? colors.SECONDARY
                          : colors.ACCENT_ORANGE
                        : 'transparent',
                    }}
                  />
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-2.5 px-3 pt-3">
          {error ? (
            <p className="text-sm" style={{ color: colors.DANGER }}>
              {String(error)}
            </p>
          ) : null}
          <p
            className="px-0.5 text-[13px] font-semibold capitalize"
            style={{ color: colors.TEXT_SECONDARY }}
          >
            {dayLabel}
          </p>
          {isLoading ? (
            <p className="py-10 text-center text-sm" style={{ color: colors.TEXT_MUTED }}>
              Chargement…
            </p>
          ) : dayList.length === 0 ? (
            <div
              className="px-4 py-10 text-center"
              style={{
                background: colors.BG_PRIMARY,
                borderRadius: RADIUS.md,
                border: `1px dashed ${colors.BORDER}`,
              }}
            >
              <p className="text-sm" style={{ color: colors.TEXT_MUTED }}>
                Rien de prévu ce jour.
              </p>
            </div>
          ) : (
            dayList.map((ticket) => (
              <TicketCard
                key={ticket.id}
                ticket={ticket}
                colors={colors}
                todayIso={todayIso}
                onOpen={() => openDetail(ticket.id)}
              />
            ))
          )}
        </div>
      </div>

      <div
        className="shrink-0 px-3 pt-2.5"
        style={{
          background: colors.BG_PRIMARY,
          borderTop: `1px solid ${colors.BORDER}`,
          paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))',
          boxShadow: '0 -4px 16px rgba(44, 40, 37, 0.04)',
        }}
      >
        <div className="grid grid-cols-4 gap-1.5">
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="flex flex-col items-center justify-center gap-0.5 py-2.5 text-[11px] font-semibold"
            style={{
              borderRadius: RADIUS.md,
              background: colors.PRIMARY,
              color: colors.TEXT_INVERSE,
              boxShadow: SHADOW.card,
            }}
          >
            <Plus size={18} strokeWidth={2.5} />
            Nouveau
          </button>
          <button
            type="button"
            onClick={() => setPlanOpen(true)}
            className="relative flex flex-col items-center justify-center gap-0.5 py-2.5 text-[11px] font-semibold"
            style={{
              borderRadius: RADIUS.md,
              background: colors.SECONDARY_MUTED,
              color: colors.SECONDARY,
              border: `1px solid ${colors.SECONDARY}33`,
            }}
          >
            <CalendarPlus size={18} strokeWidth={2.25} />
            Planifier
            {grouped.backlog.length > 0 ? (
              <span
                className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-bold"
                style={{ background: colors.SECONDARY, color: colors.TEXT_INVERSE }}
              >
                {grouped.backlog.length}
              </span>
            ) : null}
          </button>
          <button
            type="button"
            onClick={() => router.push('/annuaire')}
            className="flex flex-col items-center justify-center gap-0.5 py-2.5 text-[11px] font-semibold"
            style={{
              borderRadius: RADIUS.md,
              background: colors.ACCENT_GREEN_MUTED,
              color: colors.ACCENT_GREEN,
              border: `1px solid ${colors.ACCENT_GREEN}33`,
            }}
          >
            <Phone size={18} strokeWidth={2.25} />
            Planning
          </button>
          <button
            type="button"
            onClick={openParts}
            className="relative flex flex-col items-center justify-center gap-0.5 py-2.5 text-[11px] font-semibold"
            style={{
              borderRadius: RADIUS.md,
              background: colors.PRIMARY_MUTED,
              color: colors.PRIMARY,
              border: `1px solid ${colors.BORDER}`,
            }}
          >
            <Package size={18} strokeWidth={2.25} />
            Pièces
            {partsTodoCount > 0 ? (
              <span
                className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-bold"
                style={{ background: colors.PRIMARY, color: colors.TEXT_INVERSE }}
              >
                {partsTodoCount}
              </span>
            ) : null}
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

      {partsOpen ? (
        <PartsSheet
          colors={colors}
          parts={parts}
          loading={partsLoading}
          pending={pending}
          onClose={() => setPartsOpen(false)}
          onOpenTicket={(id) => {
            setPartsOpen(false);
            openDetail(id);
          }}
          onStatusChange={(partId, status) => {
            if (isBrowserOffline()) {
              setFormError(t('forms.common.errorOffline'));
              return;
            }
            startTransition(async () => {
              const res = await updateMaintenancePartStatus(partId, status);
              if (!res.ok) {
                setFormError(res.error);
                return;
              }
              refreshParts();
              invalidate();
            });
          }}
        />
      ) : null}

      {planOpen ? (
        <PlanBacklogSheet
          colors={colors}
          backlog={grouped.backlog}
          todayIso={todayIso}
          pending={pending}
          onClose={() => setPlanOpen(false)}
          onSchedule={(id, dateIso) => {
            if (isBrowserOffline()) {
              setFormError(t('forms.common.errorOffline'));
              return;
            }
            startTransition(async () => {
              const res = await scheduleMaintenanceIntervention(id, dateIso);
              if (!res.ok) {
                setFormError(res.error);
                return;
              }
              setPlanOpen(false);
              setSelectedDay(dateIso);
              setWeekStart(mondayOf(dateIso));
              invalidate();
              openDetail(id);
            });
          }}
          onOpenTicket={(id) => {
            setPlanOpen(false);
            openDetail(id);
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

function TicketCard({
  ticket,
  colors,
  onOpen,
  hideSite = false,
  todayIso,
}: {
  ticket: MaintenanceIntervention;
  colors: ThemeColors;
  onOpen: () => void;
  /** Quand le site est déjà dans un en-tête de section. */
  hideSite?: boolean;
  todayIso: string;
}) {
  const scheduled = parisDateFromScheduledAt(ticket.scheduled_at);
  const overdue =
    scheduled != null &&
    scheduled < todayIso &&
    ticket.status !== 'cloturee' &&
    ticket.status !== 'en_cours' &&
    ticket.status !== 'en_pause';
  const tone = overdue
    ? { bg: colors.ACCENT_ORANGE_MUTED, fg: colors.ACCENT_ORANGE }
    : statusTone(ticket.status, colors);
  const leftAccent = overdue
    ? colors.ACCENT_ORANGE
    : ticket.status === 'en_cours'
      ? colors.ACCENT_GREEN
      : ticket.status === 'en_attente'
        ? colors.ACCENT_ORANGE
        : ticket.status === 'planifiee'
          ? colors.PRIMARY
          : colors.BORDER;
  const statusLabel = overdue ? 'En retard' : INTERVENTION_STATUS_LABELS[ticket.status];

  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full p-3 text-left transition-transform active:scale-[0.99]"
      style={{
        borderRadius: RADIUS.md,
        background: colors.BG_PRIMARY,
        border: `1px solid ${colors.BORDER}`,
        boxShadow: SHADOW.card,
        borderLeft: `3px solid ${leftAccent}`,
      }}
    >
      {!hideSite ? (
        <p
          className="mb-1 truncate text-sm font-semibold"
          style={{ color: colors.TEXT_PRIMARY, fontFamily: 'var(--font-display)' }}
        >
          {ticket.site_name}
        </p>
      ) : null}
      <div className="flex items-center gap-2">
        <p
          className="min-w-0 flex-1 truncate text-sm font-medium"
          style={{ color: colors.TEXT_PRIMARY }}
        >
          {maintenanceTicketText(ticket)}
        </p>
        <div className="flex shrink-0 items-center gap-1.5">
          {ticket.urgent ? (
            <span
              className="rounded-md px-1.5 py-0.5 text-[10px] font-bold"
              style={{ background: colors.ACCENT_RED_MUTED, color: colors.DANGER }}
            >
              URGENT
            </span>
          ) : null}
          <span
            className="rounded-md px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap"
            style={{ background: tone.bg, color: tone.fg }}
          >
            {statusLabel}
          </span>
        </div>
      </div>
      {scheduled ? (
        <p
          className="mt-1 text-[11px]"
          style={{
            color: overdue ? colors.ACCENT_ORANGE : colors.TEXT_MUTED,
            fontWeight: overdue ? 600 : undefined,
          }}
        >
          {overdue ? `Prévu le ${scheduled}` : scheduled}
        </p>
      ) : null}
    </button>
  );
}

type BacklogSiteGroup = {
  siteId: number;
  siteName: string;
  tickets: MaintenanceIntervention[];
};

type BacklogZoneGroup = {
  key: number | 'none';
  label: string;
  ticketCount: number;
  sites: BacklogSiteGroup[];
};

function backlogByZoneThenSite(backlog: MaintenanceIntervention[]): BacklogZoneGroup[] {
  type ZoneBucket = {
    label: string;
    sites: Map<number, BacklogSiteGroup>;
    siteOrder: number[];
  };
  const zoneOrder: number[] = [];
  const zones = new Map<number | 'none', ZoneBucket>();

  for (const ticket of backlog) {
    const zoneKey = ticket.group_id ?? 'none';
    let zone = zones.get(zoneKey);
    if (!zone) {
      zone = {
        label: ticket.group_name || 'Sans zone',
        sites: new Map(),
        siteOrder: [],
      };
      zones.set(zoneKey, zone);
      if (typeof zoneKey === 'number') zoneOrder.push(zoneKey);
    }

    let site = zone.sites.get(ticket.site_id);
    if (!site) {
      site = {
        siteId: ticket.site_id,
        siteName: ticket.site_name,
        tickets: [],
      };
      zone.sites.set(ticket.site_id, site);
      zone.siteOrder.push(ticket.site_id);
    }
    site.tickets.push(ticket);
  }

  zoneOrder.sort((a, b) => a - b);
  const keys: Array<number | 'none'> = [...zoneOrder];
  if (zones.has('none')) keys.push('none');

  return keys.map((key) => {
    const zone = zones.get(key)!;
    const sites = [...zone.siteOrder]
      .map((id) => zone.sites.get(id)!)
      .sort((a, b) => a.siteName.localeCompare(b.siteName, 'fr'));
    return {
      key,
      label: zone.label,
      ticketCount: sites.reduce((n, s) => n + s.tickets.length, 0),
      sites,
    };
  });
}

const PART_STATUS_ORDER: InterventionPartStatus[] = ['a_commander', 'commande', 'recu'];

function PartsSheet({
  colors,
  parts,
  loading,
  pending,
  onClose,
  onOpenTicket,
  onStatusChange,
}: {
  colors: ThemeColors;
  parts: MaintenancePartListItem[];
  loading: boolean;
  pending: boolean;
  onClose: () => void;
  onOpenTicket: (interventionId: number) => void;
  onStatusChange: (partId: number, status: InterventionPartStatus) => void;
}) {
  const byStatus = useMemo(() => {
    const map = new Map<InterventionPartStatus, MaintenancePartListItem[]>();
    for (const status of PART_STATUS_ORDER) map.set(status, []);
    for (const part of parts) {
      const list = map.get(part.status) ?? [];
      list.push(part);
      map.set(part.status, list);
    }
    return map;
  }, [parts]);

  const header = (
    <div
      className="px-4 pb-3"
      style={{ borderBottom: `1px solid ${colors.BORDER}`, background: colors.BG_PRIMARY }}
    >
      <p
        className="pr-8 text-lg font-semibold"
        style={{ color: colors.TEXT_PRIMARY, fontFamily: 'var(--font-display)' }}
      >
        Pièces
      </p>
      <p className="mt-0.5 text-xs" style={{ color: colors.TEXT_MUTED }}>
        {parts.length === 0
          ? 'Aucune pièce sur les tickets ouverts'
          : `${parts.filter((p) => p.status === 'a_commander').length} à commander · ${parts.filter((p) => p.status === 'commande').length} commandée${parts.filter((p) => p.status === 'commande').length > 1 ? 's' : ''}`}
      </p>
    </div>
  );

  return (
    <SwipeSheet colors={colors} onClose={onClose} maxHeight="90dvh" header={header}>
      <div className="space-y-5 px-4 py-3 pb-10">
        {loading && parts.length === 0 ? (
          <p className="py-10 text-center text-sm" style={{ color: colors.TEXT_MUTED }}>
            Chargement…
          </p>
        ) : parts.length === 0 ? (
          <p
            className="rounded-xl px-3 py-8 text-center text-sm"
            style={{
              color: colors.TEXT_MUTED,
              background: colors.BG_PRIMARY,
              border: `1px dashed ${colors.BORDER}`,
            }}
          >
            Rien à gérer pour le moment.
          </p>
        ) : (
          PART_STATUS_ORDER.map((status) => {
            const list = byStatus.get(status) ?? [];
            if (list.length === 0) return null;
            return (
              <section key={status}>
                <div className="mb-2 flex items-center justify-between gap-2 px-0.5">
                  <p
                    className="text-xs font-semibold uppercase tracking-wide"
                    style={{
                      color:
                        status === 'a_commander'
                          ? colors.ACCENT_ORANGE
                          : status === 'commande'
                            ? colors.PRIMARY
                            : colors.ACCENT_GREEN,
                    }}
                  >
                    {PART_STATUS_LABELS[status]}
                  </p>
                  <span
                    className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                    style={{
                      background:
                        status === 'a_commander'
                          ? colors.ACCENT_ORANGE_MUTED
                          : status === 'commande'
                            ? colors.PRIMARY_MUTED
                            : colors.ACCENT_GREEN_MUTED,
                      color:
                        status === 'a_commander'
                          ? colors.ACCENT_ORANGE
                          : status === 'commande'
                            ? colors.PRIMARY
                            : colors.ACCENT_GREEN,
                    }}
                  >
                    {list.length}
                  </span>
                </div>
                <div className="space-y-2">
                  {list.map((part) => (
                    <div
                      key={part.id}
                      className="p-3"
                      style={{
                        borderRadius: RADIUS.md,
                        background: colors.BG_PRIMARY,
                        border: `1px solid ${colors.BORDER}`,
                        boxShadow: SHADOW.card,
                      }}
                    >
                      <button
                        type="button"
                        className="w-full text-left"
                        onClick={() => onOpenTicket(part.intervention_id)}
                      >
                        <p
                          className="text-sm font-semibold"
                          style={{ color: colors.TEXT_PRIMARY }}
                        >
                          {part.label}
                        </p>
                        <p className="mt-0.5 text-xs" style={{ color: colors.PRIMARY }}>
                          {part.group_name} · {part.site_name}
                        </p>
                        <p
                          className="mt-0.5 line-clamp-1 text-xs"
                          style={{ color: colors.TEXT_MUTED }}
                        >
                          {part.ticket_label}
                        </p>
                      </button>
                      <div className="mt-2.5 flex flex-wrap gap-1.5">
                        {PART_STATUS_ORDER.map((s) => (
                          <button
                            key={s}
                            type="button"
                            disabled={pending}
                            onClick={() => onStatusChange(part.id, s)}
                            className="rounded-full px-2.5 py-1 text-[11px] font-semibold disabled:opacity-50"
                            style={{
                              background: part.status === s ? colors.PRIMARY : colors.BG_SECONDARY,
                              color:
                                part.status === s ? colors.TEXT_INVERSE : colors.TEXT_SECONDARY,
                              border: part.status === s ? 'none' : `1px solid ${colors.BORDER}`,
                            }}
                          >
                            {PART_STATUS_LABELS[s]}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            );
          })
        )}
      </div>
    </SwipeSheet>
  );
}

function PlanBacklogSheet({
  colors,
  backlog,
  todayIso,
  pending,
  onClose,
  onSchedule,
  onOpenTicket,
}: {
  colors: ThemeColors;
  backlog: MaintenanceIntervention[];
  todayIso: string;
  pending: boolean;
  onClose: () => void;
  onSchedule: (id: number, dateIso: string) => void;
  onOpenTicket: (id: number) => void;
}) {
  const [pickedId, setPickedId] = useState<number | null>(null);
  const [dateIso, setDateIso] = useState(todayIso);
  const picked = backlog.find((t) => t.id === pickedId) ?? null;
  const zones = useMemo(() => backlogByZoneThenSite(backlog), [backlog]);
  const siteCount = useMemo(
    () => zones.reduce((n, z) => n + z.sites.length, 0),
    [zones],
  );

  const header = (
    <div
      className="px-4 pb-3"
      style={{ borderBottom: `1px solid ${colors.BORDER}`, background: colors.BG_PRIMARY }}
    >
      <p
        className="pr-8 text-lg font-semibold"
        style={{ color: colors.TEXT_PRIMARY, fontFamily: 'var(--font-display)' }}
      >
        {picked ? 'Choisir le jour' : 'Tickets à planifier'}
      </p>
      {!picked && backlog.length > 0 ? (
        <p className="mt-0.5 text-xs" style={{ color: colors.TEXT_MUTED }}>
          {zones.length} zone{zones.length > 1 ? 's' : ''} · {siteCount} site
          {siteCount > 1 ? 's' : ''} · {backlog.length} ticket
          {backlog.length > 1 ? 's' : ''}
        </p>
      ) : null}
    </div>
  );

  return (
    <SwipeSheet colors={colors} onClose={onClose} maxHeight="88dvh" header={header}>
      <div className="px-4 py-3 pb-8">
        {!picked ? (
          backlog.length === 0 ? (
            <p className="py-8 text-center text-sm" style={{ color: colors.TEXT_MUTED }}>
              File vide.
            </p>
          ) : (
            <div className="space-y-5">
              {zones.map((zone) => (
                <section key={String(zone.key)}>
                  <div className="mb-2.5 flex items-center justify-between gap-2 px-0.5">
                    <p
                      className="text-xs font-semibold uppercase tracking-wide"
                      style={{ color: colors.PRIMARY }}
                    >
                      {zone.label}
                    </p>
                    <span
                      className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                      style={{
                        background: colors.PRIMARY_MUTED,
                        color: colors.PRIMARY,
                      }}
                    >
                      {zone.ticketCount}
                    </span>
                  </div>
                  <div className="space-y-3">
                    {zone.sites.map((site) => (
                      <div key={site.siteId}>
                        <div
                          className="mb-1.5 flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5"
                          style={{
                            background: colors.BG_PRIMARY,
                            border: `1px solid ${colors.BORDER}`,
                          }}
                        >
                          <p
                            className="truncate text-sm font-semibold"
                            style={{
                              color: colors.TEXT_PRIMARY,
                              fontFamily: 'var(--font-display)',
                            }}
                          >
                            {site.siteName}
                          </p>
                          {site.tickets.length > 1 ? (
                            <span
                              className="shrink-0 text-[11px] font-semibold"
                              style={{ color: colors.TEXT_MUTED }}
                            >
                              {site.tickets.length}
                            </span>
                          ) : null}
                        </div>
                        <div className="space-y-1.5 pl-1">
                          {site.tickets.map((ticket) => (
                            <TicketCard
                              key={ticket.id}
                              ticket={ticket}
                              colors={colors}
                              todayIso={todayIso}
                              hideSite
                              onOpen={() => setPickedId(ticket.id)}
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )
        ) : (
          <>
            <div
              className="mb-3 p-3"
              style={{
                background: colors.BG_PRIMARY,
                borderRadius: RADIUS.md,
                border: `1px solid ${colors.BORDER}`,
              }}
            >
              <p className="text-sm font-medium" style={{ color: colors.TEXT_PRIMARY }}>
                {picked.site_name}
              </p>
              <p className="mt-0.5 text-xs font-medium" style={{ color: colors.PRIMARY }}>
                {picked.group_name}
              </p>
              <p className="mt-0.5 text-sm" style={{ color: colors.TEXT_SECONDARY }}>
                {maintenanceTicketText(picked)}
              </p>
            </div>
            <DayChipPicker
              value={dateIso}
              todayIso={todayIso}
              onChange={setDateIso}
              colors={colors}
            />
            <button
              type="button"
              disabled={pending}
              className="mt-4 w-full py-3.5 text-sm font-semibold disabled:opacity-50"
              style={{
                borderRadius: RADIUS.md,
                background: colors.SECONDARY,
                color: colors.TEXT_INVERSE,
              }}
              onClick={() => onSchedule(picked.id, dateIso)}
            >
              Planifier
            </button>
            <button
              type="button"
              className="mt-2 w-full py-2 text-sm font-medium"
              style={{ color: colors.PRIMARY }}
              onClick={() => onOpenTicket(picked.id)}
            >
              Ouvrir le ticket
            </button>
            <button
              type="button"
              className="mt-1 w-full py-2 text-sm"
              style={{ color: colors.TEXT_MUTED }}
              onClick={() => setPickedId(null)}
            >
              Retour à la file
            </button>
          </>
        )}
      </div>
    </SwipeSheet>
  );
}

function DayChipPicker({
  value,
  todayIso,
  onChange,
  colors,
}: {
  value: string;
  todayIso: string;
  onChange: (iso: string) => void;
  colors: ThemeColors;
}) {
  const days = useMemo(
    () => Array.from({ length: 14 }, (_, i) => addDaysIso(todayIso, i)),
    [todayIso],
  );
  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {days.map((day) => {
        const selected = day === value;
        const d = parseIsoDateAsLocalDate(day);
        return (
          <button
            key={day}
            type="button"
            onClick={() => onChange(day)}
            className="flex min-w-[3.25rem] shrink-0 flex-col items-center px-2 py-2 text-[11px]"
            style={{
              borderRadius: RADIUS.sm,
              background: selected ? colors.PRIMARY : colors.BG_PRIMARY,
              color: selected ? colors.TEXT_INVERSE : colors.TEXT_PRIMARY,
              border: `1px solid ${selected ? colors.PRIMARY : colors.BORDER}`,
            }}
          >
            <span style={{ color: selected ? 'rgba(255,255,255,0.75)' : colors.TEXT_MUTED }}>
              {d.toLocaleDateString('fr-FR', { weekday: 'narrow' })}
            </span>
            <span className="text-sm font-semibold">{d.getDate()}</span>
          </button>
        );
      })}
    </div>
  );
}

function ChoiceRow({
  label,
  selected,
  onClick,
  colors,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
  colors: ThemeColors;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full px-3 py-3 text-left text-sm font-medium"
      style={{
        borderRadius: RADIUS.sm,
        border: `1px solid ${selected ? colors.PRIMARY : colors.BORDER}`,
        background: selected ? colors.PRIMARY_MUTED : colors.BG_PRIMARY,
        color: selected ? colors.PRIMARY : colors.TEXT_PRIMARY,
      }}
    >
      {label}
    </button>
  );
}

function CreateSheet({
  colors,
  pending,
  onClose,
  onCreate,
}: {
  colors: ThemeColors;
  pending: boolean;
  onClose: () => void;
  onCreate: (p: { siteId: number; description: string; urgent: boolean }) => void;
}) {
  const [sites, setSites] = useState<{ id: number; name: string }[]>([]);
  const [siteId, setSiteId] = useState<number>(0);
  const [pickSite, setPickSite] = useState(false);
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

  const siteName = sites.find((s) => s.id === siteId)?.name ?? 'Choisir un site';

  return (
    <SwipeSheet
      colors={colors}
      onClose={onClose}
      maxHeight="88dvh"
      header={
        <div className="px-4 pb-2" style={{ background: colors.BG_PRIMARY }}>
          <h2
            className="pr-8 text-lg font-semibold"
            style={{ color: colors.TEXT_PRIMARY, fontFamily: 'var(--font-display)' }}
          >
            Nouveau ticket
          </h2>
        </div>
      }
    >
      <div className="px-4 py-3 pb-8">
        <p
          className="text-xs font-semibold uppercase tracking-wide"
          style={{ color: colors.TEXT_MUTED }}
        >
          Site
        </p>
        <button
          type="button"
          onClick={() => setPickSite((v) => !v)}
          className="mt-1 w-full px-4 py-3 text-left text-sm font-medium"
          style={{
            borderRadius: RADIUS.md,
            background: colors.BG_PRIMARY,
            border: `1px solid ${colors.BORDER}`,
            color: colors.TEXT_PRIMARY,
            boxShadow: SHADOW.card,
          }}
        >
          {siteName}
        </button>
        {pickSite ? (
          <div
            className="mt-2 max-h-48 space-y-1.5 overflow-y-auto p-2"
            style={{
              borderRadius: RADIUS.md,
              background: colors.BG_TERTIARY,
              border: `1px solid ${colors.BORDER}`,
            }}
          >
            {sites.map((s) => (
              <ChoiceRow
                key={s.id}
                label={s.name}
                selected={s.id === siteId}
                colors={colors}
                onClick={() => {
                  setSiteId(s.id);
                  setPickSite(false);
                }}
              />
            ))}
          </div>
        ) : null}
        <p
          className="mt-3 text-xs font-semibold uppercase tracking-wide"
          style={{ color: colors.TEXT_MUTED }}
        >
          Problème
        </p>
        <textarea
          className="mt-1 w-full p-3 text-sm outline-none"
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Décris la panne…"
          style={{
            borderRadius: RADIUS.md,
            background: colors.BG_PRIMARY,
            border: `1px solid ${colors.BORDER}`,
            color: colors.TEXT_PRIMARY,
          }}
        />
        <button
          type="button"
          onClick={() => setUrgent((v) => !v)}
          className="mt-3 w-full px-4 py-3 text-left text-sm font-medium"
          style={{
            borderRadius: RADIUS.md,
            border: `1px solid ${urgent ? colors.DANGER : colors.BORDER}`,
            background: urgent ? colors.ACCENT_RED_MUTED : colors.BG_PRIMARY,
            color: urgent ? colors.DANGER : colors.TEXT_PRIMARY,
          }}
        >
          {urgent ? 'Urgent · oui' : 'Marquer urgent'}
        </button>
        <button
          type="button"
          disabled={pending || !siteId || !description.trim()}
          className="mt-4 w-full py-3.5 text-sm font-semibold disabled:opacity-50"
          style={{
            borderRadius: RADIUS.md,
            background: colors.PRIMARY,
            color: colors.TEXT_INVERSE,
          }}
          onClick={() => onCreate({ siteId, description, urgent })}
        >
          Créer
        </button>
      </div>
    </SwipeSheet>
  );
}

function SectionTitle({
  icon: Icon,
  label,
  colors,
  action,
}: {
  icon: LucideIcon;
  label: string;
  colors: ThemeColors;
  action?: ReactNode;
}) {
  return (
    <div className="mb-2.5 flex items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <span
          className="flex h-7 w-7 items-center justify-center rounded-lg"
          style={{ background: colors.PRIMARY_MUTED }}
        >
          <Icon size={14} color={colors.PRIMARY} strokeWidth={2.25} />
        </span>
        <h3
          className="text-[13px] font-semibold"
          style={{ color: colors.TEXT_PRIMARY, fontFamily: 'var(--font-display)' }}
        >
          {label}
        </h3>
      </div>
      {action}
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
  colors: ThemeColors;
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
  const tone = ticket ? statusTone(ticket.status, colors) : null;
  const scheduled = ticket ? parisDateFromScheduledAt(ticket.scheduled_at) : null;

  const header = ticket ? (
    <div
      className="px-4 pb-3 pt-1"
      style={{ borderBottom: `1px solid ${colors.BORDER}`, background: colors.BG_PRIMARY }}
    >
      <div className="flex items-center gap-1.5 text-[11px] font-semibold" style={{ color: colors.PRIMARY }}>
        <MapPin size={12} />
        <span className="truncate">{ticket.group_name}</span>
      </div>
      <p
        className="mt-1 text-xl font-bold leading-tight"
        style={{ color: colors.TEXT_PRIMARY, fontFamily: 'var(--font-display)' }}
      >
        {ticket.site_name}
      </p>
      <p className="mt-1.5 text-sm leading-snug" style={{ color: colors.TEXT_SECONDARY }}>
        {maintenanceTicketText(ticket)}
      </p>
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        {tone ? (
          <span
            className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
            style={{ background: tone.bg, color: tone.fg }}
          >
            {INTERVENTION_STATUS_LABELS[ticket.status]}
          </span>
        ) : null}
        {ticket.urgent ? (
          <span
            className="rounded-full px-2.5 py-1 text-[11px] font-bold"
            style={{ background: colors.ACCENT_RED_MUTED, color: colors.DANGER }}
          >
            Urgent
          </span>
        ) : null}
        {scheduled ? (
          <span
            className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium"
            style={{ background: colors.BG_TERTIARY, color: colors.TEXT_SECONDARY }}
          >
            <Clock3 size={11} />
            {scheduled}
          </span>
        ) : null}
      </div>
    </div>
  ) : null;

  return (
    <SwipeSheet colors={colors} onClose={onClose} fullHeight maxHeight="94dvh" header={header}>
      {!ticket ? (
        <p className="p-6 text-sm" style={{ color: colors.TEXT_MUTED }}>
          Chargement…
        </p>
      ) : (
        <div className="space-y-4 px-4 py-3 pb-10">
          {formError ? (
            <p
              className="rounded-xl px-3 py-2 text-sm"
              style={{ background: colors.ACCENT_RED_MUTED, color: colors.DANGER }}
            >
              {formError}
            </p>
          ) : null}

          <section
            className="p-3"
            style={{
              borderRadius: RADIUS.md,
              background: colors.BG_PRIMARY,
              border: `1px solid ${colors.BORDER}`,
              boxShadow: SHADOW.card,
            }}
          >
            <SectionTitle icon={Wrench} label="Actions" colors={colors} />
            <div className="grid grid-cols-2 gap-2">
              {canStart(ticket.status) ? (
                <ActionBtn
                  label="Démarrer"
                  icon={Play}
                  primary
                  colors={colors}
                  disabled={pending}
                  onClick={() => onAction(() => startMaintenanceIntervention(ticket.id))}
                />
              ) : null}
              {canPause(ticket.status) ? (
                <ActionBtn
                  label="Pause"
                  icon={Pause}
                  colors={colors}
                  disabled={pending}
                  onClick={() => onAction(() => pauseMaintenanceIntervention(ticket.id))}
                />
              ) : null}
              {canResume(ticket.status) ? (
                <ActionBtn
                  label="Reprendre"
                  icon={Play}
                  primary
                  colors={colors}
                  disabled={pending}
                  onClick={() => onAction(() => resumeMaintenanceIntervention(ticket.id))}
                />
              ) : null}
              {canComplete(ticket.status) || ticket.status === 'signalee' ? (
                <ActionBtn
                  label="Terminer"
                  icon={CheckCircle2}
                  colors={colors}
                  disabled={pending}
                  onClick={() => setPanel('complete')}
                />
              ) : null}
              <ActionBtn
                label="Planifier"
                icon={CalendarPlus}
                colors={colors}
                disabled={pending}
                onClick={() => setPanel('schedule')}
              />
              {canHold(ticket.status) ? (
                <ActionBtn
                  label="Attente"
                  icon={Package}
                  colors={colors}
                  disabled={pending}
                  onClick={() => setPanel('hold')}
                />
              ) : null}
              <ActionBtn
                label="Commentaire"
                icon={MessageSquare}
                colors={colors}
                disabled={pending}
                onClick={() => setPanel('comment')}
              />
              <ActionBtn
                label="Pièce"
                icon={Package}
                colors={colors}
                disabled={pending}
                onClick={() => setPanel('part')}
              />
              <ActionBtn
                label="Photo"
                icon={Camera}
                colors={colors}
                disabled={pending}
                onClick={() => fileRef.current?.click()}
              />
              <ActionBtn
                label="Vidéo"
                icon={Video}
                colors={colors}
                disabled={pending}
                onClick={() => videoRef.current?.click()}
              />
            </div>
          </section>

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
                <div
                  className="p-3"
                  style={{
                    borderRadius: RADIUS.md,
                    background: colors.BG_PRIMARY,
                    border: `1px solid ${colors.BORDER}`,
                    boxShadow: SHADOW.card,
                  }}
                >
                  {panel === 'schedule' ? (
                    <>
                      <p
                        className="mb-2 text-xs font-semibold uppercase tracking-wide"
                        style={{ color: colors.TEXT_MUTED }}
                      >
                        Jour
                      </p>
                      <DayChipPicker
                        value={dateIso}
                        todayIso={todayIso}
                        onChange={setDateIso}
                        colors={colors}
                      />
                      <textarea
                        className="mt-3 w-full p-3 text-sm outline-none"
                        rows={2}
                        placeholder="Note (optionnel / obligatoire si report)"
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        style={{
                          borderRadius: RADIUS.sm,
                          border: `1px solid ${colors.BORDER}`,
                          background: colors.BG_SECONDARY,
                          color: colors.TEXT_PRIMARY,
                        }}
                      />
                      <button
                        type="button"
                        disabled={pending}
                        className="mt-2 w-full py-3 text-sm font-semibold"
                        style={{
                          borderRadius: RADIUS.md,
                          background: colors.PRIMARY,
                          color: colors.TEXT_INVERSE,
                        }}
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
                        className="w-full p-3 text-sm outline-none"
                        rows={3}
                        placeholder="Ce qui a été fait…"
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        style={{
                          borderRadius: RADIUS.sm,
                          border: `1px solid ${colors.BORDER}`,
                          background: colors.BG_SECONDARY,
                          color: colors.TEXT_PRIMARY,
                        }}
                      />
                      <button
                        type="button"
                        disabled={pending || !note.trim()}
                        className="mt-2 w-full py-3 text-sm font-semibold disabled:opacity-50"
                        style={{
                          borderRadius: RADIUS.md,
                          background: colors.SUCCESS,
                          color: colors.TEXT_INVERSE,
                        }}
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
                      <div className="space-y-2">
                        {(
                          [
                            ['pieces', 'Attente pièces'],
                            ['retour', 'Retour plus tard'],
                            ['autre', 'Autre'],
                          ] as const
                        ).map(([value, label]) => (
                          <ChoiceRow
                            key={value}
                            label={label}
                            selected={holdReason === value}
                            colors={colors}
                            onClick={() => setHoldReason(value)}
                          />
                        ))}
                      </div>
                      <p
                        className="mb-2 mt-3 text-xs font-semibold uppercase tracking-wide"
                        style={{ color: colors.TEXT_MUTED }}
                      >
                        Reprise prévue
                      </p>
                      <DayChipPicker
                        value={dateIso}
                        todayIso={todayIso}
                        onChange={setDateIso}
                        colors={colors}
                      />
                      <textarea
                        className="mt-3 w-full p-3 text-sm outline-none"
                        rows={2}
                        placeholder="Détail…"
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        style={{
                          borderRadius: RADIUS.sm,
                          border: `1px solid ${colors.BORDER}`,
                          background: colors.BG_SECONDARY,
                          color: colors.TEXT_PRIMARY,
                        }}
                      />
                      <button
                        type="button"
                        disabled={pending || !note.trim()}
                        className="mt-2 w-full py-3 text-sm font-semibold disabled:opacity-50"
                        style={{
                          borderRadius: RADIUS.md,
                          background: colors.SECONDARY,
                          color: colors.TEXT_INVERSE,
                        }}
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
                        className="w-full p-3 text-sm outline-none"
                        rows={3}
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        style={{
                          borderRadius: RADIUS.sm,
                          border: `1px solid ${colors.BORDER}`,
                          background: colors.BG_SECONDARY,
                          color: colors.TEXT_PRIMARY,
                        }}
                      />
                      <button
                        type="button"
                        disabled={pending || !note.trim()}
                        className="mt-2 w-full py-3 text-sm font-semibold disabled:opacity-50"
                        style={{
                          borderRadius: RADIUS.md,
                          background: colors.PRIMARY,
                          color: colors.TEXT_INVERSE,
                        }}
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
                        className="w-full p-3 text-sm outline-none"
                        placeholder="Nom de la pièce"
                        value={partLabel}
                        onChange={(e) => setPartLabel(e.target.value)}
                        style={{
                          borderRadius: RADIUS.sm,
                          border: `1px solid ${colors.BORDER}`,
                          background: colors.BG_SECONDARY,
                          color: colors.TEXT_PRIMARY,
                        }}
                      />
                      <button
                        type="button"
                        disabled={pending || !partLabel.trim()}
                        className="mt-2 w-full py-3 text-sm font-semibold disabled:opacity-50"
                        style={{
                          borderRadius: RADIUS.md,
                          background: colors.PRIMARY,
                          color: colors.TEXT_INVERSE,
                        }}
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
                    className="mt-2 w-full text-center text-xs font-medium"
                    style={{ color: colors.TEXT_MUTED }}
                    onClick={() => setPanel('none')}
                  >
                    Annuler
                  </button>
                </div>
              ) : null}

          <section>
            <SectionTitle
              icon={Package}
              label="Pièces"
              colors={colors}
              action={
                <button
                  type="button"
                  className="text-xs font-semibold"
                  style={{ color: colors.PRIMARY }}
                  onClick={() => setPanel('part')}
                >
                  + Ajouter
                </button>
              }
            />
            {(detail?.parts.length ?? 0) === 0 ? (
              <p
                className="rounded-xl px-3 py-4 text-center text-sm"
                style={{
                  color: colors.TEXT_MUTED,
                  background: colors.BG_PRIMARY,
                  border: `1px dashed ${colors.BORDER}`,
                }}
              >
                Aucune pièce pour l’instant
              </p>
            ) : (
              <ul className="space-y-2">
                {detail!.parts.map((p) => (
                  <li
                    key={p.id}
                    className="px-3 py-2.5 text-sm"
                    style={{
                      borderRadius: RADIUS.md,
                      background: colors.BG_PRIMARY,
                      border: `1px solid ${colors.BORDER}`,
                      boxShadow: SHADOW.card,
                    }}
                  >
                    <p className="truncate font-medium" style={{ color: colors.TEXT_PRIMARY }}>
                      {p.label}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {(Object.keys(PART_STATUS_LABELS) as InterventionPartStatus[]).map((s) => (
                        <button
                          key={s}
                          type="button"
                          disabled={pending}
                          onClick={() => onAction(() => updateMaintenancePartStatus(p.id, s))}
                          className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
                          style={{
                            background: p.status === s ? colors.PRIMARY : colors.BG_SECONDARY,
                            color: p.status === s ? colors.TEXT_INVERSE : colors.TEXT_SECONDARY,
                            border: p.status === s ? 'none' : `1px solid ${colors.BORDER}`,
                          }}
                        >
                          {PART_STATUS_LABELS[s]}
                        </button>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {(detail?.media.length ?? 0) > 0 ? (
            <section>
              <SectionTitle icon={Camera} label="Médias" colors={colors} />
              <div className="grid grid-cols-3 gap-2">
                {detail!.media.map((m) =>
                  m.kind === 'video' ? (
                    <a
                      key={m.id}
                      href={m.signed_url ?? '#'}
                      target="_blank"
                      rel="noreferrer"
                      className="flex aspect-square flex-col items-center justify-center gap-1 text-xs font-semibold"
                      style={{
                        borderRadius: RADIUS.md,
                        background: colors.PRIMARY_MUTED,
                        color: colors.PRIMARY,
                        border: `1px solid ${colors.BORDER}`,
                      }}
                    >
                      <Video size={18} />
                      Vidéo
                    </a>
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={m.id}
                      src={m.signed_url ?? undefined}
                      alt=""
                      className="aspect-square object-cover"
                      style={{
                        borderRadius: RADIUS.md,
                        border: `1px solid ${colors.BORDER}`,
                      }}
                    />
                  ),
                )}
              </div>
            </section>
          ) : null}

          <section>
            <SectionTitle icon={History} label="Timeline" colors={colors} />
            <div
              className="px-3 py-2"
              style={{
                borderRadius: RADIUS.md,
                background: colors.BG_PRIMARY,
                border: `1px solid ${colors.BORDER}`,
              }}
            >
              <ol
                className="space-y-3 border-l-2 pl-3 py-1"
                style={{ borderColor: colors.PRIMARY_MUTED }}
              >
                {(detail?.events ?? []).map((ev) => (
                  <li key={ev.id} className="relative text-sm">
                    <span
                      className="absolute -left-[17px] top-1.5 h-2.5 w-2.5 rounded-full"
                      style={{
                        background: colors.PRIMARY,
                        border: `2px solid ${colors.BG_PRIMARY}`,
                      }}
                    />
                    <p className="text-[11px] font-semibold" style={{ color: colors.TEXT_MUTED }}>
                      {EVENT_KIND_LABELS[ev.kind] ?? ev.kind} ·{' '}
                      {new Date(ev.created_at).toLocaleString('fr-FR', {
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                    {ev.body ? (
                      <p className="mt-0.5" style={{ color: colors.TEXT_PRIMARY }}>
                        {ev.body}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ol>
            </div>
          </section>
        </div>
      )}
    </SwipeSheet>
  );
}

function ActionBtn({
  label,
  icon: Icon,
  onClick,
  disabled,
  primary,
  colors,
}: {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
  colors: ThemeColors;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex items-center gap-2 px-3 py-2.5 text-left text-sm font-semibold disabled:opacity-50"
      style={{
        borderRadius: RADIUS.md,
        background: primary ? colors.PRIMARY : colors.BG_SECONDARY,
        color: primary ? colors.TEXT_INVERSE : colors.TEXT_PRIMARY,
        border: primary ? 'none' : `1px solid ${colors.BORDER}`,
        boxShadow: primary ? SHADOW.card : undefined,
      }}
    >
      <Icon size={16} strokeWidth={2.25} />
      <span className="truncate">{label}</span>
    </button>
  );
}
