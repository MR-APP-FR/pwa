'use server';

import { requireEmployeeSession } from '../../lib/auth/employee';
import { PLANNING_ASSIGNED_MESSAGE_TITLE } from '../../database/types';

/**
 * Marquage lecture / confirmation d'un `staff_message` (B5).
 * `user_id` dérivé de la session, jamais du client.
 */

export type MessageAckResult = { ok: true } | { ok: false; error: string };

export async function markMessageRead(messageId: number): Promise<MessageAckResult> {
  return markMessagesRead([messageId]);
}

export async function markMessagesRead(messageIds: number[]): Promise<MessageAckResult> {
  const ids = [...new Set(messageIds.filter((id) => Number.isFinite(id) && id > 0))];
  if (ids.length === 0) {
    return { ok: false, error: 'Message invalide.' };
  }

  const session = await requireEmployeeSession();
  if (!session.ok) {
    return { ok: false, error: session.error };
  }

  const readAt = new Date().toISOString();
  const { error } = await session.supabase.from('staff_message_ack').upsert(
    ids.map((messageId) => ({
      message_id: messageId,
      user_id: session.userId,
      read_at: readAt,
    })),
    { onConflict: 'message_id,user_id' },
  );

  if (error) {
    return { ok: false, error: `Marquage lu échoué : ${error.message}` };
  }
  return { ok: true };
}

/**
 * Marque lus les messages « Planning semaine prochaine » non lus — sans charger l’inbox.
 */
export async function markUnreadPlanningAssignedRead(): Promise<MessageAckResult> {
  const session = await requireEmployeeSession();
  if (!session.ok) {
    return { ok: false, error: session.error };
  }

  const { data: messages, error: msgError } = await session.supabase
    .from('staff_message')
    .select('id, require_ack')
    .eq('channel', 'staff')
    .eq('titre', PLANNING_ASSIGNED_MESSAGE_TITLE)
    .order('publie_at', { ascending: false })
    .limit(50);

  if (msgError) {
    return { ok: false, error: `Lecture planning messages échouée : ${msgError.message}` };
  }

  const rows = messages ?? [];
  if (rows.length === 0) return { ok: true };

  const ids = rows.map((m) => m.id);
  const { data: acks, error: ackError } = await session.supabase
    .from('staff_message_ack')
    .select('message_id, read_at, acked_at')
    .eq('user_id', session.userId)
    .in('message_id', ids);

  if (ackError) {
    return { ok: false, error: `Lecture acks échouée : ${ackError.message}` };
  }

  const ackById = new Map((acks ?? []).map((a) => [a.message_id, a]));
  const unreadIds = rows
    .filter((m) => {
      const ack = ackById.get(m.id);
      if (m.require_ack) return ack?.acked_at == null;
      return ack?.read_at == null;
    })
    .map((m) => m.id);

  if (unreadIds.length === 0) return { ok: true };
  return markMessagesRead(unreadIds);
}

export async function ackMessage(messageId: number): Promise<MessageAckResult> {
  if (!Number.isFinite(messageId) || messageId <= 0) {
    return { ok: false, error: 'Message invalide.' };
  }

  const session = await requireEmployeeSession();
  if (!session.ok) {
    return { ok: false, error: session.error };
  }

  const { error } = await session.supabase.from('staff_message_ack').upsert(
    {
      message_id: messageId,
      user_id: session.userId,
      read_at: new Date().toISOString(),
      acked_at: new Date().toISOString(),
    },
    { onConflict: 'message_id,user_id' },
  );

  if (error) {
    return { ok: false, error: `Confirmation échouée : ${error.message}` };
  }
  return { ok: true };
}
