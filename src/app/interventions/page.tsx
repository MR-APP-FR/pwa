'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '../../components/layout/PageHeader';
import { FormScrollLayout } from '../../components/layout/FormScrollLayout';
import { PrimaryButton } from '../../components/common/PrimaryButton';
import { useThemeColors } from '../../hooks/useThemeColors';
import { useTranslation } from '../../hooks/useTranslation';
import { useCurrentUser } from '../../hooks/api/useCurrentUser';
import { useMaintenanceInterventions } from '../../hooks/api/useMaintenanceInterventions';
import { useAppDate } from '../../hooks/useAppDate';
import { isMaintenanceRole } from '../../lib/staff-role';
import { maintenanceTicketText } from '../../lib/interventions/labels';
import { isBrowserOffline } from '../../lib/offline';
import { parseIsoDateAsLocalDate, toIsoDateString, toParisLocalDate } from '../../lib/parisTime';
import { RADIUS } from '../../constants/design';
import type { MaintenanceIntervention } from '../../database/types';
import {
  completeMaintenanceIntervention,
  rescheduleMaintenanceIntervention,
  scheduleMaintenanceIntervention,
} from './actions';

type TicketAction = 'schedule' | 'complete' | 'reschedule';

function parisDateFromScheduledAt(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return toIsoDateString(toParisLocalDate(d));
}

function formatDayLabel(dateIso: string): string {
  const d = parseIsoDateAsLocalDate(dateIso);
  return d.toLocaleDateString('fr-FR', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
  });
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

  const [selected, setSelected] = useState<MaintenanceIntervention | null>(null);
  const [action, setAction] = useState<TicketAction | null>(null);
  const [dateIso, setDateIso] = useState(todayIso);
  const [note, setNote] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const grouped = useMemo(() => {
    const list = tickets ?? [];
    const todayList: MaintenanceIntervention[] = [];
    const backlog: MaintenanceIntervention[] = [];
    const later: MaintenanceIntervention[] = [];

    for (const ticket of list) {
      const day = parisDateFromScheduledAt(ticket.scheduled_at);
      if (day === todayIso) todayList.push(ticket);
      else if (!day) backlog.push(ticket);
      else if (day > todayIso) later.push(ticket);
      else todayList.push(ticket); // overdue → today bucket
    }

    return { todayList, backlog, later };
  }, [tickets, todayIso]);

  function openAction(ticket: MaintenanceIntervention, next: TicketAction) {
    setSelected(ticket);
    setAction(next);
    setFormError(null);
    setNote('');
    const scheduled = parisDateFromScheduledAt(ticket.scheduled_at);
    setDateIso(scheduled && scheduled >= todayIso ? scheduled : todayIso);
  }

  function closePanel() {
    setSelected(null);
    setAction(null);
    setFormError(null);
    setNote('');
  }

  function submitAction() {
    if (!selected || !action) return;
    setFormError(null);
    if (isBrowserOffline()) {
      setFormError(t('forms.common.errorOffline'));
      return;
    }
    startTransition(async () => {
      let result: { ok: true } | { ok: false; error: string };
      if (action === 'complete') {
        result = await completeMaintenanceIntervention(selected.id, note);
      } else if (action === 'schedule') {
        result = await scheduleMaintenanceIntervention(selected.id, dateIso, note || undefined);
      } else {
        result = await rescheduleMaintenanceIntervention(selected.id, dateIso, note);
      }
      if (!result.ok) {
        setFormError(result.error);
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ['maintenanceInterventions'] });
      closePanel();
    });
  }

  if (userLoading) {
    return (
      <FormScrollLayout>
        <PageHeader title={t('screens.interventions.title')} accent="orange" />
        <p className="p-4 text-sm" style={{ color: colors.TEXT_SECONDARY }}>
          …
        </p>
      </FormScrollLayout>
    );
  }

  if (!isMaintenance) {
    return (
      <FormScrollLayout>
        <PageHeader title={t('screens.interventions.title')} accent="orange" />
        <div className="space-y-3 p-4">
          <p style={{ color: colors.TEXT_SECONDARY }}>{t('screens.interventions.forbidden')}</p>
          <PrimaryButton onClick={() => router.push('/')}>{t('screens.interventions.backHome')}</PrimaryButton>
        </div>
      </FormScrollLayout>
    );
  }

  return (
    <FormScrollLayout>
      <PageHeader title={t('screens.interventions.title')} accent="orange" />
      <div className="flex flex-col gap-4 px-4 pb-6 pt-2">
        {error ? (
          <div
            className="rounded-lg p-3 text-sm"
            style={{ backgroundColor: colors.ACCENT_RED_MUTED, color: colors.DANGER }}
          >
            {(error as Error).message}
            <button type="button" className="ml-2 underline" onClick={() => refetch()}>
              {t('screens.interventions.retry')}
            </button>
          </div>
        ) : null}

        {isLoading ? (
          <p className="text-sm" style={{ color: colors.TEXT_SECONDARY }}>
            {t('screens.interventions.loading')}
          </p>
        ) : (
          <>
            <TicketSection
              title={t('screens.interventions.sectionToday')}
              empty={t('screens.interventions.emptyToday')}
              tickets={grouped.todayList}
              onSelect={(ticket) => openAction(ticket, ticket.status === 'planifiee' ? 'complete' : 'schedule')}
              onSchedule={(ticket) => openAction(ticket, 'schedule')}
              onComplete={(ticket) => openAction(ticket, 'complete')}
              onReschedule={(ticket) => openAction(ticket, 'reschedule')}
            />
            <TicketSection
              title={t('screens.interventions.sectionBacklog')}
              empty={t('screens.interventions.emptyBacklog')}
              tickets={grouped.backlog}
              onSelect={(ticket) => openAction(ticket, 'schedule')}
              onSchedule={(ticket) => openAction(ticket, 'schedule')}
              onComplete={(ticket) => openAction(ticket, 'complete')}
              onReschedule={(ticket) => openAction(ticket, 'reschedule')}
            />
            <TicketSection
              title={t('screens.interventions.sectionLater')}
              empty={t('screens.interventions.emptyLater')}
              tickets={grouped.later}
              onSelect={(ticket) => openAction(ticket, 'complete')}
              onSchedule={(ticket) => openAction(ticket, 'schedule')}
              onComplete={(ticket) => openAction(ticket, 'complete')}
              onReschedule={(ticket) => openAction(ticket, 'reschedule')}
            />
          </>
        )}
      </div>

      {selected && action ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
          role="dialog"
          aria-modal
        >
          <div
            className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-y-auto p-4"
            style={{
              backgroundColor: colors.BG_SECONDARY,
              borderRadius: RADIUS.lg,
            }}
          >
            <h2 className="text-lg font-bold" style={{ color: colors.TEXT_PRIMARY }}>
              {action === 'complete'
                ? t('screens.interventions.actionComplete')
                : action === 'reschedule'
                  ? t('screens.interventions.actionReschedule')
                  : t('screens.interventions.actionSchedule')}
            </h2>
            <p className="mt-1 text-sm font-semibold" style={{ color: colors.TEXT_PRIMARY }}>
              {selected.site_name}
            </p>
            <p className="text-sm" style={{ color: colors.TEXT_SECONDARY }}>
              {maintenanceTicketText(selected)}
            </p>

            {action !== 'complete' ? (
              <label className="mt-3 block text-sm font-medium" style={{ color: colors.TEXT_PRIMARY }}>
                {t('screens.interventions.dateLabel')}
                <input
                  type="date"
                  value={dateIso}
                  min={todayIso}
                  onChange={(e) => setDateIso(e.target.value)}
                  className="mt-1 w-full rounded-lg border px-3 py-2"
                  style={{ borderColor: colors.BORDER, backgroundColor: colors.BG_PRIMARY }}
                />
              </label>
            ) : null}

            <label className="mt-3 block text-sm font-medium" style={{ color: colors.TEXT_PRIMARY }}>
              {action === 'complete'
                ? t('screens.interventions.noteComplete')
                : action === 'reschedule'
                  ? t('screens.interventions.noteReschedule')
                  : t('screens.interventions.noteOptional')}
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                className="mt-1 w-full rounded-lg border px-3 py-2"
                style={{ borderColor: colors.BORDER, backgroundColor: colors.BG_PRIMARY }}
              />
            </label>

            {formError ? (
              <p className="mt-2 text-sm" style={{ color: colors.DANGER }}>
                {formError}
              </p>
            ) : null}

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={closePanel}
                disabled={pending}
                className="flex-1 rounded-lg py-3 text-sm font-semibold"
                style={{ backgroundColor: colors.BG_PRIMARY, color: colors.TEXT_SECONDARY }}
              >
                {t('screens.interventions.cancel')}
              </button>
              <PrimaryButton onClick={submitAction} disabled={pending} className="flex-1 py-3">
                {pending ? '…' : t('screens.interventions.confirm')}
              </PrimaryButton>
            </div>
          </div>
        </div>
      ) : null}
    </FormScrollLayout>
  );
}

function TicketSection({
  title,
  empty,
  tickets,
  onSelect,
  onSchedule,
  onComplete,
  onReschedule,
}: {
  title: string;
  empty: string;
  tickets: MaintenanceIntervention[];
  onSelect: (t: MaintenanceIntervention) => void;
  onSchedule: (t: MaintenanceIntervention) => void;
  onComplete: (t: MaintenanceIntervention) => void;
  onReschedule: (t: MaintenanceIntervention) => void;
}) {
  const { colors } = useThemeColors();
  const { t } = useTranslation();

  return (
    <section>
      <h2 className="mb-2 text-sm font-bold uppercase tracking-wide" style={{ color: colors.TEXT_SECONDARY }}>
        {title} ({tickets.length})
      </h2>
      {tickets.length === 0 ? (
        <p className="text-sm" style={{ color: colors.TEXT_SECONDARY }}>
          {empty}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {tickets.map((ticket) => {
            const day = parisDateFromScheduledAt(ticket.scheduled_at);
            return (
              <li
                key={ticket.id}
                className="rounded-xl border p-3"
                style={{
                  backgroundColor: colors.SETTINGS_SECTION_BG,
                  borderColor: colors.BORDER,
                  boxShadow: colors.CARD_SHADOW,
                }}
              >
                <button type="button" className="w-full text-left" onClick={() => onSelect(ticket)}>
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold" style={{ color: colors.TEXT_PRIMARY }}>
                      {ticket.site_name}
                    </p>
                    {ticket.urgent ? (
                      <span className="shrink-0 text-xs font-bold" style={{ color: colors.DANGER }}>
                        {t('screens.interventions.urgent')}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 text-sm" style={{ color: colors.TEXT_SECONDARY }}>
                    {maintenanceTicketText(ticket)}
                  </p>
                  {ticket.sujet_names.length > 0 ? (
                    <p className="mt-0.5 text-xs" style={{ color: colors.TEXT_SECONDARY }}>
                      {ticket.sujet_names.join(' · ')}
                    </p>
                  ) : null}
                  {day ? (
                    <p className="mt-1 text-xs font-medium capitalize" style={{ color: colors.PRIMARY }}>
                      {formatDayLabel(day)}
                    </p>
                  ) : (
                    <p className="mt-1 text-xs" style={{ color: colors.TEXT_SECONDARY }}>
                      {t('screens.interventions.unscheduled')}
                    </p>
                  )}
                </button>
                <div className="mt-2 flex flex-wrap gap-2">
                  {ticket.status === 'signalee' ? (
                    <ActionChip label={t('screens.interventions.actionSchedule')} onClick={() => onSchedule(ticket)} />
                  ) : null}
                  <ActionChip label={t('screens.interventions.actionComplete')} onClick={() => onComplete(ticket)} />
                  <ActionChip
                    label={t('screens.interventions.actionReschedule')}
                    onClick={() => onReschedule(ticket)}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function ActionChip({ label, onClick }: { label: string; onClick: () => void }) {
  const { colors } = useThemeColors();
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full px-3 py-1 text-xs font-semibold"
      style={{
        backgroundColor: colors.PRIMARY_MUTED,
        color: colors.PRIMARY,
      }}
    >
      {label}
    </button>
  );
}
