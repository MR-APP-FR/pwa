'use client';

import { useMemo } from 'react';
import { useDemoStore } from '../stores/demoStore';
import { MOCK_TIME_RANGES, MOCK_TIME_RANGES_FULL } from '../constants/mock';

function getMonday(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

export function useDemoDate() {
  const overrideDateIso = useDemoStore((s) => s.overrideDateIso);

  return useMemo(() => {
    const today = overrideDateIso ? new Date(overrideDateIso + 'T12:00:00') : new Date();

    const weekStart = getMonday(today);

    const nextWeekStart = new Date(weekStart);
    nextWeekStart.setDate(weekStart.getDate() + 7);

    const nextWeekEnd = new Date(nextWeekStart);
    nextWeekEnd.setDate(nextWeekStart.getDate() + 6);

    return {
      today,
      weekYear: today.getFullYear(),
      weekMonth: today.getMonth() + 1,
      weekStart,
      nextWeekStart,
      nextWeekEnd,
      mockTimeRanges: MOCK_TIME_RANGES,
      mockTimeRangesFull: MOCK_TIME_RANGES_FULL,
    };
  }, [overrideDateIso]);
}
