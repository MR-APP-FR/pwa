# Fermeture terrain

## Métier

Fin de journée : chiffres caisse, checklist, photo télécollecte, enveloppe, GPS ancré sur l’ouverture. Nettoyage : `nettoyage_fait` + photo seau (`photo_seau_*`) si oui, sinon `nettoyage_raison`. Frais divers (`frais` + `frais_raison` si > 0) déduits du calcul enveloppe. Fermeture forcée (loin du site ou avant 20h05 Paris) exige une raison et alerte le canal Bureau.

## Écran

- Route : `/closing`
- Page : [page.tsx](page.tsx)
- **Déjà soumis** : `useExistingClosingForm(site, date)` → lecture seule (banner, champs figés, photos via `LockedPhotoThumb` + URL signée, footer Retour).

## Technique

| Élément | Détail |
|---|---|
| Action | [actions.ts](actions.ts) → `submitClosingForm` |
| Prefill lock | [useExistingClosingForm](../../hooks/api/useExistingClosingForm.ts) ; hydrate une fois |
| Table | `closing_form` — upsert `onConflict: site_id,date` |
| Enveloppe | `recette − CB − payes − frais` (null → 0) ; confirmation UI avant Valider |
| Frais | `frais` numeric + `frais_raison` text (obligatoire si frais > 0) |
| Nettoyage | `nettoyage_fait`, `photo_seau_url` / `photo_seau_source` / `photo_seau_captured_at`, `nettoyage_raison` |
| Geo | [../../lib/geo.ts](../../lib/geo.ts) `evaluateClosingForce` |
| Deadline | [../../lib/parisTime.ts](../../lib/parisTime.ts) `closingDeadlineParisFromDateIso` |
| Photo | Storage `telecollecte-photos` — path en DB (`photo_url`, `photo_parking_url`, `photo_seau_url`) |
| Parking | Si `site_infos.carte_parking` : photo carte **ou** `photo_parking_raison` |
| Confiserie | Si `site_infos.stand_confiserie` : champ `closing_form.confiserie` → sync `data.confiserie` |
| Partenaire | `partner_user_id` depuis `planning.double_id` |
| Trigger aval | `sync_closing_form_to_data` → table `data` (CA + confiserie CRM) |

## Transverse

- CRM lit fermeture + CA agrégé + frais dans preview PWA ; même formule enveloppe [`closing-enveloppe.ts`](../../../admin-desktop-app/lib/utils/closing-enveloppe.ts).
- Message Bureau auto si fermeture forcée (trigger SQL).

## Ne pas casser

- Ne pas plafonner enfants/recette côté client (fix août 2026).
- Champs numériques + frais alimentent le CRM — ne pas renommer sans migration + CRM.
- Photo = upload puis path ; bucket privé (URLs signées côté CRM et PWA lock).
- Distance fermeture vs coords **ouverture** du même jour, pas vs site seul.
