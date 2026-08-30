# Ouverture terrain

## Métier

Le teneur (ou le double) valide l’ouverture du manège : feuilles de jour, tickets, fond caisse, observations, GPS, chrono **lundi** (2 min 25–35, sinon retry puis alerte Bureau + intervention urgente), option carte parking si configurée sur le site.

## Écran

- Route : `/opening` (souvent `?siteId=&date=`)
- Page : [page.tsx](page.tsx)

## Technique

| Élément | Détail |
|---|---|
| Action | [actions.ts](actions.ts) → `submitOpeningForm` |
| Chrono | [chrono.ts](chrono.ts) — lundi uniquement, bornes 145–155 s ; section juste avant remarques ; roulette min/s |
| Retard | [late-opening-actions.ts](late-opening-actions.ts) |
| Table | `opening_form` — upsert `onConflict: site_id,date` |
| Colonnes récentes | `client_lat`, `client_lng`, `chrono_seconds`, parking |
| RPC | `report_chrono_out_of_range` — message canal `bureau` + `intervention` urgente |
| Config site | `site_infos` / hook `useSiteCarteParking` |
| Carte parking | Non à l’ouverture → RPC `report_parking_card_missing` (canal Bureau) |
| RLS | Binôme planifié (`planning.user_id` / `double_id`) |

`user_id` = dernier soumetteur via `requireEmployeeSession()`.

## Transverse

- CRM : day-board [ouverture](../../../admin-desktop-app/app/(dashboard)/crm/ouverture/) + historique forms ; alerte « Parking absent » si Non.
- Cron Edge `opening-late` : push si créneau matin/après-midi sans ouverture.
- Résolution panne depuis ouverture : migration `gre_resolve_panne_from_opening`.

## Ne pas casser

- Toujours upsert, jamais insert seul.
- Coords GPS : validation serveur dans `actions.ts`.
- Chrono : **lundi** seulement ; secondes entières ; 1er hors borne = retry UI ; 2e = Bureau + ticket « chrono mal calibré à XminYsec ».
- Date mission = ISO Paris, pas `new Date()` brut côté serveur.
