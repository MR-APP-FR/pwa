const LOCALE = 'fr-FR';

export function capitalizeFrench(text: string): string {
  if (!text) return text;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function toLocalDate(year: number, month: number, day: number): Date {
  return new Date(year, month - 1, day);
}

/** Format standard : JEUDI 4 JUIN (sans année) */
export function formatWeekdayDayMonth(date: Date): string {
  return `${formatWeekday(date)} ${formatDayMonth(date)}`;
}

export function formatWeekday(date: Date): string {
  return date.toLocaleDateString(LOCALE, { weekday: 'long' }).toUpperCase();
}

export function formatDayMonth(date: Date): string {
  const day = date.getDate();
  const month = date.toLocaleDateString(LOCALE, { month: 'long' }).toUpperCase();
  return `${day} ${month}`;
}

export function formatDayMonthYear(date: Date): string {
  return formatDayMonth(date);
}

export function formatDateLong(date: Date): string {
  return formatWeekdayDayMonth(date);
}

export function formatDateTime(date: Date): string {
  const timePart = date.toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' });
  return `${formatWeekdayDayMonth(date)} à ${timePart}`;
}

export function formatMissionDate(year: number, month: number, day: number): string {
  return formatWeekdayDayMonth(toLocalDate(year, month, day));
}

export function formatWeekRange(start: Date, end: Date): string {
  return `${formatDayMonth(start)} au ${formatDayMonth(end)}`;
}

export function formatPlanningWeekRange(start: Date): string {
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return `Semaine du ${formatDayMonth(start)} au ${formatDayMonth(end)}`;
}

export function formatPlanningDayLabel(date: Date): string {
  return formatWeekdayDayMonth(date);
}
