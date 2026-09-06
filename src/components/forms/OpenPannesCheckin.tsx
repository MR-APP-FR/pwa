'use client';

import { Wrench } from 'lucide-react';
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

export function OpenPannesCheckin({ tickets, answers, onAnswer, error }: OpenPannesCheckinProps) {
  const { colors } = useThemeColors();
  const { t, language } = useTranslation();

  if (tickets.length === 0) return null;

  return (
    <div className="space-y-3">
      <div
        className="flex items-start gap-3 px-3.5 py-3"
        style={{
          backgroundColor: colors.ACCENT_ORANGE + '18',
          borderRadius: RADIUS.xl,
          border: `1px solid ${error ? colors.ACCENT_RED : colors.ACCENT_ORANGE + '40'}`,
        }}
      >
        <span className="mt-0.5 shrink-0 text-[22px] leading-none" aria-hidden>
          🔧
        </span>
        <div className="min-w-0 flex-1">
          {t('forms.opening.panneCheckin.title') ? (
            <p
              className="text-sm font-bold"
              style={{ color: colors.ACCENT_ORANGE, fontFamily: 'var(--font-display)' }}
            >
              {t('forms.opening.panneCheckin.title')}
            </p>
          ) : null}
          {t('forms.opening.panneCheckin.help') ? (
            <p
              className={`whitespace-pre-line text-sm leading-relaxed ${
                t('forms.opening.panneCheckin.title') ? 'mt-0.5' : ''
              }`}
              style={{ color: colors.TEXT_PRIMARY }}
            >
              {t('forms.opening.panneCheckin.help')}
            </p>
          ) : null}
        </div>
      </div>

      {error && (
        <p className="px-1 text-xs font-semibold" style={{ color: colors.ACCENT_RED }}>
          {t('forms.opening.panneCheckin.errorIncomplete')}
        </p>
      )}

      <div className="space-y-2">
        {tickets.map((ticket) => {
          const answer = answers[ticket.id];
          const headline = openPanneTicketHeadline(ticket);
          const subline = ticketSubline(ticket);
          const reportedLabel = formatReportedAt(ticket.reported_at, language);

          return (
            <div
              key={ticket.id}
              className="card-surface space-y-2 px-3 py-2.5"
              style={{
                borderRadius: RADIUS.lg,
                boxShadow:
                  answer === 'resolved'
                    ? `inset 0 0 0 2px ${colors.ACCENT_GREEN}`
                    : answer === 'still'
                      ? `inset 0 0 0 2px ${colors.ACCENT_ORANGE}`
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
                      className="shrink-0 rounded-full px-1.5 py-px text-[9px] font-bold uppercase tracking-wide"
                      style={{
                        backgroundColor: colors.ACCENT_RED_MUTED,
                        color: colors.ACCENT_RED,
                      }}
                    >
                      {t('forms.opening.panneCheckin.urgent')}
                    </span>
                  )}
                  {ticket.status === 'planifiee' && (
                    <span
                      className="shrink-0 rounded-full px-1.5 py-px text-[9px] font-bold uppercase tracking-wide"
                      style={{
                        backgroundColor: colors.PRIMARY + '18',
                        color: colors.PRIMARY,
                      }}
                    >
                      {t('forms.opening.panneCheckin.scheduled')}
                    </span>
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

              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => onAnswer(ticket.id, 'still')}
                  className="inline-flex min-h-9 items-center justify-center gap-1 rounded-lg px-2 py-2 text-[11px] font-bold whitespace-nowrap transition-all active:scale-[0.98]"
                  style={{
                    borderRadius: RADIUS.sm,
                    backgroundColor:
                      answer === 'still' ? colors.ACCENT_ORANGE_MUTED : colors.BG_SECONDARY,
                    color: answer === 'still' ? colors.ACCENT_ORANGE : colors.TEXT_PRIMARY,
                    boxShadow:
                      answer === 'still'
                        ? `inset 0 0 0 2px ${colors.ACCENT_ORANGE}`
                        : `inset 0 0 0 1px ${colors.BORDER}`,
                    fontFamily: 'var(--font-display)',
                  }}
                  aria-pressed={answer === 'still'}
                >
                  <Wrench size={14} className="shrink-0" aria-hidden />
                  <span>{t('forms.opening.panneCheckin.stillBroken')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => onAnswer(ticket.id, 'resolved')}
                  className="inline-flex min-h-9 items-center justify-center gap-1 rounded-lg px-2 py-2 text-[11px] font-bold whitespace-nowrap transition-all active:scale-[0.98]"
                  style={{
                    borderRadius: RADIUS.sm,
                    backgroundColor:
                      answer === 'resolved' ? colors.ACCENT_GREEN_MUTED : colors.BG_SECONDARY,
                    color: answer === 'resolved' ? colors.ACCENT_GREEN : colors.TEXT_PRIMARY,
                    boxShadow:
                      answer === 'resolved'
                        ? `inset 0 0 0 2px ${colors.ACCENT_GREEN}`
                        : `inset 0 0 0 1px ${colors.BORDER}`,
                    fontFamily: 'var(--font-display)',
                  }}
                  aria-pressed={answer === 'resolved'}
                >
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
