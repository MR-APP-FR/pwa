# Fermeture terrain

## Métier

Fin de journée : chiffres caisse (12 champs), checklist, photo télécollecte, enveloppe, GPS ancré sur l’ouverture. Nettoyage : `nettoyage_fait` + photo seau (`photo_seau_*`) si oui, sinon `nettoyage_raison`. Fermeture forcée (loin du site ou avant 20h05 Paris) exige une raison et alerte le canal Bureau.

## Écran

- Route : `/closing`
- Page : [page.tsx](page.tsx)

## Technique

| Élément | Détail |
|---|---|
| Action | [actions.ts](actions.ts) → `submitClosing` |
| Table | `closing_form` — upsert `onConflict: site_id,date` |
| Nettoyage | `nettoyage_fait`, `photo_seau_url` / `photo_seau_source` / `photo_seau_captured_at`, `nettoyage_raison` |
| Geo | [../../lib/geo.ts](../../lib/geo.ts) `evaluateClosingForce` |
| Deadline | [../../lib/parisTime.ts](../../lib/parisTime.ts) `closingDeadlineParisFromDateIso` |
| Photo | Storage `telecollecte-photos` — path en DB (`photo_url`, `photo_parking_url`, `photo_seau_url`) |
| Parking | Si `site_infos.carte_parking` : photo carte rangée obligatoire (`photo_parking_*`) |
| Partenaire | `partner_user_id` depuis `planning.double_id` |
| Trigger aval | `sync_closing_form_to_data` → table `data` (CA CRM) |

## Transverse

- CRM lit fermeture + CA agrégé ; badge « fermetures tardives » sidebar ; photo parking / seau signées dans dialog fermeture (preview PWA section Remarques).
- Message Bureau auto si fermeture forcée (trigger SQL).

## Ne pas casser

- Ne pas plafonner enfants/recette côté client (fix août 2026).
- Les 12 champs numériques alimentent le CRM — ne pas renommer sans migration + CRM.
- Photo = upload puis path ; bucket privé (URLs signées côté CRM seulement).
- Distance fermeture vs coords **ouverture** du même jour, pas vs site seul.
