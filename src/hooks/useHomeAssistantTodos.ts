'use client';

import { useMemo } from 'react';
import { useCurrentUser } from './api/useCurrentUser';
import { isPushAttentionNeeded, usePushStatus } from './usePushStatus';

export type HomeAssistantTodoId =
  | 'photo'
  | 'cni'
  | 'push'
  | 'messages'
  | 'planning'
  | 'availability';

export interface HomeAssistantTodo {
  id: HomeAssistantTodoId;
  href: string;
  titleKey: string;
  titleParams?: Record<string, string>;
}

function isBlank(value: string | null | undefined): boolean {
  return !value?.trim();
}

export function useHomeAssistantTodos(params: {
  unreadMessageCount: number;
  /** Semaine ISO (lundi) à valider, ou null. */
  pendingPlanningWeekStart: string | null;
  availabilityBadgeCount: number;
  nextWeekAvailabilityHref: string;
}): HomeAssistantTodo[] {
  const { data } = useCurrentUser();
  const { status } = usePushStatus();

  return useMemo(() => {
    const todos: HomeAssistantTodo[] = [];

    if (data && isBlank(data.userInfo?.avatar_url)) {
      todos.push({
        id: 'photo',
        href: '/profil',
        titleKey: 'screens.home.assistantPhoto',
      });
    }
    if (data && isBlank(data.userInfo?.cni_url)) {
      todos.push({
        id: 'cni',
        href: '/profil',
        titleKey: 'screens.home.assistantCni',
      });
    }
    if (isPushAttentionNeeded(status)) {
      todos.push({
        id: 'push',
        href: '/profil',
        titleKey: 'screens.home.assistantPush',
      });
    }
    if (params.unreadMessageCount > 0) {
      todos.push({
        id: 'messages',
        href: '/messages',
        titleKey:
          params.unreadMessageCount === 1
            ? 'screens.home.assistantMessagesOne'
            : 'screens.home.assistantMessagesMany',
        titleParams: { count: String(params.unreadMessageCount) },
      });
    }
    if (params.pendingPlanningWeekStart) {
      todos.push({
        id: 'planning',
        href: `/planning?week=${params.pendingPlanningWeekStart}`,
        titleKey: 'screens.home.assistantPlanning',
      });
    }
    if (params.availabilityBadgeCount > 0) {
      todos.push({
        id: 'availability',
        href: params.nextWeekAvailabilityHref,
        titleKey: 'screens.home.assistantAvailability',
      });
    }

    return todos;
  }, [
    data,
    status,
    params.unreadMessageCount,
    params.pendingPlanningWeekStart,
    params.availabilityBadgeCount,
    params.nextWeekAvailabilityHref,
  ]);
}
