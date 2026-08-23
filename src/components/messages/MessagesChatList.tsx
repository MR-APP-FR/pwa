'use client';

import type { LucideIcon } from 'lucide-react';
import { Bot, ChevronRight, Megaphone, Pin } from 'lucide-react';
import { MESSAGE_SOURCE_ICON } from '../../database/types';
import type { StaffMessageWithAck } from '../../database/types';
import { useThemeColors } from '../../hooks/useThemeColors';
import { useTranslation } from '../../hooks/useTranslation';
import { RADIUS } from '../../constants/design';
import type { ThemeColors } from '../../types/theme.types';
import {
  conversationInitials,
  formatChatListTime,
  hashKey,
  isMessageUnread,
  lastMessage,
  type Conversation,
} from '../../app/messages/conversations';

interface ChatListProps {
  conversations: Conversation[];
  messagesByKey: Map<string, StaffMessageWithAck[]>;
  onSelect: (key: string) => void;
}

const ZONE_ACCENTS = [
  ['ACCENT_BLUE', 'ACCENT_BLUE_MUTED'],
  ['ACCENT_ORANGE', 'ACCENT_ORANGE_MUTED'],
  ['ACCENT_RED', 'ACCENT_RED_MUTED'],
  ['ACCENT_GREEN', 'ACCENT_GREEN_MUTED'],
  ['ACCENT_PINK', 'ACCENT_PINK_MUTED'],
  ['ACCENT_YELLOW', 'ACCENT_YELLOW_MUTED'],
] as const;

function previewText(
  message: StaffMessageWithAck | undefined,
  emptyLabel: string,
): string {
  if (!message) return emptyLabel;
  const icon = MESSAGE_SOURCE_ICON[message.source] ?? MESSAGE_SOURCE_ICON.bureau;
  return `${icon} ${message.corps}`;
}

function conversationAccent(conversation: Conversation, colors: ThemeColors) {
  if (conversation.kind === 'tous') {
    return { fg: colors.ACCENT_GREEN, bg: colors.ACCENT_GREEN_MUTED };
  }
  if (conversation.kind === 'notifications') {
    return { fg: colors.ACCENT_PURPLE, bg: colors.ACCENT_PURPLE_MUTED };
  }
  const [fgKey, bgKey] = ZONE_ACCENTS[hashKey(conversation.key, ZONE_ACCENTS.length)]!;
  return { fg: colors[fgKey], bg: colors[bgKey] };
}

function ConversationIcon({ conversation }: { conversation: Conversation }) {
  const { colors } = useThemeColors();
  const accent = conversationAccent(conversation, colors);
  const Icon: LucideIcon | null =
    conversation.kind === 'tous' ? Megaphone : conversation.kind === 'notifications' ? Bot : null;

  return (
    <div
      className="flex size-11 shrink-0 items-center justify-center"
      style={{
        borderRadius: RADIUS.sm,
        backgroundColor: accent.bg,
        color: accent.fg,
      }}
    >
      {Icon ? (
        <Icon size={20} color={accent.fg} strokeWidth={2.25} />
      ) : (
        <span className="text-sm font-bold" style={{ fontFamily: 'var(--font-display)' }}>
          {conversationInitials(conversation.label)}
        </span>
      )}
    </div>
  );
}

function SectionLabel({
  title,
  icon: Icon,
}: {
  title: string;
  icon?: LucideIcon;
}) {
  const { colors } = useThemeColors();
  return (
    <div className="flex items-center gap-2 px-1 pb-2">
      {Icon ? <Icon size={12} color={colors.PRIMARY} strokeWidth={2.5} /> : null}
      <h3
        className="text-xs font-bold uppercase tracking-wide"
        style={{ color: colors.PRIMARY, fontFamily: 'var(--font-display)' }}
      >
        {title}
      </h3>
      <div className="h-px flex-1" style={{ backgroundColor: colors.BORDER }} />
    </div>
  );
}

export function MessagesChatList({ conversations, messagesByKey, onSelect }: ChatListProps) {
  const { colors } = useThemeColors();
  const { t } = useTranslation();
  const tous = conversations.find((c) => c.kind === 'tous');
  const notifications = conversations.find((c) => c.kind === 'notifications');
  const zones = conversations.filter((c) => c.kind === 'zone');
  const emptyLabel = t('screens.messages.noMessage');
  const pinned = [tous, notifications].filter(Boolean) as Conversation[];

  return (
    <div
      className="flex min-h-0 flex-1 flex-col"
      style={{ backgroundColor: colors.BG_SECONDARY }}
    >
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 pb-6 pt-3">
        {pinned.length > 0 ? (
          <section>
            <SectionLabel title={t('screens.messages.pinned')} icon={Pin} />
            <div className="card-surface overflow-hidden">
              {pinned.map((conversation, index) => (
                <ConversationRow
                  key={conversation.key}
                  conversation={conversation}
                  messages={messagesByKey.get(conversation.key) ?? []}
                  emptyLabel={emptyLabel}
                  showDivider={index < pinned.length - 1}
                  onSelect={() => onSelect(conversation.key)}
                />
              ))}
            </div>
          </section>
        ) : null}

        {zones.length > 0 ? (
          <section>
            <SectionLabel title={t('screens.messages.zones')} />
            <div className="card-surface overflow-hidden">
              {zones.map((zone, index) => (
                <ConversationRow
                  key={zone.key}
                  conversation={zone}
                  messages={messagesByKey.get(zone.key) ?? []}
                  emptyLabel={emptyLabel}
                  showDivider={index < zones.length - 1}
                  onSelect={() => onSelect(zone.key)}
                />
              ))}
            </div>
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
  showDivider,
  onSelect,
}: {
  conversation: Conversation;
  messages: StaffMessageWithAck[];
  emptyLabel: string;
  showDivider: boolean;
  onSelect: () => void;
}) {
  const { colors } = useThemeColors();
  const { t } = useTranslation();
  const preview = lastMessage(messages);
  const unread = messages.filter(isMessageUnread).length;
  const label =
    conversation.kind === 'notifications'
      ? t('screens.messages.notifications')
      : conversation.label;

  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex w-full items-center gap-3 px-3.5 py-3 text-left transition-opacity active:opacity-80"
      style={{
        borderBottom: showDivider ? `1px solid ${colors.BORDER}` : undefined,
      }}
    >
      <ConversationIcon conversation={conversation} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span
            className="truncate text-[15px] font-semibold"
            style={{
              color: unread > 0 ? colors.PRIMARY : colors.TEXT_PRIMARY,
              fontFamily: 'var(--font-display)',
            }}
          >
            {label}
          </span>
          {preview ? (
            <span className="shrink-0 text-[11px] font-semibold" style={{ color: colors.TEXT_SECONDARY }}>
              {formatChatListTime(preview.publie_at)}
            </span>
          ) : null}
        </div>
        <div className="mt-0.5 flex items-center gap-2">
          <p
            className="min-w-0 flex-1 truncate text-[13px]"
            style={{ color: colors.TEXT_SECONDARY }}
          >
            {previewText(preview, emptyLabel)}
          </p>
          {unread > 0 ? (
            <span
              className="flex h-5 min-w-5 shrink-0 items-center justify-center px-1.5 text-[11px] font-bold"
              style={{
                borderRadius: RADIUS.xs,
                backgroundColor: colors.DANGER,
                color: colors.TEXT_INVERSE,
              }}
            >
              {unread > 9 ? '9+' : unread}
            </span>
          ) : null}
        </div>
      </div>
      <ChevronRight
        size={18}
        color={colors.TEXT_SECONDARY}
        strokeWidth={2.5}
        className="shrink-0"
        aria-hidden
      />
    </button>
  );
}
