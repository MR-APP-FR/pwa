'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '../../lib/supabase/client';
import { useCurrentUser } from './useCurrentUser';
import type { StaffMessageWithAck } from '../../database/types';
import { PLANNING_ASSIGNED_MESSAGE_TITLE } from '../../database/types';

/**
 * Liste des messages ciblant l'employé connecté (filtrage par la RLS de
 * `staff_message`, cf. Phase 0 §0.4), fusionnée avec son propre accusé de
 * lecture (`staff_message_ack`). Les canaux admin (`bureau`, `ca`, `inter`) sont exclus.
 */
export function useStaffMessages() {
  const { data: currentUser } = useCurrentUser();
  const employeeId = currentUser?.user.id ?? null;

  return useQuery<StaffMessageWithAck[]>({
    queryKey: ['staff-messages', employeeId],
    enabled: employeeId !== null,
    queryFn: async () => {
      const supabase = createClient();

      const { data: messages, error } = await supabase
        .from('staff_message')
        .select('id, titre, corps, source, channel, require_ack, publie_at, expire_at, created_at, site_ids, user_ids')
        .eq('channel', 'staff')
        .order('publie_at', { ascending: false })
        .limit(100);
      if (error) throw new Error(`useStaffMessages fetch failed: ${error.message}`);

      const { data: acks, error: ackError } = await supabase
        .from('staff_message_ack')
        .select('message_id, read_at, acked_at')
        .eq('user_id', employeeId!);
      if (ackError) throw new Error(`useStaffMessages ack fetch failed: ${ackError.message}`);

      const ackByMessage = new Map((acks ?? []).map((a) => [a.message_id, a]));

      return (messages ?? [])
        .filter((m) => m.channel === 'staff')
        .map((m) => {
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
    },
    staleTime: 30 * 1000,
  });
}

/** Non-acquittés : lus manquants (messages libres) + confirmations manquantes (require_ack). */
export function useUnreadStaffMessageCount(): number {
  const { data: messages } = useStaffMessages();
  return (messages ?? []).filter((m) => (m.require_ack ? m.acked_at === null : m.read_at === null))
    .length;
}

/** Badge planning : message « Planning semaine prochaine » non lu. */
export function useUnreadPlanningAssignedCount(): number {
  const { data: messages } = useStaffMessages();
  return (messages ?? []).filter(
    (m) =>
      m.titre === PLANNING_ASSIGNED_MESSAGE_TITLE &&
      (m.require_ack ? m.acked_at === null : m.read_at === null),
  ).length;
}
