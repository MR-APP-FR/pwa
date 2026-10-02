# Accueil PWA (`/`)

## Métier

Écran d’atterrissage après login. L’employé voit son affectation du jour, la météo encourageante (popup), les raccourcis mission, les badges (messages, planning assigné, dispos), la bannière push et la relance ouverture tardive.

## Fichiers

| Fichier | Rôle |
|---|---|
| [../../app/page.tsx](../../app/page.tsx) | Page |
| [AssignmentBanner.tsx](AssignmentBanner.tsx) | Site + météo + lien mission ; **prochaine affectation** affiche les horaires (`ouvre`–`ferme`, ou `double`–`ferme` si rôle double) |
| [WeatherEncourageBanner.tsx](WeatherEncourageBanner.tsx) | Popup météo (toujours positif) |
| [../../lib/weather/encourageCopy.ts](../../lib/weather/encourageCopy.ts) | Titre + corps brief ; sélection par tags |
| [../../lib/weather/encourageMessages.fr.json](../../lib/weather/encourageMessages.fr.json) | ~100 variantes FR (météo, jour, saison, passage) |
| [LateOpeningPrompt.tsx](LateOpeningPrompt.tsx) | Relance si ouverture manquante (teneur seulement ; pas le double quand un teneur est planifié) |
| [HomeButton.tsx](HomeButton.tsx) | Tuiles navigation |
| [HomeAssistantCard.tsx](HomeAssistantCard.tsx) | Carte bas d’écran : robot zzz si rien à faire, sinon liste des actions badge |
| [../pwa/PushEnableBanner.tsx](../pwa/PushEnableBanner.tsx) | Activation Web Push |

## Hooks / données

- `useUpcomingPlanning` — affectation jour + prochaine (fenêtre 60 j, pas 3 mois)
- `useSitesHeuresOuverture` — horaires prochaine affectation
- `useSiteWeather` — lit `site_weather` (écrit par Edge `weather-sync`)
- `useUnreadStaffMessageCount`, `useUnreadPlanningAssignedCount` — RPC badges, pas d’inbox
- `usePendingPlanningAcks` — validation planning pending → todo + deep-link `?week=`
- `useAvailability` + `isAvailabilityReminderWindow` — badge dispos mercredi
- `useHomeAssistantTodos` — badges (messages, **validation planning**, dispos, photo, CNI, push)

## Transverse

- CRM lit les mêmes formulaires ; météo icône CA jour côté admin.
- Brief météo du matin : Edge `weather-brief` (9h Paris) → `staff_message` + Web Push (pas d’injection client).
- Popup accueil : toujours depuis `site_weather` + catalogue FR (utile avant 9h).

## Ne pas casser

- Copy i18n `screens.home.*` — pas de tiret cadratin.
- Corps brief FR : catalogue JSON tagué + pick stable `date|site_id` (même seed côté Edge `_shared/encourage`).
- Ne pas recalculer `crowd_level` ou ciel ici — afficher `site_weather` tel quel.
- Badges messages = compteur `staff_message` non lus uniquement.
