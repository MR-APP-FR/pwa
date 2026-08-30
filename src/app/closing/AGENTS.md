# Fermeture terrain

## Métier

Fin de journée : chiffres caisse (12 champs), checklist, photo télécollecte, enveloppe, GPS ancré sur l’ouverture. Fermeture forcée (loin du site ou avant 20h05 Paris) exige une raison et alerte le canal Bureau.

## Écran

- Route : `/closing`
- Page : [page.tsx](page.tsx)

## Technique

| Élément | Détail |
|---|---|
| Action | [actions.ts](actions.ts) → `submitClosing` |
| Table | `closing_form` — upsert `onConflict: site_id,date` |
| Geo | [../../lib/geo.ts](../../lib/geo.ts) `evaluateClosingForce` |
| Deadline | [../../lib/parisTime.ts](../../lib/parisTime.ts) `closingDeadlineParisFromDateIso` |
| Photo | Storage `telecollecte-photos` — path en DB |
| Partenaire | `partner_user_id` depuis `planning.double_id` |
| Trigger aval | `sync_closing_form_to_data` → table `data` (CA CRM) |

## Transverse

- CRM lit fermeture + CA agrégé ; badge « fermetures tardives » sidebar.
- Message Bureau auto si fermeture forcée (trigger SQL).

## Ne pas casser

- Ne pas plafonner enfants/recette côté client (fix août 2026).
- Les 12 champs numériques alimentent le CRM — ne pas renommer sans migration + CRM.
- Photo = upload puis path ; bucket privé (URLs signées côté CRM seulement).
- Distance fermeture vs coords **ouverture** du même jour, pas vs site seul.
