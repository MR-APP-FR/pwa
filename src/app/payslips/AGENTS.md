# Fiches de paie

## Métier

Consultation / téléchargement des PDF de paie de l’employé connecté. Upload uniquement côté CRM.

## Écrans

| Route | Rôle |
|---|---|
| `/payslips` | [page.tsx](page.tsx) — liste mois, Voir / Télécharger |

Entrée principale : tuile home **si** l’employé a ≥1 fiche (`hasMyPayslips`). Sinon la tuile reste « Boîte à idées ». Accès secondaire : section sur `/profil`.

## Technique

| Élément | Détail |
|---|---|
| Tables | `payslip` ; bucket privé `payslips` |
| Actions | `listMyPayslips`, `getPayslipSignedUrl`, `hasMyPayslips` dans [../profil/actions.ts](../profil/actions.ts) |
| UI | [PayslipsList](../../components/profil/PayslipsList.tsx) (`variant="page"`) ; chrome `FormScrollLayout` + `PageHeader` accent blue |
| Flag home | [useHasPayslips](../../hooks/useHasPayslips.ts) |

## Transverse

- CRM [payslips](../../../../admin-desktop-app/components/crm/payslips/) : upload admin.
- Profil : [PayslipsSection](../../components/profil/PayslipsSection.tsx) conserve la même liste en mode compact.

## Ne pas casser

- URL signée uniquement ; path doit commencer par `${userId}/`.
- Pas de badge home pour les fiches.
