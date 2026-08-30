# Boîte à idées

## Métier

Suggestions anonymes ou signées, hors fil messages bureau. Catégories matériel / organisation / ambiance / autres.

## Écran

- Route : `/suggestions`
- Page : [page.tsx](page.tsx)
- Action : [actions.ts](actions.ts) → RPC `submit_suggestion_anonyme`

## Technique

- RPC SECURITY DEFINER : pose `user_id = current_employee_id()` + flag `is_anonymous`.
- Table aval : `suggestion` (lecture CRM admin).

## Transverse

- CRM [suggestions](../../../admin-desktop-app/components/crm/suggestions/) : liste avec nom ou indicateur anonyme.

## Ne pas casser

- Ne pas insérer direct dans `suggestion` — passer par la RPC.
- Valider catégorie côté serveur (liste fermée).
