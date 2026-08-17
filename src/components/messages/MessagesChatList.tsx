'use client';

import { Pin } from 'lucide-react';
import { MESSAGE_SOURCE_ICON } from '../../database/types';
import type { StaffMessageWithAck } from '../../database/types';
import { useTranslation } from '../../hooks/useTranslation';
import {
  avatarColorClass,
  conversationInitials,
  formatChatListTime,
  isMessageUnread,
  lastMessage,
  type Conversation,
} from '../../app/messages/conversations';

interface ChatListProps {
  conversations: Conversation[];
  messagesByKey: Map<string, StaffMessageWithAck[]>;
  onSelect: (key: string) => void;
}

function previewText(
  message: StaffMessageWithAck | undefined,
  emptyLabel: string,
): string {
  if (!message) return emptyLabel;
  const icon = MESSAGE_SOURCE_ICON[message.source] ?? MESSAGE_SOURCE_ICON.bureau;
  return `${icon} ${message.corps}`;
}

function ConversationAvatar({ conversation }: { conversation: Conversation }) {
  if (conversation.kind === 'tous') {
    return (
      <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-[#00a884] text-xl">
        📢
      </div>
    );
  }
  if (conversation.kind === 'notifications') {
    return (
      <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-[#6B1F9E] text-xl">
        🤖
      </div>
    );
  }
  return (
    <div
      className={`flex size-12 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white ${avatarColorClass(conversation.key)}`}
    >
      {conversationInitials(conversation.label)}
    </div>
  );
}

export function MessagesChatList({ conversations, messagesByKey, onSelect }: ChatListProps) {
  const { t } = useTranslation();
  const tous = conversations.find((c) => c.kind === 'tous');
  const notifications = conversations.find((c) => c.kind === 'notifications');
  const zones = conversations.filter((c) => c.kind === 'zone');
  const emptyLabel = t('screens.messages.noMessage');
  const pinned = [tous, notifications].filter(Boolean) as Conversation[];

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-white">
      <div className="min-h-0 flex-1 overflow-y-auto">
        {pinned.length > 0 ? (
          <section>
            <div className="flex items-center gap-1.5 px-4 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-[#667781]">
              <Pin className="size-3" />
              {t('screens.messages.pinned')}
            </div>
            {pinned.map((conversation) => (
              <ConversationRow
                key={conversation.key}
                conversation={conversation}
                messages={messagesByKey.get(conversation.key) ?? []}
                emptyLabel={emptyLabel}
                onSelect={() => onSelect(conversation.key)}
              />
            ))}
          </section>
        ) : null}

        {zones.length > 0 ? (
          <section>
            <div className="px-4 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-[#667781]">
              {t('screens.messages.zones')}
            </div>
            {zones.map((zone) => (
              <ConversationRow
                key={zone.key}
                conversation={zone}
                messages={messagesByKey.get(zone.key) ?? []}
                emptyLabel={emptyLabel}
                onSelect={() => onSelect(zone.key)}
              />
            ))}
          </section>
        ) : null}
      </div>
    </div>
  );
}

function ConversationRow({
  conversation,
  messages,
  emptyLabel,
  onSelect,
}: {
  conversation: Conversation;
  messages: StaffMessageWithAck[];
  emptyLabel: string;
  onSelect: () => void;
}) {
  const { t } = useTranslation();
  const preview = lastMessage(messages);
  const unread = messages.filter(isMessageUnread).length;

  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex w-full items-center gap-3 border-b border-[#e9edef] px-4 py-3 text-left"
    >
      <ConversationAvatar conversation={conversation} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-[15px] font-semibold text-[#111b21]">
            {conversation.kind === 'notifications'
              ? t('screens.messages.notifications')
              : conversation.label}
          </span>
          {preview ? (
            <span className="shrink-0 text-[11px] text-[#667781]">
              {formatChatListTime(preview.publie_at)}
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <p className="min-w-0 flex-1 truncate text-[13px] text-[#667781]">
            {previewText(preview, emptyLabel)}
          </p>
          {unread > 0 ? (
            <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-[#00a884] px-1.5 text-[11px] font-bold text-white">
              {unread > 9 ? '9+' : unread}
            </span>
          ) : null}
        </div>
      </div>
    </button>
  );
}
