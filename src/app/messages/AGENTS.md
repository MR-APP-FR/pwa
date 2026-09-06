# Messages staff

## Métier

Messagerie direction → terrain. Un message cible **Tous** ou **une seule zone** (groupe de sites) côté CRM / RLS ; la PWA affiche une **boîte unique** chronologique — l’employé ne voit pas le découpage par zone. Lu / accusé réception via `staff_message_ack`.

## Écran

- Route : `/messages` → liste complète directe (pas de sélecteur de conversations / zones)
- Page : [page.tsx](page.tsx)
- Helpers fil / dates : [conversations.ts](conversations.ts) (`INBOX_CONVERSATION`)
- Thread : [../../components/messages/MessagesChatThread.tsx](../../components/messages/MessagesChatThread.tsx)

## Technique

| Élément | Détail |
|---|---|
| Actions | [actions.ts](actions.ts) — `markMessageRead`, `ackMessage` |
| Hooks | [../../hooks/api/useStaffMessages.ts](../../hooks/api/useStaffMessages.ts) |
| Tables | `staff_message`, `staff_message_ack` |
| Push | CRM + Edge envoient ; PWA reçoit si abonnée ([../../lib/push/AGENTS.md](../../lib/push/AGENTS.md)) |

Tri : messages récents en premier. Zone obligatoire côté CRM — trigger `staff_message_site_ids_one_zone`. Brief météo 9h Paris : Edge `weather-brief` insère un `staff_message` (`meta.kind = weather_brief`, ciblage `user_ids`) + Web Push.

## Transverse

- CRM : [messages](../../../admin-desktop-app/components/crm/messages/) envoi + suivi Lu/Non lu (cible Tous / zone Messages, dont Province découpée côté CRM seulement).
- Canaux SQL auto : anniversaires / hebdo (`bureau`), taux déclaration + PDF CA (`ca`), pannes (`inter`). La PWA ne voit que `channel = staff`.

## Ne pas casser

- Ne pas filtrer côté client ce que RLS cache déjà — respecter `site_ids` / `user_ids`.
- Ack = upsert `(message_id, user_id)`.
- Ne pas réintroduire un split UI par groupe côté PWA sans demande produit.
