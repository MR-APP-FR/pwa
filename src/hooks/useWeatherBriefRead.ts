'use client';

import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

function storageKey(userId: number, dateIso: string, siteId: number) {
  return `pwa:weather-brief-read:${userId}:${dateIso}:${siteId}`;
}

function weatherBriefReadQueryKey(userId: number | null, dateIso: string | null, siteId: number | null) {
  return ['weather-brief-read', userId, dateIso, siteId] as const;
}

function readFromStorage(key: string | null): boolean {
  if (typeof window === 'undefined' || !key) return false;
  return window.localStorage.getItem(key) === '1';
}

/** Lecture locale du brief météo du jour (badge Messages + popup accueil). */
export function useWeatherBriefRead(
  userId: number | null,
  dateIso: string | null,
  siteId: number | null,
) {
  const queryClient = useQueryClient();
  const enabled = userId != null && Boolean(dateIso) && siteId != null;
  const key = enabled ? storageKey(userId, dateIso!, siteId!) : null;

  const { data: isRead = false } = useQuery({
    queryKey: weatherBriefReadQueryKey(userId, dateIso, siteId),
    enabled,
    queryFn: () => readFromStorage(key),
    initialData: () => readFromStorage(key),
    staleTime: Infinity,
  });

  const markRead = useCallback(() => {
    if (!key || userId == null || !dateIso || siteId == null) return;
    window.localStorage.setItem(key, '1');
    queryClient.setQueryData(weatherBriefReadQueryKey(userId, dateIso, siteId), true);
  }, [key, userId, dateIso, siteId, queryClient]);

  return { isRead, markRead };
}
