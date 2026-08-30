# Accueil PWA (`/`)

## Métier

Écran d’atterrissage après login. L’employé voit son affectation du jour, la météo encourageante, les raccourcis mission, les badges (messages, planning assigné, dispos), le toggle « dispo dernière minute », la bannière push et la relance ouverture tardive.

## Fichiers

| Fichier | Rôle |
|---|---|
| [../../app/page.tsx](../../app/page.tsx) | Page |
| [AssignmentBanner.tsx](AssignmentBanner.tsx) | Site + météo + lien mission |
| [WeatherEncourageBanner.tsx](WeatherEncourageBanner.tsx) | Popup météo (toujours positif) |
| [LateOpeningPrompt.tsx](LateOpeningPrompt.tsx) | Relance si ouverture manquante |
| [HomeButton.tsx](HomeButton.tsx) | Tuiles navigation |
| [DispoDerniereMinuteToggle.tsx](DispoDerniereMinuteToggle.tsx) | Flag dispo immédiate |
| [../pwa/PushEnableBanner.tsx](../pwa/PushEnableBanner.tsx) | Activation Web Push |

## Hooks / données

- `usePlanning`, `useAppDate` — affectation jour
- `useSiteWeather` — lit `site_weather` (écrit par Edge `weather-sync`)
- `useUnreadStaffMessageCount`, `useUnreadPlanningAssignedCount`
- `useAvailability` + `isAvailabilityReminderWindow` — badge dispos mercredi
- `useWeatherBriefRead` — sync brief météo ↔ messages

## Transverse

- CRM lit les mêmes formulaires ; météo icône CA jour côté admin.
- Brief météo injecté côté DB/cron dans `staff_message` les jours d’affectation.

## Ne pas casser

- Copy i18n `screens.home.*` — pas de tiret cadratin.
- Ne pas recalculer `crowd_level` ou ciel ici — afficher `site_weather` tel quel.
- Badges = compteurs réels Query, pas de state local stale après ack.
