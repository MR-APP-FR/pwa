'use server';

import { requireEmployeeSession } from '../../lib/auth/employee';

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
