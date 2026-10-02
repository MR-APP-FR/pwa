# Planning (lecture + validation)

## Métier

Vue hebdomadaire des affectations : où l’employé est teneur ou double. Pastille : nom du manège + heure d’arrivée seule (`site_infos.heures_semaine`) — `ouvre` (teneur) ou `double` (rôle double, fallback `ouvre`) ; pas de `ferme`. Ouverture / fermeture terrain utilisent les mêmes champs (`ouvre` / `double` / `ferme`). Après envoi CRM N+1, validation **semaine entière** (`planning_week_ack` + RPC `validate_planning_week`). Todo home si ack `pending` (lien `?week=`).

## Écran

- Route : `/planning` (query `?week=YYYY-MM-DD` = lundi cible)
- Page : [page.tsx](page.tsx)
- Action : [actions.ts](actions.ts) — `validatePlanningWeek`

## Technique

| Élément | Détail |
|---|---|
| Hook | [../../hooks/api/usePlanning.ts](../../hooks/api/usePlanning.ts) — `usePlanning` (semaine ±1 mois) |
| Acks | [../../hooks/api/usePlanningWeekAcks.ts](../../hooks/api/usePlanningWeekAcks.ts) — pending own |
| Table | `planning` (year, month, day, site_id, user_id, double_id, `closed`, `user_confirmed`, `double_confirmed`) |
| Ack | `planning_week_ack` (week_start, user_id, status, fingerprint) |
| RLS | SELECT si `user_id = me OR double_id = me` ; validation via RPC security definer |
| Messages | `markUnreadPlanningAssignedRead` à l’ouverture — pastille via RPC badges |

Validation = bouton « Valider mes attributions » → ack `validated` + flags confirmation sur les cases de la semaine.

## Transverse

- CRM [planning](../../../admin-desktop-app/components/crm/planning/) : envoi + dots rouges pending + re-notif si modif post-envoi.
- Ouverture / fermeture / info-jour : accès RLS binôme dérivé de cette table.

## Ne pas casser

- Filtrer via `useAppDate` — cohérent avec accueil et dispos.
- Deep-link `?week=` pour la todo home.
- Ne pas exposer le planning des autres employés (RLS suffit — ne pas bypass).
