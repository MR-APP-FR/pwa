@AGENTS.md

## Météo (lecture seule)

La PWA ne calcule pas la météo ni le passage côté Next. Elle lit `site_weather` (écrit par l'Edge Function `weather-sync` + pg_cron, Open-Meteo). Crons et APIs : [docs/OPS.md](docs/OPS.md).

- Hook : [src/hooks/api/useSiteWeather.ts](src/hooks/api/useSiteWeather.ts)
- Accueil : icône météo juste avant le nom du site (affectation du jour). Clic → popup avec le message. Toujours encourageant, même pluie / neige.
- Messages : le brief du jour est injecté automatiquement les jours d'affectation (badge non lu jusqu'à ouverture du popup ou de Messages).
- Copy : clés `screens.home.weather*` dans `src/i18n/{fr,en}.json`. Pas de tiret cadratin.

Recette (ciel, `crowd_level`) : `CLAUDE.md` parent. Ne pas recréer un sync Open-Meteo dans Next PWA (déjà dans l'Edge Function).
