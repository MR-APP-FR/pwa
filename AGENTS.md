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
| Architecture transverse | [CLAUDE.md](CLAUDE.md) |
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
10. **Photos** : bucket privé `telecollecte-photos` — stocker le **path**, pas une URL publique.

## Commandes

```bash
cd pwa && npm run dev
cd pwa && npm run build
cd pwa && npm run lint
cd pwa && npm run provision:auth-users  # local, SERVICE_ROLE
```

Projet Supabase : `ooirydwzxltdtvlyhqar`. Changement schéma = migration dans `supabase/migrations/` + appliquer via MCP.
