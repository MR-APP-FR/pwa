# Edge Functions + pg_cron

## Métier

Jobs automatiques côté Supabase (plus de cron Vercel). Déclenchés par `pg_cron` + `pg_net` ou appel HTTP direct.

## Fonctions (`supabase/functions/`)

| Fonction | Rôle | API externe |
|---|---|---|
| [weather-sync/index.ts](weather-sync/index.ts) | Météo + enrichissement `site_weather`, `site_day_baseline` | Open-Meteo |
| [weather-brief/index.ts](weather-brief/index.ts) | 9h Paris : brief encourage + push (1 msg / employé planifié) | Web Push |
| [opening-late/index.ts](opening-late/index.ts) | Relance ouverture manquante | Web Push |
| [availability-reminder/index.ts](availability-reminder/index.ts) | Rappel dispos mercredi | Web Push |
| [claim-login/index.ts](claim-login/index.ts) | Login / claim MDP terrain par `login` ou `email` (appel PWA, `verify_jwt: false`) | Auth Admin |
| [ca-daily-pdf/index.ts](ca-daily-pdf/index.ts) | 21h Paris : stub message canal `ca` (PDF au clic CRM) | — |

## pg_cron

Migration : [../migrations/20260827220000_gre_supabase_cron_jobs.sql](../migrations/20260827220000_gre_supabase_cron_jobs.sql)  
Rappel dispos : [../migrations/20260828120000_gre_week_staff_dispatch.sql](../migrations/20260828120000_gre_week_staff_dispatch.sql)  
Brief météo : [../migrations/20260906164900_gre_weather_brief_cron.sql](../migrations/20260906164900_gre_weather_brief_cron.sql)  
Copy partagée : [`_shared/encourage.ts`](_shared/encourage.ts) + catalogue JSON (aligné PWA `encourageCopy`).

Helper : `internal.invoke_edge(name)` — POST Edge avec secret Vault **`supabase_anon_key`**.

Jobs SQL sans Edge : anniversaires, hebdo bureau, CR auto mensuel (`internal.post_*`).

## Ops

Détail horaires et secrets : [../../docs/OPS.md](../../docs/OPS.md).

## Ne pas casser

- Code Deno — exclu du typecheck Next (`tsconfig` / commit `27d2dfc`).
- Dupliquer la logique météo CRM (`lib/weather`) seulement si tu changes la recette — garder Edge + scripts alignés.
- Ne pas committer secrets Vault ; créer `supabase_anon_key` dans dashboard Supabase.
