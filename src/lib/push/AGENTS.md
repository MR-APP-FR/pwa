# Web Push (abonnement PWA)

## Métier

Notifications navigateur pour messages bureau, relances ouverture tardive, rappel dispos mercredi.

## Fichiers

| Fichier | Rôle |
|---|---|
| [client.ts](client.ts) | `subscribeAndSave`, `canUseWebPush` |
| [../../app/push/actions.ts](../../app/push/actions.ts) | Persist `push_subscription` |
| [../../components/pwa/PushEnableBanner.tsx](../../components/pwa/PushEnableBanner.tsx) | UI accueil |
| Service worker | enregistrement côté client |

## Env

- `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (PWA + CRM public)
- Edge Functions : `VAPID_*` secrets Supabase
- CRM envoi : [../../../admin-desktop-app/lib/push/send-staff-message-push.ts](../../../admin-desktop-app/lib/push/send-staff-message-push.ts)

## Technique

- Table : `push_subscription` (endpoint par employé/appareil).
- iOS : push **uniquement** PWA installée (`canUseWebPush`).
- Protocole W3C via lib `web-push` — pas FCM serveur dédié.

## Ne pas casser

- Ne pas demander permission push avant interaction utilisateur (UX + policies).
- Clé VAPID absente = bannière masquée, pas d’erreur runtime.
- Edge et CRM doivent partager la même paire VAPID.
