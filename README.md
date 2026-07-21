# Manège — PWA employés

Application Progressive Web App pour les employés terrain (planning, ouverture,
fermeture, disponibilités). Données persistées sur Supabase ; lecture admin dans
`admin-desktop-app`.

Projet Supabase : [ooirydwzxltdtvlyhqar](https://app.supabase.com/project/ooirydwzxltdtvlyhqar)  
Cadrage prod : [`docs/CADRAGE-PROD-PWA.md`](docs/CADRAGE-PROD-PWA.md)

## Prérequis

- Node 20+
- Variables dans `.env` (voir `.env.example`) :
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY` — **uniquement** pour le script de provisioning Auth
    (jamais dans Vercel / le client)

## Démarrage

```bash
npm install
npm run dev
```

Ouvre [http://localhost:3000](http://localhost:3000). Sans session → redirect `/login`.

## Authentification (phase test)

| Champ | Valeur |
|-------|--------|
| Email | `public.user.email` (aligné avec `auth.users`) |
| Mot de passe | le **login** métier (`public.user.login`) |

Exemple smoke : `cpoitier@laposte.net` / `celia_poitier`

Provisionner / synchroniser les comptes Auth :

```bash
# nécessite SUPABASE_SERVICE_ROLE_KEY dans .env
npm run provision:auth-users
```

> TODO produit : forcer le changement de mot de passe à la 1ʳᵉ connexion
> (hors scope tests terrain).

## Parcours de test manuel

1. Login → redirect `/`
2. Planning : missions de l’employé uniquement
3. Mission → Ouverture → submit → badge « ✓ faite » + lignes `opening_form` / `daily_info`
4. Fermeture + photo + case enveloppe → `closing_form` + photo bucket `telecollecte-photos`
5. Disponibilités semaine → upsert + préremplissage au retour
6. Logout → `/login` ; accès `/` sans session → redirect login
7. Admin : day-board ouverture (chip info-jour) ; planning (grille dispos / teneur grisé)

Hors ligne : les submits de formulaires sont **bloqués** avec un message clair
(pas de file Background Sync pour l’instant).

## Déploiement Vercel

Projet Vercel `pwa` — env Production / Preview / Development :

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

**Ne jamais** définir `SUPABASE_SERVICE_ROLE_KEY` sur Vercel.

## Migrations

```bash
supabase --workdir . migration list --linked
```

Migrations GRE récentes : disponibilités, idempotence formulaires, RLS stricte
(`supabase/migrations/202607221*`).
