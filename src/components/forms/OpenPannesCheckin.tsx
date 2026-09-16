'use client';

import { Check, Wrench } from 'lucide-react';
import { useThemeColors } from '../../hooks/useThemeColors';
import { useTranslation } from '../../hooks/useTranslation';
import type { OpenSiteIntervention, PanneCheckinAnswer } from '../../database/types/intervention.types';
import { RADIUS } from '../../constants/design';

interface OpenPannesCheckinProps {
  tickets: OpenSiteIntervention[];
  answers: Record<number, PanneCheckinAnswer | undefined>;
  onAnswer: (ticketId: number, answer: PanneCheckinAnswer) => void;
  error?: boolean;
}

function formatReportedAt(iso: string, locale: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(locale === 'en' ? 'en-GB' : 'fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Europe/Paris',
  });
}

export function openPanneTicketHeadline(ticket: OpenSiteIntervention): string {
  if (ticket.sujet_names.length > 0) return ticket.sujet_names.join(' · ');
  const other = ticket.pannes_autre?.trim();
  if (other) return other;
  return ticket.description?.trim() ?? '';
}

function ticketSubline(ticket: OpenSiteIntervention): string | null {
  if (ticket.sujet_names.length === 0) return null;
  const description = ticketDescription(ticket);
  if (!description) return null;
  const headline = ticket.sujet_names.join(' · ');
  if (description === headline) return null;
  return description;
}

function ticketDescription(ticket: OpenSiteIntervention): string | null {
  const other = ticket.pannes_autre?.trim();
  if (other) return other;
  const desc = ticket.description?.trim();
  return desc || null;
}

function answerButtonStyle(
  selected: boolean,
  tone: 'still' | 'resolved',
  colors: ReturnType<typeof useThemeColors>['colors'],
  unansweredError: boolean,
) {
  if (!selected) {
    return {
      borderRadius: RADIUS.md,
      backgroundColor: colors.BG_SECONDARY,
      color: colors.TEXT_SECONDARY,
      boxShadow: `inset 0 0 0 1.5px ${unansweredError ? colors.DANGER : colors.BORDER}`,
      opacity: 0.72,
    } as const;
  }
  if (tone === 'resolved') {
    return {
      borderRadius: RADIUS.md,
      backgroundColor: colors.ACCENT_GREEN,
      color: colors.TEXT_INVERSE,
      boxShadow: `0 0 0 3px ${colors.ACCENT_GREEN}33`,
      opacity: 1,
    } as const;
  }
  return {
    borderRadius: RADIUS.md,
    backgroundColor: colors.ACCENT_ORANGE,
    color: colors.TEXT_INVERSE,
    boxShadow: `0 0 0 3px ${colors.ACCENT_ORANGE}33`,
    opacity: 1,
  } as const;
}

export function OpenPannesCheckin({ tickets, answers, onAnswer, error }: OpenPannesCheckinProps) {
  const { colors } = useThemeColors();
  const { t, language } = useTranslation();

  if (tickets.length === 0) return null;

  const answeredCount = tickets.filter((ticket) => answers[ticket.id] != null).length;
  const help = t('forms.opening.panneCheckin.help');

  return (
    <div className="space-y-3">
      {help ? (
        <p className="px-0.5 text-sm leading-relaxed" style={{ color: colors.TEXT_SECONDARY }}>
          {help}
        </p>
      ) : null}

      <div
        className="flex items-center justify-between gap-3 px-0.5"
        style={{ color: colors.TEXT_SECONDARY }}
      >
        <div
          className="h-1.5 flex-1 overflow-hidden rounded-full"
          style={{ backgroundColor: colors.BORDER }}
          aria-hidden
        >
          <div
            className="h-full rounded-full transition-all duration-200"
            style={{
              width: `${tickets.length === 0 ? 0 : (answeredCount / tickets.length) * 100}%`,
              backgroundColor:
                answeredCount === tickets.length ? colors.ACCENT_GREEN : colors.ACCENT_ORANGE,
            }}
          />
        </div>
        <span
          className="shrink-0 text-xs font-bold tabular-nums"
          style={{
            color: answeredCount === tickets.length ? colors.ACCENT_GREEN : colors.TEXT_SECONDARY,
            fontFamily: 'var(--font-display)',
          }}
        >
          {answeredCount}/{tickets.length}
        </span>
      </div>

      {error && (
        <p className="px-1 text-xs font-semibold" style={{ color: colors.ACCENT_RED }}>
          {t('forms.opening.panneCheckin.errorIncomplete')}
        </p>
      )}

      <div className="space-y-2.5">
        {tickets.map((ticket) => {
          const answer = answers[ticket.id];
          const unanswered = answer == null;
          const headline = openPanneTicketHeadline(ticket);
          const subline = ticketSubline(ticket);
          const reportedLabel = formatReportedAt(ticket.reported_at, language);
          const cardBorder =
            answer === 'resolved'
              ? colors.ACCENT_GREEN
              : answer === 'still'
                ? colors.ACCENT_ORANGE
                : error && unanswered
                  ? colors.DANGER
                  : colors.BORDER;

          return (
            <div
              key={ticket.id}
              className="card-surface space-y-3 px-3.5 py-3"
              style={{
                borderRadius: RADIUS.lg,
                boxShadow: `inset 0 0 0 ${answer ? 2 : 1}px ${cardBorder}`,
                backgroundColor:
                  answer === 'resolved'
                    ? colors.ACCENT_GREEN + '12'
                    : answer === 'still'
                      ? colors.ACCENT_ORANGE + '12'
                      : undefined,
              }}
            >
              <div className="min-w-0 space-y-0.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <p
                    className="min-w-0 flex-1 text-sm font-bold leading-snug"
                    style={{ color: colors.TEXT_PRIMARY, fontFamily: 'var(--font-display)' }}
                  >
                    {headline}
                  </p>
                  {ticket.urgent && (
                    <span
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: colors.ACCENT_RED }}
                      title={t('forms.opening.panneCheckin.urgent')}
                      aria-label={t('forms.opening.panneCheckin.urgent')}
                    />
                  )}
                  {ticket.status === 'planifiee' && (
                    <span
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: colors.PRIMARY }}
                      title={t('forms.opening.panneCheckin.scheduled')}
                      aria-label={t('forms.opening.panneCheckin.scheduled')}
                    />
                  )}
                </div>
                {subline && (
                  <p className="text-xs leading-snug" style={{ color: colors.TEXT_SECONDARY }}>
                    {subline}
                  </p>
                )}
                {reportedLabel && (
                  <p className="text-[11px] leading-snug" style={{ color: colors.TEXT_SECONDARY }}>
                    {t('forms.opening.panneCheckin.reportedAt', { date: reportedLabel })}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => onAnswer(ticket.id, 'still')}
                  className="inline-flex min-h-12 items-center justify-center gap-1.5 px-2 py-2.5 text-xs font-bold whitespace-nowrap transition-all active:scale-[0.98]"
                  style={{
                    ...answerButtonStyle(answer === 'still', 'still', colors, Boolean(error && unanswered)),
                    fontFamily: 'var(--font-display)',
                  }}
                  aria-pressed={answer === 'still'}
                >
                  <Wrench size={16} className="shrink-0" strokeWidth={2.5} aria-hidden />
                  <span>{t('forms.opening.panneCheckin.stillBroken')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => onAnswer(ticket.id, 'resolved')}
                  className="inline-flex min-h-12 items-center justify-center gap-1.5 px-2 py-2.5 text-xs font-bold whitespace-nowrap transition-all active:scale-[0.98]"
                  style={{
                    ...answerButtonStyle(
                      answer === 'resolved',
                      'resolved',
                      colors,
                      Boolean(error && unanswered),
                    ),
                    fontFamily: 'var(--font-display)',
                  }}
                  aria-pressed={answer === 'resolved'}
                >
                  <Check size={17} className="shrink-0" strokeWidth={3} aria-hidden />
                  <span>{t('forms.opening.panneCheckin.resolved')}</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function allPanneCheckinsAnswered(
  tickets: OpenSiteIntervention[],
  answers: Record<number, PanneCheckinAnswer | undefined>,
): boolean {
  if (tickets.length === 0) return true;
  return tickets.every((ticket) => answers[ticket.id] != null);
}

export function resolvedInterventionIds(
  tickets: OpenSiteIntervention[],
  answers: Record<number, PanneCheckinAnswer | undefined>,
): number[] {
  return tickets.filter((ticket) => answers[ticket.id] === 'resolved').map((ticket) => ticket.id);
}

export function excludedSujetIdsFromStillOpen(
  tickets: OpenSiteIntervention[],
  answers: Record<number, PanneCheckinAnswer | undefined>,
): number[] {
  const ids = new Set<number>();
  for (const ticket of tickets) {
    if (answers[ticket.id] !== 'still') continue;
    for (const sujetId of ticket.sujet_ids) {
      ids.add(sujetId);
    }
  }
  return [...ids];
}

export function shouldExcludeAutrePanne(
  tickets: OpenSiteIntervention[],
  answers: Record<number, PanneCheckinAnswer | undefined>,
): boolean {
  return tickets.some(
    (ticket) => answers[ticket.id] === 'still' && ticket.sujet_ids.length === 0,
  );
}
