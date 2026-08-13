@AGENTS.md

## Météo (lecture seule)

La PWA ne calcule pas la météo ni le passage. Elle lit `site_weather` (écrit par le cron CRM, Open-Meteo).

- Hook : [src/hooks/api/useSiteWeather.ts](src/hooks/api/useSiteWeather.ts)
- Accueil : icône météo juste avant le nom du site (affectation du jour). Clic → popup avec le message. Toujours encourageant, même pluie / neige.
- Messages : le brief du jour est injecté automatiquement les jours d'affectation (badge non lu jusqu'à ouverture du popup ou de Messages).
- Copy : clés `screens.home.weather*` dans `src/i18n/{fr,en}.json`. Pas de tiret cadratin.

Recette (classification ciel, `crowd_level`, cron) : section « Météo et passage attendu » du `CLAUDE.md` parent (`ravoire-dev/main`). Ne pas recréer un sync Open-Meteo côté PWA.
