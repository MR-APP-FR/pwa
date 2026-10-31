# Edge Functions + pg_cron

## Métier

Jobs automatiques côté Supabase (plus de cron Vercel). Déclenchés par `pg_cron` + `pg_net` ou appel HTTP direct.

## Fonctions (`supabase/functions/`)

| Fonction | Rôle | API externe |
|---|---|---|
| [weather-sync/index.ts](weather-sync/index.ts) | Météo + enrichissement `site_weather`, `site_day_baseline` | Open-Meteo |
| [weather-brief/index.ts](weather-brief/index.ts) | 9h Paris : brief encourage + push (1 msg / employé planifié) | Web Push |
| [opening-late/index.ts](opening-late/index.ts) | Relance ouverture manquante (horaire effectif `site_day_hours` sinon fiche) | Web Push |
| [availability-reminder/index.ts](availability-reminder/index.ts) | Rappel dispos mercredi | Web Push |
| [claim-login/index.ts](claim-login/index.ts) | Login / claim MDP terrain par `login` ou `email` (appel PWA, `verify_jwt: false`) | Auth Admin |
| [admin-pwa-view/index.ts](admin-pwa-view/index.ts) | Vue terrain admin CRM : mint view_token + list/impersonate employés (`verify_jwt: false`) | Auth Admin |
| [ca-daily-pdf/index.ts](ca-daily-pdf/index.ts) | 21h Paris : canal `ca` + brief IA → `ai_insight` (`ca_daily_digest`) ; PDF au clic CRM | Azure Foundry |
| [ca-monthly-digest/index.ts](ca-monthly-digest/index.ts) | Brief IA CA mois → `ai_insight` (`ca_monthly_digest`) ; enrich message `ca_monthly_compare` ; ensure CRM `?month=YYYY-MM` | Azure Foundry |
| [ca-yearly-digest/index.ts](ca-yearly-digest/index.ts) | Brief IA CA année (KPI + courbe + manèges) → `ai_insight` (`ca_yearly_digest`) | Azure Foundry |
| [ca-site-digest/index.ts](ca-site-digest/index.ts) | Brief IA CA manège × mois (`ca_monthly_site_digest`) ou année (`ca_yearly_site_digest`) ; ensure CRM `?siteId=&month=` / `?siteId=&year=` | Azure Foundry |
| [ca-staff-digest/index.ts](ca-staff-digest/index.ts) | Analyse personne (CA / retards / seau) → `ai_insight` (`ca_staff_person_digest`, clé `userId:year`) ; CRM Lancer / Relancer | Azure Foundry |
| [bureau-digest/index.ts](bureau-digest/index.ts) | Digest « depuis hier » → `ai_insight` (`bureau_since_yesterday`) + message Bureau ; CRM ensure Messages | Azure Foundry |
| [staff-vivier-digest/index.ts](staff-vivier-digest/index.ts) | Alertes vivier mois → `ai_insight` (`staff_vivier_digest`, clé `YYYY-MM`) ; CRM ensure Users | Azure Foundry |
| [bureau-declaration-digest/index.ts](bureau-declaration-digest/index.ts) | Qui relancer Off → `ai_insight` (`bureau_declaration_monthly`) + enrich message Déclaration | Azure Foundry |
| [terrain-day-anomalies/index.ts](terrain-day-anomalies/index.ts) | Anomalies jour O/F → `ai_insight` (`terrain_day_anomalies`) ; bandeaux boards | Azure Foundry |
| [planning-week-digest/index.ts](planning-week-digest/index.ts) | Trous planning semaine → `ai_insight` (`planning_week_summary`) | Azure Foundry |
| [intervention-edt-digest/index.ts](intervention-edt-digest/index.ts) | Brief EDT + suggestions → `ai_insight` (`intervention_edt_week`) ; CRM Lancer | Azure Foundry |
| [bureau-weekly-digest/index.ts](bureau-weekly-digest/index.ts) | Hebdo qui déclarer → `ai_insight` (`bureau_weekly_declaration`) + enrich message `⚠️ Hebdo` | Azure Foundry |
| [terrain-forms-week-digest/index.ts](terrain-forms-week-digest/index.ts) | Synthèse O/F semaine → `ai_insight` (`terrain_forms_week`) ; bandeaux boards | Azure Foundry |
| [suggestions-cluster-digest/index.ts](suggestions-cluster-digest/index.ts) | Clustering idées ouvertes → `ai_insight` (`suggestions_cluster_digest`) ; CRM Lancer | Azure Foundry |
| [closing-vision/index.ts](closing-vision/index.ts) | Vision seau + parking → `ai_insight` ; submit PWA + batch date | Azure Foundry |
| [opening-vision/index.ts](opening-vision/index.ts) | Vision photo nettoyage veille → `ai_insight` (`opening_vision_nettoyage`) ; submit info-jour | Azure Foundry |
| [`_shared/ai-prompts.ts`](_shared/ai-prompts.ts) | **Tous les prompts LLM/vision** (+ versions cache) — éditer ici | — |
| [`_shared/foundry.ts`](_shared/foundry.ts) | Chat + vision Foundry ; env `FOUNDRY_*` (pas de LiteLLM) | Azure AI Foundry |
| [`_shared/ai-insight.ts`](_shared/ai-insight.ts) | Cache `ai_insight` (hash + prompt_version) | Postgres |
| [staff-push/index.ts](staff-push/index.ts) | Push ciblé (body `{ pushes: [{ userId, title, body, url? }] }`) — ex. DM carte parking | Web Push |

## pg_cron

Migration : [../migrations/20260827220000_gre_supabase_cron_jobs.sql](../migrations/20260827220000_gre_supabase_cron_jobs.sql)  
Rappel dispos : [../migrations/20260828120000_gre_week_staff_dispatch.sql](../migrations/20260828120000_gre_week_staff_dispatch.sql)  
Brief météo : [../migrations/20260906164900_gre_weather_brief_cron.sql](../migrations/20260906164900_gre_weather_brief_cron.sql)  
Copy partagée : [`_shared/encourage.ts`](_shared/encourage.ts) + catalogue JSON (aligné PWA `encourageCopy`).

Helpers : `internal.invoke_edge(name)` / `internal.invoke_edge_json(name, body)` — POST Edge avec secret Vault **`supabase_anon_key`**.

Jobs SQL sans Edge : anniversaires, hebdo bureau, CR auto mensuel (`internal.post_*`), catégories staff lundi (`internal.compute_staff_pool_scores` — migration `20261008190000_gre_staff_pool_score_weekly_cron.sql`).

## Ops

Détail horaires et secrets : [../../docs/OPS.md](../../docs/OPS.md).

## Ne pas casser

- Code Deno — exclu du typecheck Next (`tsconfig` / commit `27d2dfc`).
- Dupliquer la logique météo CRM (`lib/weather`) seulement si tu changes la recette — garder Edge + scripts alignés.
- Ne pas committer secrets Vault ; créer `supabase_anon_key` dans dashboard Supabase.
