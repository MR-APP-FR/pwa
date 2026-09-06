'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useThemeColors } from '../../hooks/useThemeColors';
import { useTranslation } from '../../hooks/useTranslation';
import { useStaffMessages } from '../../hooks/api/useStaffMessages';
import { usePlanning } from '../../hooks/api/usePlanning';
import { useSiteWeather } from '../../hooks/api/useSiteWeather';
import { useCurrentUser } from '../../hooks/api/useCurrentUser';
import { useWeatherBriefRead } from '../../hooks/useWeatherBriefRead';
import { useAppDate } from '../../hooks/useAppDate';
import { weatherBriefBody, weatherBriefTitle } from '../../lib/weather/encourageCopy';
import { toIsoDateString } from '../../lib/parisTime';
import { markMessagesRead } from './actions';
import { PageHeader } from '../../components/layout/PageHeader';
import { FormScrollLayout } from '../../components/layout/FormScrollLayout';
import { FormPinnedPageHeader } from '../../components/layout/FormPinnedPageHeader';
import { MessagesChatThread } from '../../components/messages/MessagesChatThread';
import {
  WEATHER_BRIEF_MESSAGE_ID,
  type StaffMessageWithAck,
} from '../../database/types';
import { INBOX_CONVERSATION, isStaffInboxMessage } from './conversations';

export default function MessagesPage() {
  const { colors } = useThemeColors();
  const { t } = useTranslation();
  const { data: messages } = useStaffMessages();
  const queryClient = useQueryClient();
  const markedRef = useRef<Set<number>>(new Set());

  const { today, weekYear, weekMonth } = useAppDate();
  const { data: currentUser } = useCurrentUser();
  const { data: planningData } = usePlanning({ year: weekYear, month: weekMonth });
  const todayIso = toIsoDateString(today);
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
      channel: 'staff',
      require_ack: false,
      publie_at: published.toISOString(),
      expire_at: null,
      created_at: todayWeather.fetched_at,
      site_ids: [todayMission.site_id],
      user_ids: [],
      read_at: weatherBriefRead ? published.toISOString() : null,
      acked_at: null,
    };
  }, [todayWeather, todayMission, today, t, weatherBriefRead]);

  const inboxMessages = useMemo(() => {
    const list = (messages ?? []).filter(isStaffInboxMessage);
    if (!weatherMessage) return list;
    return [weatherMessage, ...list];
  }, [messages, weatherMessage]);

  useEffect(() => {
    const unread = inboxMessages.filter(
      (m) => m.id > 0 && m.read_at === null && !markedRef.current.has(m.id),
    );
    if (unread.length > 0) {
      for (const m of unread) markedRef.current.add(m.id);
      (async () => {
        const result = await markMessagesRead(unread.map((m) => m.id));
        if (result.ok) {
          queryClient.invalidateQueries({ queryKey: ['staff-messages'] });
        }
      })();
    }
    if (weatherMessage && inboxMessages.some((m) => m.id === WEATHER_BRIEF_MESSAGE_ID) && !weatherBriefRead) {
      markWeatherBriefRead();
    }
  }, [inboxMessages, queryClient, weatherMessage, weatherBriefRead, markWeatherBriefRead]);

  return (
    <FormScrollLayout>
      <div
        className="flex flex-col"
        style={{
          backgroundColor: colors.BG_SECONDARY,
          height: 'calc(100dvh - 7.5rem)',
        }}
      >
        <FormPinnedPageHeader>
          <PageHeader pin="static" accent="purple" title={t('screens.messages.title')} showBack />
        </FormPinnedPageHeader>

        <MessagesChatThread conversation={INBOX_CONVERSATION} messages={inboxMessages} />
      </div>
    </FormScrollLayout>
  );
}
