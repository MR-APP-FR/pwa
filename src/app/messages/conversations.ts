import { PARIS_TIME_ZONE } from '../../lib/parisTime';
import type { StaffMessageWithAck } from '../../database/types';

export type ConversationKind = 'inbox';

export interface Conversation {
  key: string;
  kind: ConversationKind;
  label: string;
  siteIds: number[];
  pinned: boolean;
}

/** Boîte unique côté PWA : tous les messages staff visibles, sans split par zone. */
export const INBOX_CONVERSATION: Conversation = {
  key: 'inbox',
  kind: 'inbox',
  label: 'Messages',
  siteIds: [],
  pinned: true,
};

/** Messages affichés dans la boîte staff (canal staff uniquement). */
export function isStaffInboxMessage(message: {
  channel?: 'staff' | 'bureau' | 'cr_auto';
}): boolean {
  return !message.channel || message.channel === 'staff';
}

/** Plus récent en premier : canal unidirectionnel, le dernier reçu est visible sans scroll. */
export function reverseChronological(messages: StaffMessageWithAck[]): StaffMessageWithAck[] {
  return [...messages].sort(
    (a, b) => new Date(b.publie_at).getTime() - new Date(a.publie_at).getTime(),
  );
}

export function messageDayIso(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: PARIS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso));
}

export function formatChatClock(iso: string): string {
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: PARIS_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

export function formatDaySeparator(dateIso: string): string {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: PARIS_TIME_ZONE }).format(new Date());
  if (dateIso === today) return "Aujourd'hui";
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayIso = new Intl.DateTimeFormat('en-CA', { timeZone: PARIS_TIME_ZONE }).format(yesterday);
  if (dateIso === yesterdayIso) return 'Hier';
  return new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: PARIS_TIME_ZONE,
  }).format(new Date(`${dateIso}T12:00:00`));
}
