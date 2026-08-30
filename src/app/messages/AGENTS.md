# Messages staff

## Métier

Messagerie direction → terrain : conversations par canal (Bureau, météo auto, planning assigné, CR auto…). Lu / accusé réception via `staff_message_ack`. Un message cible **Tous** ou **une seule zone** (groupe de sites).

## Écran

- Route : `/messages`
- Page : [page.tsx](page.tsx)
- Conversations : [conversations.ts](conversations.ts)

## Technique

| Élément | Détail |
|---|---|
| Actions | [actions.ts](actions.ts) — `markMessageRead`, `ackMessage` |
| Hooks | [../../hooks/api/useStaffMessages.ts](../../hooks/api/useStaffMessages.ts) |
| Tables | `staff_message`, `staff_message_ack` |
| Push | CRM + Edge envoient ; PWA reçoit si abonnée ([../../lib/push/AGENTS.md](../../lib/push/AGENTS.md)) |

Tri : messages récents en premier. Zone obligatoire côté CRM — trigger `staff_message_site_ids_one_zone`.

## Transverse

- CRM : [messages](../../../admin-desktop-app/components/crm/messages/) envoi + suivi Lu/Non lu.
- Canaux SQL auto : anniversaires, hebdo bureau, taux déclaration (`internal.post_*`).

## Ne pas casser

- Ne pas filtrer côté client ce que RLS cache déjà — respecter `site_ids` / `user_ids`.
- Ack = upsert `(message_id, user_id)`.
- Brief météo : marquer lu ouvre popup ou Messages (cohérence badge accueil).
