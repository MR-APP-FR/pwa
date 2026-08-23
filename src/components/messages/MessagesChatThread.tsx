'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Check, MapPin } from 'lucide-react';
import { MESSAGE_SOURCE_ICON, type StaffMessageWithAck } from '../../database/types';
import { ackMessage } from '../../app/messages/actions';
import { useThemeColors } from '../../hooks/useThemeColors';
import { useTranslation } from '../../hooks/useTranslation';
import { RADIUS, TOUCH_TARGET } from '../../constants/design';
import {
  formatChatClock,
  formatDaySeparator,
  messageDayIso,
  reverseChronological,
  type Conversation,
} from '../../app/messages/conversations';

interface ChatThreadProps {
  conversation: Conversation;
  messages: StaffMessageWithAck[];
}

function dayGroups(messages: StaffMessageWithAck[]) {
  const ordered = reverseChronological(messages);
  const groups: { day: string; messages: StaffMessageWithAck[] }[] = [];
  for (const message of ordered) {
    const day = messageDayIso(message.publie_at);
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.messages.push(message);
    else groups.push({ day, messages: [message] });
  }
  return groups;
}

function MessageCard({ message }: { message: StaffMessageWithAck }) {
  const { colors } = useThemeColors();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const isAuto = message.source === 'appli';
  const needsAck = message.require_ack && message.acked_at === null;
  const canAck = message.id > 0;
  const accentFg = isAuto ? colors.ACCENT_PURPLE : colors.PRIMARY;
  const icon = MESSAGE_SOURCE_ICON[message.source] ?? MESSAGE_SOURCE_ICON.bureau;
  const sourceName = isAuto
    ? t('screens.messages.sourceAppliName')
    : t('screens.messages.sourceBureauName');

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
    <article
      className="px-3 py-2"
      style={{
        backgroundColor: colors.SETTINGS_SECTION_BG,
        border: `1px solid ${colors.BORDER}`,
        borderRadius: RADIUS.md,
        boxShadow: colors.CARD_SHADOW,
      }}
    >
      <div className="flex items-start gap-2">
        <span className="mt-0.5 text-[17px] leading-none" aria-hidden>
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <p
              className="truncate text-[12px] font-semibold"
              style={{ color: accentFg, fontFamily: 'var(--font-display)' }}
            >
              {sourceName}
            </p>
            <time
              className="shrink-0 text-[11px] font-medium"
              style={{ color: colors.TEXT_SECONDARY }}
              dateTime={message.publie_at}
            >
              {formatChatClock(message.publie_at)}
            </time>
          </div>
          {isAuto && message.titre && message.titre !== message.corps ? (
            <p
              className="text-[13px] font-semibold leading-snug"
              style={{ color: colors.TEXT_PRIMARY }}
            >
              {message.titre}
            </p>
          ) : null}
          <p
            className="whitespace-pre-wrap text-[15px] leading-snug"
            style={{ color: colors.TEXT_PRIMARY }}
          >
            {message.corps}
          </p>
          {message.require_ack && canAck ? (
            <div className="pt-1.5">
              {needsAck ? (
                <button
                  type="button"
                  onClick={handleAck}
                  disabled={pending}
                  className="w-full px-3 text-sm font-semibold transition-transform active:scale-[0.98] disabled:opacity-50"
                  style={{
                    minHeight: TOUCH_TARGET,
                    borderRadius: RADIUS.sm,
                    backgroundColor: colors.ACCENT_GREEN_MUTED,
                    color: colors.ACCENT_GREEN,
                    boxShadow: `inset 0 0 0 1.5px ${colors.ACCENT_GREEN}`,
                    fontFamily: 'var(--font-display)',
                  }}
                >
                  {pending ? '…' : t('screens.messages.ackButton')}
                </button>
              ) : (
                <p
                  className="flex items-center gap-1 text-xs font-semibold"
                  style={{ color: colors.SUCCESS }}
                >
                  <Check size={13} strokeWidth={2.75} />
                  {t('screens.messages.ackedLabel')}
                </p>
              )}
            </div>
          ) : null}
          {error ? (
            <p className="pt-1 text-xs font-semibold" style={{ color: colors.DANGER }}>
              {error}
            </p>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export function MessagesChatThread({ conversation, messages }: ChatThreadProps) {
  const { colors } = useThemeColors();
  const { t } = useTranslation();
  const listRef = useRef<HTMLDivElement>(null);
  const groups = useMemo(() => dayGroups(messages), [messages]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = 0;
  }, [conversation.key]);

  const emptyLabel =
    conversation.kind === 'tous'
      ? t('screens.messages.emptyTous')
      : conversation.kind === 'notifications'
        ? t('screens.messages.emptyNotifications')
        : t('screens.messages.emptyZone');

  return (
    <div
      className="flex min-h-0 flex-1 flex-col"
      style={{ backgroundColor: colors.BG_SECONDARY }}
    >
      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {messages.length === 0 ? (
          <div className="card-surface flex flex-col items-center gap-3 px-5 py-10">
            <div
              className="flex size-12 items-center justify-center"
              style={{
                borderRadius: RADIUS.sm,
                backgroundColor: colors.PRIMARY_MUTED,
              }}
            >
              {conversation.kind === 'notifications' ? (
                <span className="text-2xl leading-none" aria-hidden>
                  {MESSAGE_SOURCE_ICON.appli}
                </span>
              ) : conversation.kind === 'zone' ? (
                <MapPin size={22} color={colors.PRIMARY} strokeWidth={2.25} />
              ) : (
                <span className="text-2xl leading-none" aria-hidden>
                  {MESSAGE_SOURCE_ICON.bureau}
                </span>
              )}
            </div>
            <p className="text-center text-sm leading-relaxed" style={{ color: colors.TEXT_SECONDARY }}>
              {emptyLabel}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {groups.map((group) => (
              <section key={group.day} className="space-y-1.5">
                <div className="flex items-center gap-2 px-1">
                  <div className="h-px flex-1" style={{ backgroundColor: colors.BORDER }} />
                  <span
                    className="text-[11px] font-bold uppercase tracking-wide"
                    style={{ color: colors.PRIMARY, fontFamily: 'var(--font-display)' }}
                  >
                    {formatDaySeparator(group.day)}
                  </span>
                  <div className="h-px flex-1" style={{ backgroundColor: colors.BORDER }} />
                </div>
                {group.messages.map((message) => (
                  <MessageCard key={message.id} message={message} />
                ))}
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
