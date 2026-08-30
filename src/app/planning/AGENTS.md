# Planning (lecture missions)

## Métier

Vue mensuelle des affectations : où l’employé est teneur ou double. Badge non lu si le bureau a publié un planning assigné (message staff).

## Écran

- Route : `/planning`
- Page : [page.tsx](page.tsx)

## Technique

| Élément | Détail |
|---|---|
| Hook | [../../hooks/api/usePlanning.ts](../../hooks/api/usePlanning.ts) |
| Table | `planning` (year, month, day, site_id, user_id, double_id) |
| RLS | SELECT si `user_id = me OR double_id = me` |
| Messages | `useUnreadPlanningAssignedCount` — lien message planning N+1 |

Pas de mutation ici — édition planning = CRM uniquement.

## Transverse

- CRM [planning](../../../admin-desktop-app/components/crm/planning/) : grille éditable + envoi semaine N+1.
- Ouverture / fermeture / info-jour : accès RLS binôme dérivé de cette table.

## Ne pas casser

- Filtrer par mois courant via `useAppDate` — cohérent avec accueil et dispos.
- Ne pas exposer le planning des autres employés (RLS suffit — ne pas bypass).
