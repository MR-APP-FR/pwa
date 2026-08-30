# Auth employé (identité RLS)

## Métier

Login terrain email + mot de passe. L’identité métier est `public.user.id` (int), pas `auth.uid()`.

## Fichiers

| Fichier | Rôle |
|---|---|
| [employee.ts](employee.ts) | `requireEmployeeSession()` |
| [../../app/login/page.tsx](../../app/login/page.tsx) | Formulaire login |
| [../../app/premiere-connexion/](../../app/premiere-connexion/) | MDP temporaire |

## Technique

Bridge SQL : `current_employee_id()` — `auth.users.email` ↔ `public.user.email`.

Provisioning local :

```bash
npm run provision:auth-users  # SUPABASE_SERVICE_ROLE_KEY
```

Phase test : mot de passe = `public.user.login` (TODO prod : changement forcé).

## Ne pas casser

- **Cause n°1 de bug** : email Auth ≠ email `public.user` → authentifié mais invisible RLS.
- Jamais accepter `userId` du client dans une action.
- Pas de `createServiceClient` dans la PWA runtime.
- Variables dev : `DEV_LOGIN_EMAIL` / `DEV_LOGIN_PASSWORD` — **sans** préfixe `NEXT_PUBLIC_`.
