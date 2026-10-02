# Auth employé (identité RLS)

## Métier

Login terrain = **identifiant ou email** (`public.user.login` / `public.user.email`) + mot de passe.
Premier accès (claim) : si le compte existe et qu’aucun Auth n’est lié, le MDP saisi devient le MDP Supabase.
Identifiant / email inconnu → message « contacte Valeria ».
L’identité métier reste `public.user.id` (int), pas `auth.uid()`.

## Fichiers

| Fichier | Rôle |
|---|---|
| [employee.ts](employee.ts) | `requireEmployeeSession()` |
| [../../app/login/page.tsx](../../app/login/page.tsx) | Formulaire login |
| [claimLogin.ts](claimLogin.ts) | Fetch client → Edge `claim-login` (pas de Server Action : un RSC refresh vidait le form) |
| [../../components/auth/LoginForm.tsx](../../components/auth/LoginForm.tsx) | UI FormData + `setSession` (pas d’inputs `disabled` iOS ; pas de Server Action claim) |
| [../../app/premiere-connexion/](../../app/premiere-connexion/) | MDP temporaire (créations CRM) |

## Technique

Bridge SQL : `current_employee_id()` — `auth.users.email` ↔ `public.user.email`.

RLS `public.user` : SELECT des actifs (collègues) **ou** de sa propre ligne (`id = current_employee_id()`), même si `actif = false` — sinon profil / todos photo-CNI invisibles.

**Perf (bug sept. 2026)** : middleware + server `createClient` = `getSession()` + lock auth no-op. Ne **pas** réintroduire `getUser()` sur le hot path (latence Auth / Web Locks ~10 s). Détail : [pwa/AGENTS.md](../../AGENTS.md) règle 12 + CRM `admin-desktop-app/AGENTS.md`.

**Prod terrain** : Edge Function [`claim-login`](../../../supabase/functions/claim-login/) (service role côté Supabase, `verify_jwt: false`). La PWA Vercel n’a **pas** de service role.

**Vue admin CRM (prod)** : un email listé dans `admin_emails` peut se connecter à la PWA avec les **mêmes** id/MDP que le CRM. Edge [`admin-pwa-view`](../../../supabase/functions/admin-pwa-view/) (`verify_jwt: false`). Piège : middleware ne doit **pas** rediriger les Server Actions POST depuis `/login` (sinon spinner « Connexion… »). En vue admin : **pas** de mur `must_change_password` / `/premiere-connexion` (sinon « changer » est inaccessible).
1. `mint` — JWT admin → cookie httpOnly `pwa_admin_view` (HMAC, 7 j)
2. `list` / `impersonate` — view_token → liste employés / magic-link `token_hash` (session employé via `verifyOtp`)
UI : bandeau + panneau sur `/profil` ([AdminViewPanel](../../../components/auth/AdminViewPanel.tsx)). Après login : **navigation pleine page** (`location.assign`) — soft nav laissait une page beige vide. Pas de service role Vercel. Déconnexion = fin de vue admin.

Flux claim :
1. Lookup `public.user` par `login`, sinon par `email` (email profil requis pour Auth ; **`actif` non filtré** — un compte inactif peut se connecter)
2. `signInWithPassword` si Auth existe déjà
3. Sinon `createUser` + session (`must_change_password = false`)
4. Auth déjà présent + mauvais MDP → erreur (pas de réécriture)
5. MDP trop court (< 6) à la 1re claim → erreur `weak_password` (pas « incorrect »)

Provisioning local (dev / tests) :

```bash
npm run provision:auth-users  # SUPABASE_SERVICE_ROLE_KEY — pas le flux prod claim
```

CRM `createUser` : profil + `login` seulement (pas d’Auth). Même flux claim à la 1re connexion PWA.
CRM fiche staff : **Réinit. connexion PWA** (`resetEmployeePwaAuth`) supprime Auth pour un nouveau claim.

## Ne pas casser

- **Cause n°1 de bug** : email Auth ≠ email `public.user` → authentifié mais invisible RLS.
- Jamais accepter `userId` du client dans une action.
- Pas de `createServiceClient` dans la PWA runtime (claim = Edge).
- Variables dev : `DEV_LOGIN_EMAIL` / `DEV_LOGIN_PASSWORD` — **sans** préfixe `NEXT_PUBLIC_`.
- Avant go-live claim : chaque employé terrain doit avoir `login` + `email` renseignés ; ne pas pré-provisionner Auth avec MDP = email sinon collision.
