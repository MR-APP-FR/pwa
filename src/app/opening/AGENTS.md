# Ouverture terrain

## Métier

Le teneur (ou le double) valide l’ouverture du manège : feuilles de jour, tickets, fond caisse, observations, GPS, chrono (dont ouverture tardive), option carte parking si configurée sur le site.

## Écran

- Route : `/opening` (souvent `?siteId=&date=`)
- Page : [page.tsx](page.tsx)

## Technique

| Élément | Détail |
|---|---|
| Action | [actions.ts](actions.ts) → `submitOpening` |
| Retard | [late-opening-actions.ts](late-opening-actions.ts) |
| Table | `opening_form` — upsert `onConflict: site_id,date` |
| Colonnes récentes | `client_lat`, `client_lng`, `chrono_seconds`, parking |
| Config site | `site_infos` / hook `useSiteCarteParking` |
| RLS | Binôme planifié (`planning.user_id` / `double_id`) |

`user_id` = dernier soumetteur via `requireEmployeeSession()`.

## Transverse

- CRM : day-board [ouverture](../../../admin-desktop-app/app/(dashboard)/crm/ouverture/) + historique forms.
- Cron Edge `opening-late` : push si créneau matin/après-midi sans ouverture.
- Résolution panne depuis ouverture : migration `gre_resolve_panne_from_opening`.

## Ne pas casser

- Toujours upsert, jamais insert seul.
- Coords GPS : validation serveur dans `actions.ts`.
- Chrono : secondes entières ; libellés i18n minutes/secondes.
- Date mission = ISO Paris, pas `new Date()` brut côté serveur.
