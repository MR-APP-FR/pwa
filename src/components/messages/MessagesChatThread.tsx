'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { MESSAGE_SOURCE_ICON, type StaffMessageWithAck } from '../../database/types';
import { ackMessage } from '../../app/messages/actions';
import { useTranslation } from '../../hooks/useTranslation';
import {
  chronological,
  formatChatClock,
  formatDaySeparator,
  messageDayIso,
  type Conversation,
} from '../../app/messages/conversations';

interface ChatThreadProps {
  conversation: Conversation;
  messages: StaffMessageWithAck[];
}

function dayGroups(messages: StaffMessageWithAck[]) {
  const ordered = chronological(messages);
  const groups: { day: string; messages: StaffMessageWithAck[] }[] = [];
  for (const message of ordered) {
    const day = messageDayIso(message.publie_at);
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.messages.push(message);
    else groups.push({ day, messages: [message] });
  }
  return groups;
}

function MessageBubble({ message }: { message: StaffMessageWithAck }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const isAuto = message.source === 'appli';
  const icon = MESSAGE_SOURCE_ICON[message.source] ?? MESSAGE_SOURCE_ICON.bureau;
  const needsAck = message.require_ack && message.acked_at === null;
  const canAck = message.id > 0;

  function handleAck() {
    if (!canAck) return;
    setError(null);
    startTransition(async () => {
      const result = await ackMessage(message.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      queryClient.invalidateQueries({ queryKey: ['staff-messages'] });
    });
  }

  return (
    <div className="flex justify-start">
      <div
        className={`max-w-[85%] rounded-lg rounded-tl-none px-2.5 pb-1.5 pt-1.5 shadow-sm ${
          isAuto ? 'bg-white' : 'bg-[#d9fdd3]'
        }`}
      >
        <p className="text-[12px] font-semibold text-[#111b21]">
          {icon} {isAuto ? t('screens.messages.sourceAppliName') : t('screens.messages.sourceBureauName')}
        </p>
        {isAuto && message.titre && message.titre !== message.corps ? (
          <p className="text-[13px] font-semibold text-[#111b21]">{message.titre}</p>
        ) : null}
        <p className="whitespace-pre-wrap text-[15px] leading-snug text-[#111b21]">{message.corps}</p>
        {message.require_ack && canAck ? (
          <div className="pt-2">
            {needsAck ? (
              <button
                type="button"
                onClick={handleAck}
                disabled={pending}
                className="min-h-11 w-full rounded-xl border border-[#00a884] bg-[#e7f8f2] py-2 text-sm font-semibold text-[#017561]"
              >
                {pending ? '…' : t('screens.messages.ackButton')}
              </button>
            ) : (
              <p className="text-xs font-semibold text-[#017561]">{t('screens.messages.ackedLabel')}</p>
            )}
          </div>
        ) : null}
        {error ? <p className="pt-1 text-xs text-[#e04a47]">{error}</p> : null}
        <div className="mt-0.5 flex justify-end">
          <span className="text-[11px] text-[#667781]">{formatChatClock(message.publie_at)}</span>
        </div>
      </div>
    </div>
  );
}

export function MessagesChatThread({ conversation, messages }: ChatThreadProps) {
  const { t } = useTranslation();
  const listRef = useRef<HTMLDivElement>(null);
  const groups = useMemo(() => dayGroups(messages), [messages]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [conversation.key, messages.length]);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[#efeae2]">
      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {messages.length === 0 ? (
          <p className="py-16 text-center text-sm text-[#667781]">
            {conversation.kind === 'tous'
              ? t('screens.messages.emptyTous')
              : conversation.kind === 'notifications'
                ? t('screens.messages.emptyNotifications')
                : t('screens.messages.emptyZone')}
          </p>
        ) : (
          <div className="space-y-2">
            {groups.map((group) => (
              <div key={group.day} className="space-y-2">
                <div className="flex justify-center py-1">
                  <span className="rounded-lg bg-white/80 px-3 py-1 text-[12px] capitalize text-[#54656f] shadow-sm">
                    {formatDaySeparator(group.day)}
                  </span>
                </div>
                {group.messages.map((message) => (
                  <MessageBubble key={message.id} message={message} />
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
