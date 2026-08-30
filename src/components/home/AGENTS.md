# Accueil PWA (`/`)

## Métier

Écran d’atterrissage après login. L’employé voit son affectation du jour, la météo encourageante, les raccourcis mission, les badges (messages, planning assigné, dispos), la bannière push et la relance ouverture tardive.

## Fichiers

| Fichier | Rôle |
|---|---|
| [../../app/page.tsx](../../app/page.tsx) | Page |
| [AssignmentBanner.tsx](AssignmentBanner.tsx) | Site + météo + lien mission |
| [WeatherEncourageBanner.tsx](WeatherEncourageBanner.tsx) | Popup météo (toujours positif) |
| [LateOpeningPrompt.tsx](LateOpeningPrompt.tsx) | Relance si ouverture manquante |
| [HomeButton.tsx](HomeButton.tsx) | Tuiles navigation |
| [HomeAssistantCard.tsx](HomeAssistantCard.tsx) | Carte bas d’écran : robot zzz si rien à faire, sinon liste des actions badge |
| [../pwa/PushEnableBanner.tsx](../pwa/PushEnableBanner.tsx) | Activation Web Push |

## Hooks / données

- `usePlanning`, `useAppDate` — affectation jour
- `useSiteWeather` — lit `site_weather` (écrit par Edge `weather-sync`)
- `useUnreadStaffMessageCount`, `useUnreadPlanningAssignedCount`
- `useAvailability` + `isAvailabilityReminderWindow` — badge dispos mercredi
- `useWeatherBriefRead` — sync brief météo ↔ messages
- `useHomeAssistantTodos` — même sources que les badges (messages + météo, planning, dispos, photo, CNI, push)

## Transverse

- CRM lit les mêmes formulaires ; météo icône CA jour côté admin.
- Brief météo injecté côté DB/cron dans `staff_message` les jours d’affectation.

## Ne pas casser

- Copy i18n `screens.home.*` — pas de tiret cadratin.
- Ne pas recalculer `crowd_level` ou ciel ici — afficher `site_weather` tel quel.
- Badges = compteurs réels Query, pas de state local stale après ack.
