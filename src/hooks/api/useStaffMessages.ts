'use client';

import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from '@tanstack/react-query';
import { createClient } from '../../lib/supabase/client';
import { useCurrentUser } from './useCurrentUser';
import type { StaffMessageWithAck } from '../../database/types';
import { PLANNING_ASSIGNED_MESSAGE_TITLE } from '../../database/types';

export const STAFF_MESSAGES_PAGE_SIZE = 25;
export const staffMessagesQueryKey = (employeeId: number | null) =>
  ['staff-messages', employeeId] as const;
export const staffMessageBadgesQueryKey = (employeeId: number | null) =>
  ['staff-message-badges', employeeId] as const;

export type StaffMessageBadges = {
  unread_staff: number;
  unread_planning_assigned: number;
};

type MessagePage = {
  messages: StaffMessageWithAck[];
  /** Curseur pour la page suivante (publie_at du plus ancien de la page). */
  nextCursor: string | null;
};

const MESSAGE_SELECT =
  'id, titre, corps, source, channel, require_ack, publie_at, expire_at, created_at, site_ids, user_ids';

function isUnread(m: Pick<StaffMessageWithAck, 'require_ack' | 'read_at' | 'acked_at'>): boolean {
  return m.require_ack ? m.acked_at === null : m.read_at === null;
}

async function fetchMessagePage(
  employeeId: number,
  cursor: string | null,
): Promise<MessagePage> {
  const supabase = createClient();

  let messagesQuery = supabase
    .from('staff_message')
    .select(MESSAGE_SELECT)
    .eq('channel', 'staff')
    .order('publie_at', { ascending: false })
    .limit(STAFF_MESSAGES_PAGE_SIZE);

  if (cursor) {
    messagesQuery = messagesQuery.lt('publie_at', cursor);
  }

  const { data: messages, error } = await messagesQuery;
  if (error) throw new Error(`useStaffMessages fetch failed: ${error.message}`);

  const rows = (messages ?? []).filter((m) => m.channel === 'staff');
  const ids = rows.map((m) => m.id);

  const acksPromise =
    ids.length === 0
      ? Promise.resolve({ data: [] as { message_id: number; read_at: string | null; acked_at: string | null }[], error: null })
      : supabase
          .from('staff_message_ack')
          .select('message_id, read_at, acked_at')
          .eq('user_id', employeeId)
          .in('message_id', ids);

  const { data: acks, error: ackError } = await acksPromise;
  if (ackError) throw new Error(`useStaffMessages ack fetch failed: ${ackError.message}`);

  const ackByMessage = new Map((acks ?? []).map((a) => [a.message_id, a]));
  const merged: StaffMessageWithAck[] = rows.map((m) => {
    const ack = ackByMessage.get(m.id);
    return {
      ...m,
      site_ids: m.site_ids ?? [],
      user_ids: m.user_ids ?? [],
      channel: 'staff' as const,
      read_at: ack?.read_at ?? null,
      acked_at: ack?.acked_at ?? null,
    };
  });

  const nextCursor =
    merged.length >= STAFF_MESSAGES_PAGE_SIZE
      ? merged[merged.length - 1]?.publie_at ?? null
      : null;

  return { messages: merged, nextCursor };
}

/** Inbox paginée (plus récents d’abord). */
export function useStaffMessagesInfinite() {
  const { data: currentUser } = useCurrentUser();
  const employeeId = currentUser?.user.id ?? null;

  return useInfiniteQuery({
    queryKey: staffMessagesQueryKey(employeeId),
    enabled: employeeId !== null,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      if (employeeId === null) {
        return { messages: [] as StaffMessageWithAck[], nextCursor: null };
      }
      return fetchMessagePage(employeeId, pageParam);
    },
    getNextPageParam: (last) => last.nextCursor,
    staleTime: 30 * 1000,
  });
}

/** Liste plate des pages chargées (écran /messages). */
export function useStaffMessagesList(): {
  messages: StaffMessageWithAck[];
  isLoading: boolean;
  isFetchingNextPage: boolean;
  hasNextPage: boolean;
  fetchNextPage: () => void;
} {
  const query = useStaffMessagesInfinite();
  const messages = (query.data?.pages ?? []).flatMap((p) => p.messages);
  return {
    messages,
    isLoading: query.isLoading,
    isFetchingNextPage: query.isFetchingNextPage,
    hasNextPage: Boolean(query.hasNextPage),
    fetchNextPage: () => {
      void query.fetchNextPage();
    },
  };
}

async function fetchBadgeCounts(): Promise<StaffMessageBadges> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('get_pwa_staff_message_badge_counts');
  if (error) throw new Error(`badge counts failed: ${error.message}`);
  const raw = (data ?? {}) as Record<string, unknown>;
  return {
    unread_staff: Number(raw.unread_staff) || 0,
    unread_planning_assigned: Number(raw.unread_planning_assigned) || 0,
  };
}

/** Pastilles home / assistant — pas de corps de messages. */
export function useStaffMessageBadges() {
  const { data: currentUser } = useCurrentUser();
  const employeeId = currentUser?.user.id ?? null;

  return useQuery({
    queryKey: staffMessageBadgesQueryKey(employeeId),
    enabled: employeeId !== null,
    queryFn: fetchBadgeCounts,
    staleTime: 30 * 1000,
  });
}

export function useUnreadStaffMessageCount(): number {
  const { data } = useStaffMessageBadges();
  return data?.unread_staff ?? 0;
}

export function useUnreadPlanningAssignedCount(): number {
  const { data } = useStaffMessageBadges();
  return data?.unread_planning_assigned ?? 0;
}

export function patchStaffMessagesRead(
  queryClient: QueryClient,
  employeeId: number | null,
  messageIds: number[],
  readAt: string,
) {
  const idSet = new Set(messageIds);
  let freeCleared = 0;
  let planningCleared = 0;

  queryClient.setQueryData<InfiniteData<MessagePage>>(
    staffMessagesQueryKey(employeeId),
    (old) => {
      if (!old) return old;
      return {
        ...old,
        pages: old.pages.map((page) => ({
          ...page,
          messages: page.messages.map((m) => {
            if (!idSet.has(m.id) || m.read_at != null) return m;
            if (!m.require_ack && isUnread(m)) freeCleared += 1;
            if (
              m.titre === PLANNING_ASSIGNED_MESSAGE_TITLE &&
              !m.require_ack &&
              isUnread(m)
            ) {
              planningCleared += 1;
            }
            return { ...m, read_at: readAt };
          }),
        })),
      };
    },
  );

  if (freeCleared === 0 && planningCleared === 0) {
    void queryClient.invalidateQueries({ queryKey: staffMessageBadgesQueryKey(employeeId) });
    return;
  }

  queryClient.setQueryData<StaffMessageBadges>(
    staffMessageBadgesQueryKey(employeeId),
    (old) => {
      if (!old) return old;
      return {
        unread_staff: Math.max(0, old.unread_staff - freeCleared),
        unread_planning_assigned: Math.max(
          0,
          old.unread_planning_assigned - planningCleared,
        ),
      };
    },
  );
}

export function patchStaffMessageAcked(
  queryClient: QueryClient,
  employeeId: number | null,
  messageId: number,
  at: string,
) {
  let wasUnread = false;
  let wasPlanning = false;

  queryClient.setQueryData<InfiniteData<MessagePage>>(
    staffMessagesQueryKey(employeeId),
    (old) => {
      if (!old) return old;
      return {
        ...old,
        pages: old.pages.map((page) => ({
          ...page,
          messages: page.messages.map((m) => {
            if (m.id !== messageId) return m;
            wasUnread = isUnread(m);
            wasPlanning = m.titre === PLANNING_ASSIGNED_MESSAGE_TITLE;
            return { ...m, read_at: m.read_at ?? at, acked_at: at };
          }),
        })),
      };
    },
  );

  if (!wasUnread) return;
  queryClient.setQueryData<StaffMessageBadges>(
    staffMessageBadgesQueryKey(employeeId),
    (old) => {
      if (!old) return old;
      return {
        unread_staff: Math.max(0, old.unread_staff - 1),
        unread_planning_assigned: wasPlanning
          ? Math.max(0, old.unread_planning_assigned - 1)
          : old.unread_planning_assigned,
      };
    },
  );
}

/** Invalide uniquement les pastilles (après mark-read hors cache inbox). */
export function invalidateStaffMessageBadges(
  queryClient: QueryClient,
  employeeId: number | null,
) {
  void queryClient.invalidateQueries({ queryKey: staffMessageBadgesQueryKey(employeeId) });
}

/** Hook utilitaire pour patch depuis les composants. */
export function useStaffMessageCache() {
  const queryClient = useQueryClient();
  const { data: currentUser } = useCurrentUser();
  const employeeId = currentUser?.user.id ?? null;
  return { queryClient, employeeId };
}
