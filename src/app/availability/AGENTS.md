# Disponibilités

## Métier

Chaque employé déclare ses dispos pour la **semaine prochaine** (créneaux par jour). Rappel automatique le mercredi (Edge `availability-reminder` + badge accueil).

## Écran

- Route : `/availability`
- Page : [page.tsx](page.tsx)
- Oui / Non par jour — **pas** de motif d’indispo (champ `note` plus saisi ; colonne DB gardée pour l’historique CRM)
- Si la semaine est déjà en DB : bandeau « déjà envoyées », toggles figés, bouton **Modifier mes disponibilités** → édition → **Enregistrer les modifications** (plus de re-envoi aveugle)

## Technique

| Élément | Détail |
|---|---|
| Action | [actions.ts](actions.ts) — upsert (`note` toujours `null` côté PWA) |
| Hook | [../../hooks/api/useAvailability.ts](../../hooks/api/useAvailability.ts) |
| Table | `availability` — clé employé × semaine |
| RLS | INSERT/UPDATE/SELECT own (`user_id = current_employee_id()`) |
| Fenêtre rappel | [../../lib/parisTime.ts](../../lib/parisTime.ts) `isAvailabilityReminderWindow` |

## Transverse

- CRM planning : grille dispos semaine.
- Table suivi envois : `week_staff_dispatch` (CRM écrit).

## Ne pas casser

- Upsert idempotent au retour sur l’écran (préremplissage + mode verrouillé si lignes existantes).
- Semaine N+1 calculée en Paris, pas en UTC Vercel.
- Offline = submit bloqué avec message.
