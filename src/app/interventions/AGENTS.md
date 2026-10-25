# Interventions (mode maintenance)

## Métier

Parcours PWA du **technicien** (`public.user.role = 'maintenance'`). Voir / planifier / clôturer / reporter les tickets `intervention`. Pas de création de ticket en V1 (CRM + pannes info-jour).

## Route

- `/interventions` — [page.tsx](page.tsx), [actions.ts](actions.ts)
- Home `/` : si rôle maintenance → tuiles Interventions / Messages / Carte (pas ouverture/fermeture)

## Actions

| Action | Effet |
|---|---|
| `listMaintenanceInterventions` | Tickets `signalee` / `planifiee` (RLS maintenance) |
| `scheduleMaintenanceIntervention` | `assignee = moi`, `scheduled_at`, `planifiee` + note journal |
| `completeMaintenanceIntervention` | `cloturee` + note requise |
| `rescheduleMaintenanceIntervention` | nouvelle date + note requise |

Les notes s’accumulent dans `resolution_notes` (`[YYYY-MM-DD] …`) — timeline légère V1 (pas encore `intervention_visit`).

## RLS

- `is_maintenance_employee()` — `user.role = maintenance`
- SELECT : admin / reporter / assignee / maintenance
- UPDATE : assignee **ou** maintenance

## Transverse

- CRM : fiche staff **Rôle PWA** ; dialog interventions affiche `resolution_notes`
- Assignation CRM : liste staff filtrée sur `role = maintenance` s’il en existe

## Ne pas casser

- Ne pas ouvrir ce parcours aux teneurs (gate `isMaintenanceRole`)
- Photos / table visites = V2
