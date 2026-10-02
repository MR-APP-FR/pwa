# PWA runtime (cutover, version)

## Métier

Garantir qu’une PWA installée (standalone / onglet) ne reste pas bloquée sur un vieux bundle après un deploy Vercel. Afficher une version lisible pour le support bugs (employé envoie un screenshot).

## Fichiers

| Fichier | Rôle |
|---|---|
| [cutover.ts](cutover.ts) | Clé one-shot unregister SW post-DNS |
| [app-version.ts](app-version.ts) | `APP_DISPLAY_VERSION` (UI) + `CLIENT_APP_VERSION` (reload) |
| [../../components/pwa/AppVersionLabel.tsx](../../components/pwa/AppVersionLabel.tsx) | Libellé « Version x.y.z · sha » |
| [../../components/pwa/PwaCutover.tsx](../../components/pwa/PwaCutover.tsx) | Purge SW/caches une fois |
| [../../components/pwa/PwaVersionWatcher.tsx](../../components/pwa/PwaVersionWatcher.tsx) | Check au focus → reload si SHA ≠ |
| [../../app/api/version/route.ts](../../app/api/version/route.ts) | `{ version }` no-store (SHA Vercel) |
| [../../../next.config.ts](../../../next.config.ts) | injecte `NEXT_PUBLIC_APP_VERSION` |

## Affichage version (support)

- Constante **`APP_DISPLAY_VERSION`** dans [app-version.ts](app-version.ts) — **à incrémenter à chaque release / deploy notable**.
- Affichée en bas de `/login` et en bas de `/profil` (paramètres) via `AppVersionLabel`.
- En prod : `1.0.0 · a1b2c3d` (version + 7 premiers chars du SHA Vercel). En local : `1.0.0` seul.

## Technique (reload auto)

- Build : `NEXT_PUBLIC_APP_VERSION` = `VERCEL_GIT_COMMIT_SHA` (sinon `VERCEL_DEPLOYMENT_ID`, sinon `dev`).
- Au mount + `visibilitychange` / `focus` (throttle 30 s) : fetch `/api/version` + `registration.update()`.
- Si serveur ≠ client → `location.reload()` (garde-fou `sessionStorage` anti-boucle).
- Local `dev` : pas de check.

## Ne pas casser

- Middleware exclut déjà `/api/` — ne pas y remettre auth.
- Ne pas cacher `/api/version` ni les navigations HTML dans `public/sw.js`.
