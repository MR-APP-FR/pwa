# Profil employé

## Métier

Consultation / mise à jour fiche staff : coordonnées, transports, documents (CNI, etc.), avatar. Première connexion si mot de passe temporaire.

## Écrans

| Route | Rôle |
|---|---|
| `/profil` | [page.tsx](page.tsx) + [actions.ts](actions.ts) |
| `/premiere-connexion` | [../premiere-connexion/page.tsx](../premiere-connexion/page.tsx) — `changeTemporaryPassword` |

## Technique

| Élément | Détail |
|---|---|
| Tables | `user_info`, `user_info_sites`, Storage documents |
| RLS | Own via `current_employee_id()` |
| Flag | `user.must_change_password` → redirect 1re connexion |
| Badge profil | Accueil : compteur photo + CNI + push. Sur `/profil`, cartes manquantes encadrées rouge + pastille « À faire ». |

Uploads : path en colonne, bucket privé (lecture CRM admin).

## Transverse

- CRM [users](../../../admin-desktop-app/components/crm/users/) : fiche complète, édition admin ; login sans Auth à la création.

## Ne pas casser

- Employé ne modifie que sa fiche (pas `public.user` métier sauf mot de passe Auth).
- Après changement MDP : RPC `mark_password_changed` / clear `must_change_password`.
- Types champs sensibles alignés CRM (RGPD — ne pas exposer en plus).
