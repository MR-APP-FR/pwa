# Ops : crons, automatisations, APIs externes

État au **2026-09-20**. Source de vérité des jobs : `supabase/migrations/20260827220000_gre_supabase_cron_jobs.sql`, `20260828120000_gre_week_staff_dispatch.sql`, `20260906184500_gre_messages_ca_inter_channels.sql`, `20260906164900_gre_weather_brief_cron.sql`.

Pastilles CRM (admin) : RPC `get_crm_badge_counts` (`20260920094133_gre_crm_badge_counts_rpc.sql`) — compteurs ouverture/fermeture en retard + bureau non lu ; consommée par `CrmBadgesProvider` (poll 30s).

Hygiène RLS/index (`20260920100000_gre_crm_perf_rls_indexes.sql`) : initplan `auth.uid()` / `is_admin()`, drop SELECT admin redondants, drop indexes planning dupliqués.

Les horaires `pg_cron` sont en **UTC**. En été (CEST) : UTC+2.

## Ce qui n’est plus en production

Les crons **Vercel** du CRM sont **désactivés** (`admin-desktop-app/vercel.json` → `"crons": []`, commit CRM `074a420` du 2026-08-27). Les routes `GET /api/cron/*` existent encore pour un appel manuel avec `CRON_SECRET`, mais **rien ne les déclenche** automatiquement (sauf tests manuels). Le stub PDF CA 21h est posté par Edge `ca-daily-pdf`.

## pg_cron (Supabase)

| Job | Cron UTC | Paris (été) | Action |
|---|---|---|---|
| `bureau-birthdays-utc4` | `0 4 * * *` | 06:00 | SQL `internal.post_bureau_birthdays()` — message canal Bureau « Anniversaires » (corps 🎂) |
| `bureau-birthdays-utc5` | `0 5 * * *` | 07:00 | Idem (2e passage si le 1er a loupé / fuseau) |
| `bureau-weekly-utc7` | `0 7 * * 1` | lundi 09:00 | SQL `internal.post_bureau_weekly()` — message hebdo Bureau |
| `cr-auto-monthly-utc7` | `0 7 1 * *` | 1er du mois 09:00 | SQL `internal.post_cr_auto_monthly()` — canal `ca`, taux de déclaration |
| `ca-daily-pdf-utc19` | `0 19 * * *` | 21:00 | Edge `ca-daily-pdf` : message stub canal CA (PDF au clic admin) |
| `ca-daily-pdf-utc20` | `0 20 * * *` | 22:00 été / 21:00 hiver | Idem (2e passage fuseau) |
| `weather-sync-utc4` | `0 4 * * *` | 06:00 | Edge Function `weather-sync` via `internal.invoke_edge` |
| `weather-brief-utc7` | `0 7 * * *` | 09:00 | Edge Function `weather-brief` — message + push par employé planifié |
| `weather-brief-utc8` | `0 8 * * *` | 10:00 | Idem (2e passage DST ; gate Paris hour = 9) |
| `opening-late-every-15m` | `*/15 * * * *` | toutes les 15 min | Edge Function `opening-late` |
| `availability-reminder-utc7` | `0 7 * * 3` | mercredi 09:00 | Edge Function `availability-reminder` |
| `availability-reminder-utc8` | `0 8 * * 3` | mercredi 10:00 | Idem (2e passage) |

`internal.invoke_edge(name)` : `pg_net` POST vers  
`https://ooirydwzxltdtvlyhqar.supabase.co/functions/v1/<name>`  
avec le secret Vault **`supabase_anon_key`** (jamais dans git). Sans ce secret, les jobs Edge échouent.

Secrets Edge (dashboard Supabase, pas git) : `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (défaut `mailto:noreply@maneges-ravoire.fr`).  
`ca-daily-pdf` n’a **pas** besoin de `CRM_APP_URL` / `CRON_SECRET` : stub message seulement ; le PDF est généré au clic dans le CRM.

## Edge Functions (`pwa/supabase/functions/`)

| Fonction | Rôle | APIs |
|---|---|---|
| `weather-sync` | Open-Meteo forecast + archive ERA5, upsert `site_weather`, calendrier FR, `crowd_level` | Open-Meteo (sans clé) |
| `weather-brief` | 9h Paris : 1 `staff_message` + Web Push par employé planifié (catalogue encourage) | Web Push (VAPID) |
| `opening-late` | Créneaux matin / après-midi Paris : relance si ouverture manquante + Web Push | Web Push (VAPID) |
| `availability-reminder` | Mercredi : rappel dispos N+1 + Web Push | Web Push (VAPID) |
| `claim-login` | Login terrain par `public.user.login` **ou** `email` (sans filtre `actif`) : claim MDP 1re fois ou `signInWithPassword` ; `verify_jwt: false` | Auth Admin (service role) |
| `admin-pwa-view` | Vue admin CRM sur PWA : `mint` (JWT admin → view_token) / `list` / `impersonate` (magic-link employé) ; `verify_jwt: false` | Auth Admin (service role) |
| `ca-daily-pdf` | 21h Paris : message stub canal CA (PDF généré au clic CRM) | — |

## Déclenché par un humain (pas un cron)

| Action | Où | Effet |
|---|---|---|
| Envoi planning semaine N+1 | CRM | Messages ciblés + Web Push (`week_staff_dispatch`) |
| Création / envoi message staff | CRM | Web Push immédiat |
| Submit ouverture / fermeture / info-jour | PWA | upsert + triggers Postgres |
| Chrono lundi hors borne (2e essai) | PWA | RPC `report_chrono_out_of_range` → Bureau + intervention urgente |
| Carte parking absente (ouverture Non) | PWA | RPC `report_parking_card_missing` → canal Bureau |
| Stock bas à l’ouverture | PWA | RPC `report_opening_low_stock_to_bureau` → Bureau (feuilles < 10 / tickets < 500) |
| Manques lundi (panneaux / affaires Non) | PWA | RPC `report_monday_opening_issues_to_bureau` → Bureau (`monday_opening_issues`) |
| Création employé | CRM | `public.user` + login (pas d’Auth) ; claim PWA à la 1re connexion |
| Login / claim MDP terrain | PWA → Edge `claim-login` | crée Auth si absent, sinon vérifie MDP |
| Vue admin terrain | PWA login email `admin_emails` → Edge `admin-pwa-view` | cookie vue admin + switcher employé (`/profil`) |
| `npm run provision:auth-users` | PWA local | sync Auth ← `public.user` (dev uniquement) |
| `npm run weather:sync` / `backfill` / `enrich` | CRM local | même recette météo, service role |

## Triggers Postgres (réaction immédiate)

| Trigger / fonction | Sur | Effet |
|---|---|---|
| `create_intervention_from_panne` | `daily_info` INSERT/UPDATE | ticket `intervention` (dédup `daily_info_id, sujet`) |
| `notify_inter_panne_created` | `intervention` INSERT | message canal Inter |
| `sync_closing_form_to_data` | `closing_form` | alimente `data` (CA) |
| fermeture forcée → Bureau | `closing_form` | message canal Bureau |
| `report_chrono_out_of_range` | ouverture lundi (RPC) | message Bureau + intervention urgente |
| `report_parking_card_missing` | ouverture (RPC) | message Bureau carte parking absente |
| `report_opening_low_stock_to_bureau` | ouverture (RPC) | message Bureau stock feuilles / tickets bas |
| `report_monday_opening_issues_to_bureau` | ouverture lundi (RPC) | message Bureau panneaux / affaires manquants |
| `resolve_pannes_from_opening` | RPC ouverture | cloture tickets + message Inter |
| `staff_message_site_ids_one_zone` | `staff_message` | un message = Tous ou une zone |
| `set_updated_at` | plusieurs tables | `updated_at` |

## APIs et services externes

| Service | Usage | Clé | Apps |
|---|---|---|---|
| **Open-Meteo** `api.open-meteo.com/v1/forecast` | prévision J proche | aucune | Edge `weather-sync` (+ scripts CRM `lib/weather/open-meteo.ts` en manuel) |
| **Open-Meteo Archive** `archive-api.open-meteo.com/v1/archive` | ERA5, ~5 j de décalage | aucune | idem |
| **Google Maps JavaScript API** | cartes sites / manèges | `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | PWA + CRM |
| **Google Maps** liens `maps.google.com/?q=` | itinéraire mission | aucune | PWA |
| **Web Push** (protocole W3C, via `web-push`) | notifs messages, relances | VAPID public/private | CRM envoi, PWA abonnement, Edge relances |
| **Google Fonts** | Inter / Sora | aucune | PWA layout |
| **Supabase** Auth, Postgres, Storage, Edge, pg_cron, pg_net, Vault | backend | anon + service role | les deux |
| **Vercel** | hébergement Next | — | les deux ; **plus de cron Vercel** |

Pas d’autre API météo, pas de Nominatim, pas de FCM serveur dédié (les push passent par les endpoints du navigateur).

## Recette météo (rappel)

Ciel journée manège (`rain` / `normal` / `sun` / `snow`), pas le pire code WMO. `crowd_level` : moyenne d’enfants des jours comparables — `< 50` quiet, `50–149` typical, `≥ 150` busy. Détail dans `CLAUDE.md` parent, section « Météo et passage attendu ». **Production** : Edge `weather-sync`, plus le cron Vercel.

## Évolutions août 2026 (commits, pas un changelog git tagué)

Non exhaustif ; les messages de commit sont la trace fine.

**Infra / ops**
- pg_cron + Edge Functions (PWA `d850c71`, CRM `074a420`)
- Web Push messages bureau (PWA `30b3af5`, CRM `6d670d6`)
- Audit sécurité, photos Storage privées, upsert terrain (site, jour), dates Paris (PWA `98dd559`, CRM `c3d32f3`)
- Auth CRM email+password (CRM `6eeac95`) ; mot de passe temporaire forcé (PWA `414376c`) ; provision Auth à la création employé (CRM `58874a7`)

**Terrain PWA**
- Météo bandeau, messages (`1126ada`)
- Carte Google Maps, headers (`fff0caa`)
- GPS ouverture/fermeture, ouverture tardive, fiche staff (`b9d6a42`, `09b7a36`)
- Zone unique messages (`fe3babc`)
- Rappel dispos mercredi, badges (`0dd3765`)
- Carte parking selon `site_infos` (`685ecb4`)
- Badge profil, notifs, relance ouverture (`5a372a1`)

**CRM**
- Dashboard, météo, scoring, export CA (`f5e4d3a`)
- Messages chat, fiche staff (`8079943`)
- Canaux Bureau, crons d’alerte (`bb0ba35`)
- Envoi planning N+1 + push (`2600d13`)
- Chrono mercredi ouvertures (`52ccda1`) ; passé au lundi + alerte hors borne (août 2026)
- Toolbars, badge fermetures tardives (`667a574`)
