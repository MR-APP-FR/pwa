# Routes PWA

Carte des écrans sous `src/app/`. Layout global : [layout.tsx](layout.tsx) (fonts, providers).

## Routes

| Route | Fichier | Rôle métier |
|---|---|---|
| `/` | [page.tsx](page.tsx) | Hub : affectation du jour, raccourcis mission, badges non-lus |
| `/login` | [login/page.tsx](login/page.tsx) | Email + mot de passe (`public.user`) |
| `/premiere-connexion` | [premiere-connexion/page.tsx](premiere-connexion/page.tsx) | Changement mot de passe temporaire (`must_change_password`) |
| `/planning` | [planning/page.tsx](planning/page.tsx) | Missions mois courant |
| `/availability` | [availability/page.tsx](availability/page.tsx) | Disponibilités semaine N+1 |
| `/mission` | [mission/page.tsx](mission/page.tsx) | Détail mission : ouverture, info-jour, fermeture |
| `/opening` | [opening/page.tsx](opening/page.tsx) | Formulaire ouverture (souvent depuis mission) |
| `/closing` | [closing/page.tsx](closing/page.tsx) | Formulaire fermeture + photo télécollecte |
| `/messages` | [messages/page.tsx](messages/page.tsx) | Conversations staff (canaux bureau, météo auto, etc.) |
| `/suggestions` | [suggestions/page.tsx](suggestions/page.tsx) | Boîte à idées |
| `/sites-map` | [sites-map/page.tsx](sites-map/page.tsx) | Carte Google des manèges |
| `/profil` | [profil/page.tsx](profil/page.tsx) | Fiche employé, documents, avatar |
| `/training` | [training/page.tsx](training/page.tsx) | Parcours formation (contenu statique / léger) |

## Dev only

- `dev/bypass-login`, `dev/switch-user` — jamais en prod Vercel sans garde-fous.

## Patterns techniques

- Pages interactives : `'use client'` + hooks Query.
- Mutations : `actions.ts` adjacent à la route (ou `src/lib/actions/` pour partagé).
- Navigation mission : query `siteId` + `date` (ISO).

## Ne pas casser

- Middleware/session : redirect `/login` si pas de session.
- Après login avec `must_change_password` → `/premiere-connexion` avant le reste.
- Voir [../components/home/AGENTS.md](../components/home/AGENTS.md) pour la home.
