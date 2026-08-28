import { savePushSubscription } from '../../app/push/actions';

export function isStandalonePwa(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches
  );
}

export function isIosDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

/** iOS n'accepte le Web Push que depuis une PWA sur l'écran d'accueil. */
export function canUseWebPush(): boolean {
  if (typeof window === 'undefined') return false;
  if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    return false;
  }
  if (isIosDevice() && !isStandalonePwa()) return false;
  return Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY);
}

function urlBase64ToUint8Array(base64String: string): BufferSource {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

export async function subscribeAndSave(): Promise<{ ok: true } | { ok: false; error: string }> {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!publicKey) {
    return { ok: false, error: 'Clé VAPID manquante.' };
  }
  if (!canUseWebPush()) {
    return { ok: false, error: "Les notifications ne sont pas disponibles sur cet appareil." };
  }

  try {
    const permission =
      Notification.permission === 'granted'
        ? 'granted'
        : await Notification.requestPermission();
    if (permission !== 'granted') {
      return { ok: false, error: 'Notifications refusées.' };
    }

    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
    }

    const json = subscription.toJSON();
    const endpoint = json.endpoint;
    const p256dh = json.keys?.p256dh;
    const auth = json.keys?.auth;
    if (!endpoint || !p256dh || !auth) {
      return { ok: false, error: 'Abonnement incomplet.' };
    }

    return savePushSubscription({
      endpoint,
      p256dh,
      auth,
      userAgent: navigator.userAgent,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Les notifications n'ont pas pu être activées.";
    return { ok: false, error: message };
  }
}
