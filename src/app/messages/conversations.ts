import { PARIS_TIME_ZONE } from '../../lib/parisTime';
import type { Groupe, Site, StaffMessageWithAck } from '../../database/types';

export type ConversationKind = 'tous' | 'zone' | 'notifications';

export const NOTIFICATIONS_KEY = 'notifications';

export interface Conversation {
  key: string;
  kind: ConversationKind;
  label: string;
  siteIds: number[];
  pinned: boolean;
}

export function zoneConversationKey(groupId: number): string {
  return `zone:${groupId}`;
}

export function matchMessageConversationKey(
  message: { site_ids: number[]; source?: 'bureau' | 'appli' },
  sites: Site[],
): string {
  if (message.source === 'appli') return NOTIFICATIONS_KEY;
  if (!message.site_ids || message.site_ids.length === 0) return 'tous';

  const zoneKeys = new Set(
    message.site_ids.map((id) => {
      const site = sites.find((s) => s.id === id);
      return site ? zoneConversationKey(site.group_id) : null;
    }),
  );
  if (zoneKeys.size === 1) {
    const key = [...zoneKeys][0];
    if (key) return key;
  }
  return 'tous';
}

export function buildEmployeeConversations(
  sites: Site[],
  groupes: Groupe[],
  relevantSiteIds: Set<number>,
  extraKeys: Set<string>,
): Conversation[] {
  const groupOrder = new Map<number, number>();
  groupes.forEach((g, i) => groupOrder.set(g.id, i));

  const zoneIds = new Set<number>();
  for (const site of sites) {
    if (relevantSiteIds.has(site.id)) zoneIds.add(site.group_id);
  }
  for (const key of extraKeys) {
    if (key === 'tous' || key === NOTIFICATIONS_KEY) continue;
    if (key.startsWith('zone:')) {
      const id = Number(key.slice(5));
      if (Number.isFinite(id)) zoneIds.add(id);
    }
  }

  const zoneConvs: Conversation[] = [...zoneIds].flatMap((groupId) => {
    const groupe = groupes.find((g) => g.id === groupId);
    if (!groupe) return [];
    return [
      {
        key: zoneConversationKey(groupId),
        kind: 'zone' as const,
        label: groupe.name,
        siteIds: sites.filter((s) => s.group_id === groupId).map((s) => s.id),
        pinned: false,
      },
    ];
  });

  zoneConvs.sort((a, b) => {
    const idA = Number(a.key.slice(5));
    const idB = Number(b.key.slice(5));
    return (groupOrder.get(idA) ?? 99) - (groupOrder.get(idB) ?? 99);
  });

  return [
    { key: 'tous', kind: 'tous', label: 'Tous', siteIds: [], pinned: true },
    {
      key: NOTIFICATIONS_KEY,
      kind: 'notifications',
      label: 'Notifications',
      siteIds: [],
      pinned: true,
    },
    ...zoneConvs,
  ];
}

export function messagesByConversation(
  messages: StaffMessageWithAck[],
  sites: Site[],
): Map<string, StaffMessageWithAck[]> {
  const map = new Map<string, StaffMessageWithAck[]>();
  for (const message of messages) {
    const key = matchMessageConversationKey(message, sites);
    const list = map.get(key) ?? [];
    list.push(message);
    map.set(key, list);
  }
  return map;
}

export function lastMessage(list: StaffMessageWithAck[] | undefined): StaffMessageWithAck | undefined {
  if (!list || list.length === 0) return undefined;
  return list.reduce((a, b) => (a.publie_at > b.publie_at ? a : b));
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

export function formatChatListTime(iso: string): string {
  const day = messageDayIso(iso);
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: PARIS_TIME_ZONE }).format(new Date());
  if (day === today) return formatChatClock(iso);
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayIso = new Intl.DateTimeFormat('en-CA', { timeZone: PARIS_TIME_ZONE }).format(yesterday);
  if (day === yesterdayIso) return 'Hier';
  return new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'short',
    timeZone: PARIS_TIME_ZONE,
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

export function hashKey(key: string, modulo: number): number {
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) | 0;
  return Math.abs(hash) % modulo;
}

export function conversationInitials(label: string): string {
  const parts = label.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
}

export function isMessageUnread(message: StaffMessageWithAck): boolean {
  return message.require_ack ? message.acked_at === null : message.read_at === null;
}
