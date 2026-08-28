'use client';

import { useCallback, useEffect, useState } from 'react';
import { canUseWebPush, isIosDevice, isStandalonePwa } from '../lib/push/client';

export type PushStatus =
  | 'loading'
  | 'need-install'
  | 'unsupported'
  | 'default'
  | 'granted'
  | 'denied';

const PUSH_STATUS_EVENT = 'pwa-push-status';

export function readPushStatus(): PushStatus {
  if (typeof window === 'undefined') return 'loading';
  if (isIosDevice() && !isStandalonePwa()) return 'need-install';
  if (!canUseWebPush()) return 'unsupported';
  return Notification.permission;
}

export function notifyPushStatusChanged() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(PUSH_STATUS_EVENT));
}

/** Notifications pas encore utilisables : à signaler à l'employé. */
export function isPushAttentionNeeded(status: PushStatus): boolean {
  return status === 'default' || status === 'denied' || status === 'need-install';
}

export function usePushStatus() {
  const [status, setStatus] = useState<PushStatus>('loading');

  const refresh = useCallback(() => {
    setStatus(readPushStatus());
  }, []);

  useEffect(() => {
    refresh();
    window.addEventListener(PUSH_STATUS_EVENT, refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.removeEventListener(PUSH_STATUS_EVENT, refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [refresh]);

  return { status, refresh };
}
