<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# PWA employés — guide agent

Next **16** App Router (`src/`), React 19, Tailwind 4, TanStack Query, Zustand. Pas de service role en runtime Vercel.

## Avant de coder

| Sujet | Lire |
|---|---|
| Carte des routes | [src/app/AGENTS.md](src/app/AGENTS.md) |
| Accueil, météo, badges | [src/components/home/AGENTS.md](src/components/home/AGENTS.md) |
| Ouverture | [src/app/opening/AGENTS.md](src/app/opening/AGENTS.md) |
| Fermeture | [src/app/closing/AGENTS.md](src/app/closing/AGENTS.md) |
| Planning / dispos | [src/app/planning/AGENTS.md](src/app/planning/AGENTS.md), [src/app/availability/AGENTS.md](src/app/availability/AGENTS.md) |
| Messages | [src/app/messages/AGENTS.md](src/app/messages/AGENTS.md) |
| Mission / carte sites | [src/app/mission/AGENTS.md](src/app/mission/AGENTS.md), [src/app/sites-map/AGENTS.md](src/app/sites-map/AGENTS.md) |
| Profil / 1re connexion | [src/app/profil/AGENTS.md](src/app/profil/AGENTS.md) |
| Boîte à idées | [src/app/suggestions/AGENTS.md](src/app/suggestions/AGENTS.md) |
| Auth / identité RLS | [src/lib/auth/AGENTS.md](src/lib/auth/AGENTS.md) |
| Web Push | [src/lib/push/AGENTS.md](src/lib/push/AGENTS.md) |
| Crons / Edge Functions | [supabase/functions/AGENTS.md](supabase/functions/AGENTS.md) |
| Ops (APIs, pg_cron) | [docs/OPS.md](docs/OPS.md) |
| Architecture transverse | [../AGENTS.md](../AGENTS.md) (workspace) |
| Audit août 2026 | [docs/AUDIT-2026-08.md](docs/AUDIT-2026-08.md) |

## Règles globales (toujours)

1. **`user_id`** : toujours `requireEmployeeSession()` côté server action — jamais depuis le client ([src/lib/auth/employee.ts](src/lib/auth/employee.ts)).
2. **Formulaires terrain** : `upsert` sur `(site_id, date)` — une ligne par site × jour, pas par employé.
3. **Dates** : Europe/Paris via [src/lib/parisTime.ts](src/lib/parisTime.ts) (`toIsoDateString`, `parseIsoDateAsLocalDate`).
4. **Offline** : `isBrowserOffline()` bloque les submits — pas de queue offline.
5. **i18n** : clés dans `src/i18n/{fr,en}.json` + `useTranslation()`.
6. **Types DB** : `src/database/types/*.types.ts` — écrits à la main, aligner avec les migrations PWA.
7. **Mutations** : server actions dans `src/app/*/actions.ts` ou `src/lib/actions/`.
8. **Lectures** : TanStack Query dans `src/hooks/api/*`.
9. **Pas de sync Open-Meteo** dans Next — lecture `site_weather` seulement.
10. **Photos** : buckets privés `telecollecte-photos` (terrain) et `site-photos` (fiche manège) — stocker le **path**, pas une URL publique.
11. **Impact écosystème** : toute modif terrain / DB → proposer aussi CRM (dialogs, types, boards) — voir [../AGENTS.md](../AGENTS.md) § Impact écosystème.

## Commandes

```bash
cd pwa && npm run dev
cd pwa && npm run build
cd pwa && npm run lint
cd pwa && npm run provision:auth-users  # local, SERVICE_ROLE
# one-shot metro OSM (dry-run défaut ; --apply pour écrire) :
# SUPABASE_SERVICE_ROLE_KEY=... node scripts/fill-site-metro-from-osm.mjs
```

Projet Supabase : `ooirydwzxltdtvlyhqar`. Changement schéma = migration dans `supabase/migrations/` + appliquer via MCP.

## Maintenance doc (obligatoire)

Sans qu’on te le demande, mets à jour la doc **dans le même PR / commit** que le code :

| Changement | Fichiers |
|---|---|
| Route, action, hook, table touchée | `AGENTS.md` du dossier ([index ci-dessus](#avant-de-coder)) + [src/app/AGENTS.md](src/app/AGENTS.md) si nouvelle route |
| Migration / RLS / trigger | Section + [../AGENTS.md](../AGENTS.md) § tables si CRM impacté |
| Edge Function, pg_cron, env secret | [docs/OPS.md](docs/OPS.md), [supabase/functions/AGENTS.md](supabase/functions/AGENTS.md) |
| Feature notable août+ | Une ligne [docs/AUDIT-2026-08.md](docs/AUDIT-2026-08.md) |

Changement aussi côté CRM → rappeler dans le commit que l’autre dépôt doit être aligné (deux repos).
