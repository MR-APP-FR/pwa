'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useThemeColors } from '../../hooks/useThemeColors';
import { useTranslation } from '../../hooks/useTranslation';
import { useStaffMessages } from '../../hooks/api/useStaffMessages';
import { usePlanning } from '../../hooks/api/usePlanning';
import { useSiteWeather } from '../../hooks/api/useSiteWeather';
import { useCurrentUser } from '../../hooks/api/useCurrentUser';
import { useWeatherBriefRead } from '../../hooks/useWeatherBriefRead';
import { useAppDate } from '../../hooks/useAppDate';
import { formatDateTime } from '../../lib/formatDate';
import { weatherBriefBody, weatherBriefTitle } from '../../lib/weather/encourageCopy';
import { markMessagesRead, ackMessage } from './actions';
import { PageHeader } from '../../components/layout/PageHeader';
import { FormScrollLayout } from '../../components/layout/FormScrollLayout';
import { FormPinnedPageHeader } from '../../components/layout/FormPinnedPageHeader';
import { RADIUS } from '../../constants/design';
import { WEATHER_BRIEF_MESSAGE_ID, type StaffMessageWithAck } from '../../database/types';

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function toIsoDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function MessageCard({ message }: { message: StaffMessageWithAck }) {
  const { colors } = useThemeColors();
  const { t } = useTranslation();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const isAppli = message.source === 'appli';
  const needsAck = message.require_ack && message.acked_at === null;
  const canAck = message.id > 0;

  const handleAck = () => {
    if (!canAck) return;
    setError(null);
    startTransition(async () => {
      const result = await ackMessage(message.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      queryClient.invalidateQueries({ queryKey: ['staff-messages'] });
    });
  };

  return (
    <div className="card-surface space-y-2 px-4 py-3.5">
      <div className="flex items-center justify-between gap-2">
        <span
          className="px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide"
          style={{
            borderRadius: RADIUS.xs,
            backgroundColor: isAppli ? colors.ACCENT_PURPLE_MUTED : colors.ACCENT_BLUE_MUTED,
            color: isAppli ? colors.ACCENT_PURPLE : colors.ACCENT_BLUE,
          }}
        >
          {isAppli ? t('screens.messages.sourceAppli') : t('screens.messages.sourceBureau')}
        </span>
        <span className="text-xs" style={{ color: colors.TEXT_MUTED }}>
          {formatDateTime(new Date(message.publie_at))}
        </span>
      </div>

      <h3 className="text-base font-bold" style={{ color: colors.TEXT_PRIMARY, fontFamily: 'var(--font-display)' }}>
        {message.titre}
      </h3>
      <p className="text-sm leading-relaxed" style={{ color: colors.TEXT_SECONDARY }}>
        {message.corps}
      </p>

      {message.require_ack && canAck && (
        <div className="pt-1">
          {needsAck ? (
            <button
              type="button"
              onClick={handleAck}
              disabled={pending}
              className="min-h-[44px] w-full rounded-xl border py-2.5 text-sm font-semibold"
              style={{ borderColor: colors.PRIMARY, backgroundColor: colors.PRIMARY_MUTED, color: colors.PRIMARY, borderRadius: RADIUS.sm }}
            >
              {pending ? '…' : t('screens.messages.ackButton')}
            </button>
          ) : (
            <p className="text-xs font-semibold" style={{ color: colors.ACCENT_GREEN }}>
              {t('screens.messages.ackedLabel')}
            </p>
          )}
        </div>
      )}

      {error && (
        <p className="text-xs" style={{ color: colors.DANGER }}>
          {error}
        </p>
      )}
    </div>
  );
}

export default function MessagesPage() {
  const { colors } = useThemeColors();
  const { t } = useTranslation();
  const { data: messages } = useStaffMessages();
  const queryClient = useQueryClient();
  const markedRef = useRef<Set<number>>(new Set());

  const { today, weekYear, weekMonth } = useAppDate();
  const { data: currentUser } = useCurrentUser();
  const { data: planningData } = usePlanning({ year: weekYear, month: weekMonth });
  const todayIso = toIsoDate(today);
  const todayMission = useMemo(
    () =>
      (planningData?.planning ?? []).find(
        (m) =>
          m.day === today.getDate() &&
          m.month === today.getMonth() + 1 &&
          m.year === today.getFullYear(),
      ) ?? null,
    [planningData?.planning, today],
  );
  const { data: todayWeather } = useSiteWeather(
    todayMission?.site_id ?? null,
    todayMission ? todayIso : null,
  );
  const { isRead: weatherBriefRead, markRead: markWeatherBriefRead } = useWeatherBriefRead(
    currentUser?.user.id ?? null,
    todayWeather ? todayIso : null,
    todayMission?.site_id ?? null,
  );

  const weatherMessage = useMemo<StaffMessageWithAck | null>(() => {
    if (!todayWeather || !todayMission) return null;
    const published = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 8, 0, 0);
    return {
      id: WEATHER_BRIEF_MESSAGE_ID,
      titre: weatherBriefTitle(todayWeather, t),
      corps: weatherBriefBody(todayWeather, t),
      source: 'appli',
      require_ack: false,
      publie_at: published.toISOString(),
      expire_at: null,
      created_at: todayWeather.fetched_at,
      read_at: weatherBriefRead ? published.toISOString() : null,
      acked_at: null,
    };
  }, [todayWeather, todayMission, today, t, weatherBriefRead]);

  const displayMessages = useMemo(() => {
    const list = messages ?? [];
    if (!weatherMessage) return list;
    return [weatherMessage, ...list];
  }, [messages, weatherMessage]);

  useEffect(() => {
    if (!messages) return;
    const unread = messages.filter(
      (m) => m.id > 0 && m.read_at === null && !markedRef.current.has(m.id),
    );
    if (unread.length === 0) return;
    for (const m of unread) markedRef.current.add(m.id);
    (async () => {
      const result = await markMessagesRead(unread.map((m) => m.id));
      if (result.ok) {
        queryClient.invalidateQueries({ queryKey: ['staff-messages'] });
      }
    })();
  }, [messages, queryClient]);

  useEffect(() => {
    if (!weatherMessage || weatherBriefRead) return;
    markWeatherBriefRead();
  }, [weatherMessage, weatherBriefRead, markWeatherBriefRead]);

  return (
    <FormScrollLayout>
      <div style={{ backgroundColor: colors.BG_SECONDARY }}>
        <FormPinnedPageHeader>
          <PageHeader pin="static" accent="purple" title={t('screens.messages.title')} showBack />
        </FormPinnedPageHeader>

        <div className="space-y-2.5 px-4 py-4">
          {displayMessages.length === 0 && messages && (
            <p className="px-1 text-sm" style={{ color: colors.TEXT_SECONDARY }}>
              {t('screens.messages.empty')}
            </p>
          )}
          {displayMessages.map((m) => (
            <MessageCard key={m.id} message={m} />
          ))}
        </div>
      </div>
    </FormScrollLayout>
  );
}
