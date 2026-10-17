# Profil employé

## Métier

Consultation / mise à jour fiche staff : coordonnées, transports, documents (CNI, etc.), avatar, fiches de paie (lecture). Première connexion si mot de passe temporaire.

## Écrans

| Route | Rôle |
|---|---|
| `/profil` | [page.tsx](page.tsx) + [actions.ts](actions.ts) ; panneau **Vue admin** si cookie `pwa_admin_view` |
| `/premiere-connexion` | [../premiere-connexion/page.tsx](../premiere-connexion/page.tsx) — `NewPasswordForm` (client) |

## Technique

| Élément | Détail |
|---|---|
| Tables | `user_info`, `user_info_sites` (manèges `actif` seulement), Storage documents ; `payslip` (lecture) |
| RLS | Own via `current_employee_id()` |
| Flag | `user.must_change_password` → redirect 1re connexion |
| Badge profil | Accueil : compteur photo + CNI + push. Sur `/profil`, cartes manquantes encadrées rouge + pastille « À faire ». Pas de badge pour les fiches de paie. |
| Fiches de paie | [PayslipsSection](../../components/profil/PayslipsSection.tsx) — toujours visible ; UI alignée sites accessibles (carte + pastille + actions texte Voir/Télécharger) ; URL signée `payslips` ; recharge si employé courant change |
| Version app | Bas de page (`AppVersionLabel`) — voir [pwa/AGENTS.md](../../lib/pwa/AGENTS.md) ; bump `APP_DISPLAY_VERSION` à chaque release |

Uploads CNI/avatar : path en colonne, bucket privé (lecture CRM admin). Fiches de paie : upload CRM uniquement.

## Transverse

- CRM [users](../../../admin-desktop-app/components/crm/users/) : fiche complète, édition admin ; login sans Auth à la création.
- CRM [payslips](../../../admin-desktop-app/components/crm/payslips/) : upload admin des PDF.
- Admin CRM sur PWA : [AdminViewPanel](../../components/auth/AdminViewPanel.tsx) + Edge `admin-pwa-view` — voir [auth/AGENTS.md](../../lib/auth/AGENTS.md).

## Ne pas casser

- Employé ne modifie que sa fiche (pas `public.user` métier sauf mot de passe Auth).
- Après changement MDP : RPC `mark_password_changed` / clear `must_change_password`.
- Types champs sensibles alignés CRM (RGPD — ne pas exposer en plus).
