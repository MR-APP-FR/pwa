# Mission (hub journée)

## Métier

Centre opérationnel d’une journée sur un site : état ouverture / info-jour / fermeture, lien Maps, formulaires enchaînés.

## Écran

- Route : `/mission?siteId=&date=`
- Page : [page.tsx](page.tsx)

## Technique

| Élément | Détail |
|---|---|
| Hooks | `useMissionForms`, `useSiteHeuresOuverture`, `useSiteDailyInfoQuestions`, `useOpenSiteInterventions` |
| Info-jour | [../../lib/actions/daily-info.ts](../../lib/actions/daily-info.ts) — `daily_info`, `sujets` |
| Tables | `opening_form`, `closing_form`, `daily_info`, `sujets` |
| Maps lien | `https://maps.google.com/?q=lat,lng` si coords site |

Info-jour : upsert `(site_id, date)` ; pannes → trigger `intervention` côté CRM.

## Transverse

- CRM day-boards ouverture/fermeture + interventions.
- Photos nettoyage : même bucket privé que fermeture.

## Ne pas casser

- Accès mission seulement si planifié ce jour-là (UI + RLS).
- Questions info-jour = `site.daily_info_questions` (config CRM/sites).
- Création sujet : RLS insert limitée au site planifié.
