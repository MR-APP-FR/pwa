'use client';

import { useMemo } from 'react';
import { SITE_TIME_RANGES, SITE_TIME_RANGES_FULL } from '../constants/siteHours';

function getMonday(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

/** Date / bornes de semaine utilisées par l'accueil, le planning et les missions. */
export function useAppDate() {
  return useMemo(() => {
    const today = new Date();
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
      siteTimeRanges: SITE_TIME_RANGES,
      siteTimeRangesFull: SITE_TIME_RANGES_FULL,
    };
  }, []);
}
