# Interventions (mode maintenance)

## Métier

Parcours PWA du **technicien** (`public.user.role = 'maintenance'`). Work order multi-visites : créer / planifier / démarrer / pause / reprise / attente pièces / médias / terminer. Un ticket reste ouvert jusqu’à clôture explicite.

## Route

- Home `/` = board tech ([MaintenanceHomeBoard](../../components/interventions/MaintenanceHomeBoard.tsx)) sous logo + paramètres
- Vue **semaine** sticky (bandeau 7 jours) ; clic jour → liste du jour
- Retards (date prévue passée, non clôturés) : visibles **aujourd’hui** + file **Planifier** (pas de doublon sur le jour d’origine)
- Footer : **Nouveau** / **Planifier** (file zone→site) / **Pièces** (à commander · commandées · reçues)
- Sheets swipe-to-dismiss (`SwipeSheet`) ; `/interventions` redirige vers `/`
- Actions : [actions.ts](actions.ts)
- Profil tech : identité + notifs + déconnexion (pas CNI / paie / sites)

## Statuts

`signalee` → `planifiee` → `en_cours` ↔ `en_pause` → `en_attente` (pièces/retour) → replanif → `cloturee`

Helpers : [`lib/interventions/fsm.ts`](../../lib/interventions/fsm.ts)

## Tables

| Table | Rôle |
|---|---|
| `intervention` | Ticket (+ `hold_reason`, `active_visit_id`) |
| `intervention_visit` | Présence terrain |
| `intervention_time_segment` | Chrono start/pause |
| `intervention_event` | Timeline |
| `intervention_part` | Pièces à commander / reçues |
| `intervention_media` | Photos / vidéos (bucket `intervention-media`) |

## Actions

Créer, planifier, démarrer, pause, reprendre, hold, terminer, commentaire, pièces, upload média, détail timeline.

Une seule visite `en_cours`/`en_pause` à la fois par tech.

## RLS

- `is_maintenance_employee()` — SELECT / UPDATE / INSERT tickets
- Child tables via `can_access_intervention` / `can_mutate_intervention`

## Transverse

- CRM : timeline + pièces + galerie dans dialog site ([interventions CRM](../../../../admin-desktop-app/components/crm/interventions/AGENTS.md))
- Trigger `create_intervention_from_panne` : dédup ouvert site×sujet + event `created`

## Ne pas casser

- Hors maintenance : gate `isMaintenanceRole`
- Offline : submits bloqués (pas de queue)
- Vidéos : hint taille max ~40 Mo
