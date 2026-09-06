# Auth employé (identité RLS)

## Métier

Login terrain = **identifiant** (`public.user.login`) + mot de passe.
Premier accès (claim) : si le login existe et qu’aucun Auth n’est lié, le MDP saisi devient le MDP Supabase.
Login inconnu → message « contacte Valeria ».
L’identité métier reste `public.user.id` (int), pas `auth.uid()`.

## Fichiers

| Fichier | Rôle |
|---|---|
| [employee.ts](employee.ts) | `requireEmployeeSession()` |
| [../../app/login/page.tsx](../../app/login/page.tsx) | Formulaire login |
| [../../app/login/actions.ts](../../app/login/actions.ts) | Appelle Edge `claim-login` |
| [../../components/auth/LoginForm.tsx](../../components/auth/LoginForm.tsx) | UI + `setSession` |
| [../../app/premiere-connexion/](../../app/premiere-connexion/) | MDP temporaire (créations CRM) |

## Technique

Bridge SQL : `current_employee_id()` — `auth.users.email` ↔ `public.user.email`.

**Prod terrain** : Edge Function [`claim-login`](../../../supabase/functions/claim-login/) (service role côté Supabase, `verify_jwt: false`). La PWA Vercel n’a **pas** de service role.

Flux claim :
1. Lookup `public.user` par `login` (actif, email requis)
2. `signInWithPassword` si Auth existe déjà
3. Sinon `createUser` + session (`must_change_password = false`)
4. Auth déjà présent + mauvais MDP → erreur (pas de réécriture)

Provisioning local (dev / tests) :

```bash
npm run provision:auth-users  # SUPABASE_SERVICE_ROLE_KEY — pas le flux prod claim
```

CRM `createUser` : profil + `login` seulement (pas d’Auth). Même flux claim à la 1re connexion PWA.

## Ne pas casser

- **Cause n°1 de bug** : email Auth ≠ email `public.user` → authentifié mais invisible RLS.
- Jamais accepter `userId` du client dans une action.
- Pas de `createServiceClient` dans la PWA runtime (claim = Edge).
- Variables dev : `DEV_LOGIN_EMAIL` / `DEV_LOGIN_PASSWORD` — **sans** préfixe `NEXT_PUBLIC_`.
- Avant go-live claim : chaque employé terrain doit avoir `login` + `email` renseignés ; ne pas pré-provisionner Auth avec MDP = email sinon collision.
