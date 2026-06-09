const LOCALE = 'fr-FR';

export function capitalizeFrench(text: string): string {
  if (!text) return text;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function toLocalDate(year: number, month: number, day: number): Date {
  return new Date(year, month - 1, day);
}

export function formatWeekday(date: Date): string {
  return capitalizeFrench(date.toLocaleDateString(LOCALE, { weekday: 'long' }));
}

export function formatDayMonth(date: Date): string {
  return date.toLocaleDateString(LOCALE, { day: 'numeric', month: 'long' });
}

export function formatDayMonthYear(date: Date): string {
  return date.toLocaleDateString(LOCALE, { day: 'numeric', month: 'long', year: 'numeric' });
}

export function formatWeekdayDayMonth(date: Date): string {
  return capitalizeFrench(
    date.toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'long' }),
  );
}

export function formatDateLong(date: Date): string {
  return capitalizeFrench(
    date.toLocaleDateString(LOCALE, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }),
  );
}

export function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat(LOCALE, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function formatMissionDate(year: number, month: number, day: number): string {
  return formatDayMonthYear(toLocalDate(year, month, day));
}

export function formatWeekRange(start: Date, end: Date): string {
  return `${formatDayMonth(start)} au ${formatDayMonthYear(end)}`;
}

export function formatPlanningWeekRange(start: Date): string {
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return `Semaine du ${formatDayMonth(start)} au ${formatDayMonthYear(end)}`;
}

export function formatPlanningDayLabel(date: Date): string {
  return `${formatWeekday(date)} ${formatDayMonth(date)}`;
}
