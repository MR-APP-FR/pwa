# Ouverture terrain

## Métier

Le teneur (ou le double) valide l’ouverture du manège : feuilles de jour, tickets, fond caisse (**montant par site** via `site_infos.fond_caisse`, défaut 100 €), observations, GPS, chrono **lundi** (2 min 25–35, sinon retry puis alerte Bureau + intervention urgente), option carte parking si configurée sur le site. Seuils stock : feuilles < 10 ou tickets < 500 → alerte Bureau (idempotent site × jour × type). **Lundi** : checklist panneaux + affaires (`opening_form.panneaux` / `affaires`) ; manquants → Bureau `monday_opening_issues`.

## Écran

- Route : `/opening` (souvent `?id=` mission planning)
- Page : [page.tsx](page.tsx) — mission via `usePlanningById` (pas le triplet 3 mois)
- **Déjà soumis** : `useExistingOpeningForm(site, date)` → lecture seule (banner, champs `readOnly`/`disabled`, footer Retour seul, photo nettoyage via `LockedPhotoThumb` + URL signée). Même pattern que fermeture.

## Technique

| Élément | Détail |
|---|---|
| Action | [actions.ts](actions.ts) → `submitOpeningForm` |
| Prefill lock | [useExistingOpeningForm](../../hooks/api/useExistingOpeningForm.ts) — `opening_form` + `daily_info` ; hydrate une fois via `useRef` |
| Chrono | [chrono.ts](chrono.ts) — lundi uniquement, bornes 145–155 s ; section juste avant remarques ; roulette min/s (`FormDurationInput` `readOnly` si lock) |
| Lundi | [MondayOpeningChecks](../../components/forms/MondayOpeningChecks.tsx) — panneaux collés/volants + affaires (reste si absent) ; prop `disabled` si lock |
| Retard | [late-opening-actions.ts](late-opening-actions.ts) → RPC `report_late_opening_to_bureau` (Bureau : heure d’ouverture + retard) ; enrichi au submit `opening_form` |
| Table | `opening_form` — upsert `onConflict: site_id,date` ; colonnes JSON `panneaux`, `affaires` |
| Colonnes récentes | `client_lat`, `client_lng`, `chrono_seconds`, parking, `panneaux`, `affaires` |
| RPC | `report_chrono_out_of_range` — message canal `bureau` + `intervention` urgente |
| RPC stock | `report_opening_low_stock_to_bureau` — Bureau si feuilles < 10 (`opening_low_feuilles`) ou tickets < 500 (`opening_low_tickets`) |
| RPC lundi | `report_monday_opening_issues_to_bureau` — kind `monday_opening_issues` si panneau/affaire manquant |
| Config site | `site_infos` / hook `useSiteTerrainConfig` (`fond_caisse`, `stand_confiserie`, `carte_parking`) |
| Carte parking | Non à l’ouverture → RPC `report_parking_card_missing` (canal Bureau) |
| RLS | Binôme planifié (`planning.user_id` / `double_id`) |

`user_id` = dernier soumetteur via `requireEmployeeSession()`.

## Transverse

- CRM : day-board [ouverture](../../../admin-desktop-app/app/(dashboard)/crm/ouverture/) + historique forms ; preview PWA affiche panneaux/affaires lundi ; alerte « Parking absent » si Non ; alertes stock bas sur canal Bureau (lecture seule).
- Cron Edge `opening-late` : push si créneau matin/après-midi sans ouverture.
- Résolution panne depuis ouverture : migration `gre_resolve_panne_from_opening`.

## Ne pas casser

- Toujours upsert, jamais insert seul.
- Coords GPS : validation serveur dans `actions.ts`.
- Chrono : **lundi** seulement ; secondes entières ; 1er hors borne = retry UI ; 2e = Bureau + ticket « chrono mal calibré à XminYsec ».
- Stock bas : un message Bureau par site × jour × seuil (`opening_low_feuilles` / `opening_low_tickets`), pas de spam au re-submit.
- Date mission = ISO Paris, pas `new Date()` brut côté serveur.
