'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useStaffMessagesList, useStaffMessageCache, patchStaffMessagesRead } from '../../hooks/api/useStaffMessages';
import { markMessagesRead } from './actions';
import { PageHeader } from '../../components/layout/PageHeader';
import { FormScrollLayout } from '../../components/layout/FormScrollLayout';
import { FormPinnedPageHeader } from '../../components/layout/FormPinnedPageHeader';
import { MessagesChatThread } from '../../components/messages/MessagesChatThread';
import { INBOX_CONVERSATION, isStaffInboxMessage } from './conversations';
import { useThemeColors } from '../../hooks/useThemeColors';
import { useTranslation } from '../../hooks/useTranslation';

export default function MessagesPage() {
  const { colors } = useThemeColors();
  const { t } = useTranslation();
  const {
    messages,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useStaffMessagesList();
  const { queryClient, employeeId } = useStaffMessageCache();
  const markedRef = useRef<Set<number>>(new Set());

  const inboxMessages = useMemo(
    () => messages.filter(isStaffInboxMessage),
    [messages],
  );

  useEffect(() => {
    const unread = inboxMessages.filter(
      (m) => m.id > 0 && m.read_at === null && !markedRef.current.has(m.id),
    );
    if (unread.length === 0) return;
    for (const m of unread) markedRef.current.add(m.id);
    const ids = unread.map((m) => m.id);
    const readAt = new Date().toISOString();
    patchStaffMessagesRead(queryClient, employeeId, ids, readAt);
    void markMessagesRead(ids);
  }, [inboxMessages, queryClient, employeeId]);

  return (
    <FormScrollLayout>
      <div
        className="flex flex-col"
        style={{
          backgroundColor: colors.BG_SECONDARY,
          height: 'calc(100dvh - 7.5rem)',
        }}
      >
        <FormPinnedPageHeader>
          <PageHeader pin="static" accent="purple" title={t('screens.messages.title')} showBack />
        </FormPinnedPageHeader>

        <MessagesChatThread
          conversation={INBOX_CONVERSATION}
          messages={inboxMessages}
          hasNextPage={hasNextPage}
          isFetchingNextPage={isFetchingNextPage}
          onLoadOlder={fetchNextPage}
        />
      </div>
    </FormScrollLayout>
  );
}
