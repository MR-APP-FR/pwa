# Annuaire planning (tech)

## Métier

Vue **lecture seule** du planning parc pour les techniciens (`user.role = maintenance`) : quel teneur / double est sur quel site, avec téléphone pour appeler.

## Route

- `/annuaire` — gate `isMaintenanceRole` (sinon redirect `/`)
- Entrée : bouton footer **Qui où** sur [MaintenanceHomeBoard](../../components/interventions/MaintenanceHomeBoard.tsx)

## Données

| Élément | Détail |
|---|---|
| RPC | `get_tech_planning_directory(p_from, p_to)` — SECURITY DEFINER, gate `is_maintenance_employee()`, max 31 j |
| Action | [actions.ts](actions.ts) |
| Hook | [../../hooks/api/useTechPlanningDirectory.ts](../../hooks/api/useTechPlanningDirectory.ts) |
| UI | [../../components/annuaire/TechPlanningDirectoryBoard.tsx](../../components/annuaire/TechPlanningDirectoryBoard.tsx) |
| Types | `TechPlanningDirectoryRow` |

N’ouvre **pas** RLS `user_info` / `planning` full : seulement nom + `telephone` (+ couleur) via la RPC.

## Ne pas casser

- Hors maintenance : page + RPC refusent
- Ne pas réutiliser `/planning` teneur (own + validation)
