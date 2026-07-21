# Cadrage mise en production — PWA « Manège »

> Objectif : passer la PWA du **mode démo** à une **app de production**, avec toutes
> les données terrain persistées en base et exploitables dans `admin-desktop-app`.
>
> Doc jumeau côté admin : `admin-desktop-app/docs/CADRAGE-LECTURE-FORMULAIRES.md`
> (affichage/lecture des données produites ici).
>
> **L'authentification est volontairement la DERNIÈRE étape** : on fiabilise
> d'abord les flux de données en mode démo, puis on bascule sur la session réelle.

---

## 0. État des lieux (mis à jour le 2026-07-22 — étapes 1–6 go-live min. ✅)

| Flux | PWA écrit en base ? | Photo | Lisible dans l'admin ? | Reflet statut dans la PWA |
|------|--------------------|-------|------------------------|---------------------------|
| **Ouverture** (`opening_form`) | ✅ upsert idempotent | — | ✅ day-board + détail Dialog | ✅ bouton « ✓ fait » |
| **Fermeture** (`closing_form`) | ✅ upsert idempotent | ✅ bucket `telecollecte-photos` | ✅ day-board + détail + enveloppe | ✅ bouton « ✓ fait » + contrôle enveloppe |
| **Info-jour** (`daily_info`) | ✅ `submitDailyInfo` | ✅ photo nettoyage optionnelle | ✅ chip day-board + détail Dialog | — (multi-lignes, pas de statut unique) |
| **Disponibilités** (`availability`) | ✅ upsert idempotent | — | ✅ grille planning + TeneurSelect | ✅ prefill de la semaine |
| **Confirmation planning** | ❌ lecture seule (`user_confirmed`) | — | — | affiche mais ne modifie pas |

Auth (étape 5) :
- Login email + password (= `user.login`) ; middleware session ; RLS stricte (plus de policies `pwa demo anon %`).
- `user_id` dérivé de la session via `current_employee_id()` (plus de `userId` client).

---

## Étape 1 — Persister les disponibilités *(bloquant fonctionnel) — ✅ LIVRÉE*

Aujourd'hui `app/availability/page.tsx` fait uniquement `setSubmitted(true)` : **rien n'est
envoyé**. C'est le seul formulaire non branché.

1. **Table** `public.availability` (migration Supabase) :
   ```sql
   create table public.availability (
     id           bigint generated always as identity primary key,
     user_id      integer not null references public."user"(id),
     date         date not null,
     available    boolean not null,
     note         text,
     submitted_at timestamptz not null default now(),
     unique (user_id, date)          -- 1 réponse par jour → upsert idempotent
   );
   ```
2. **Server action** `app/availability/actions.ts` → `submitAvailability(userId, week[])`
   qui fait un `upsert` sur `(user_id, date)` (le collègue peut corriger sa dispo).
   Modèle : copier la structure de `app/opening/actions.ts` (validation + insert).
3. **Page** : remplacer `setSubmitted(true)` par un appel à l'action ; garder l'écran
   de succès uniquement après retour `{ ok: true }`, afficher l'erreur sinon.
4. **Statut** : renvoyer les jours déjà renseignés pour préremplir la semaine (lecture
   `availability` filtrée sur `user_id` + plage de dates).

> ⚠️ La plage vient de `searchParams` (`startDate`/`endDate`) sans validation → valider
> le format `YYYY-MM-DD` côté action comme dans les autres formulaires.

---

## Étape 2 — Compléter la photo du nettoyage veille (`daily_info`) — ✅ LIVRÉE (photo optionnelle)

Le type `DailyInfoRow` prévoit `photo_nettoyage_url` / `photo_source` / `photo_captured_at`
mais `submitDailyInfo` (`lib/actions/daily-info.ts`) **ne les écrit pas** et n'upload rien.

- Aligner `submitDailyInfo` sur `submitClosingForm` : si une photo est fournie, upload
  dans un bucket dédié (`nettoyage-photos` ou réutiliser `telecollecte-photos` avec un
  préfixe `nettoyage/`), puis renseigner les 3 colonnes.
- Décider produit : la photo de nettoyage est-elle **obligatoire** quand
  `nettoyage_veille = true` ? Sinon rester optionnelle.

---

## Étape 3 — Reflet du statut & idempotence + contrôle enveloppe fermeture

### 3a — Statut & idempotence — ✅ LIVRÉE

Migration `20260722130000_gre_form_idempotence.sql` appliquée. Validé en base réelle :
double soumission d'une même mission → 1 seule ligne (upsert), champs mis à jour, page
mission affiche « ✓ Ouverture faite » / « ✓ Fermeture faite » en vert dès que la ligne
existe.

1. **Contrainte d'unicité** `unique (site_id, date, user_id)` sur `opening_form` et
   `closing_form`. **`daily_info` volontairement exclue** : l'ouverture ET la fermeture y
   écrivent des lignes distinctes (nettoyage/pannes ouverture vs pannes de fin de
   journée) — c'est un journal multi-lignes par mission, pas un formulaire unique.
2. Actions `submitOpeningForm` / `submitClosingForm` passées en `upsert(onConflict:
   'site_id,date,user_id')`.
3. **Piège RLS rencontré** : passer un `insert` en `upsert` déclenche un `UPDATE` en cas
   de conflit — `opening_form`/`closing_form` n'avaient que des policies INSERT/SELECT
   (l'insert seul suffisait avant l'idempotence). Ajout de policies UPDATE symétriques
   (employé `current_employee_id()` + démo anon), cf. migration. **À retenir pour toute
   future table qui passe en upsert : vérifier qu'une policy UPDATE existe.**
4. **Hook** `hooks/api/useMissionForms.ts` : lit l'existence de `opening_form` /
   `closing_form` pour (site, date, employé sélectionné).
5. **UI mission** (`app/mission/page.tsx`) : bouton vert « ✓ Ouverture/Fermeture faite »
   si déjà soumis. `queryClient.invalidateQueries(['missionForms'])` après chaque submit
   pour rafraîchir immédiatement.
6. **Reste à faire (non bloquant)** : `closing_form.partner_user_id` — le type l'attend,
   l'action ne le renseigne pas → le brancher depuis le collègue (`double_id`) de la
   mission.

### 3b — Payes + contrôle enveloppe (fermeture) — ✅ LIVRÉE

Livré côté PWA (pas de migration : colonnes `paye_jour` / `paye_double` réutilisées).

1. **Sens métier + i18n** : labels/help `payeDuJour` / `payeDuDouble` = rémunération
   employé / double (plus d'encaissements clients). Section Paie en fin de formulaire
   (après pannes, avant notes / photo / submit). `paye_manquante_recuperee` inchangée
   (autre notion) mais **incluse** dans le calcul enveloppe si c'est une sortie espèces.
2. **Calcul enveloppe** (client, null → 0) :
   ```
   X (espèces) = recette_totale − carte_bleue − paye_jour − paye_double
                 − paye_manquante_recuperee
   Y (CB)      = carte_bleue
   ```
   X/Y non stockés (dérivables). Si `X < 0`, alerte visible.
3. **UI confirmation** : bloc « Contrôle enveloppe » juste avant Valider — case à
   cocher obligatoire ; submit bloqué sans confirmation.
4. **Admin** (hors PWA) : le détail fermeture (doc jumeau) doit encore afficher les
   payes avec le bon sens + le contrôle enveloppe recalculé (X/Y) a posteriori.

---

## Étape 4 — Contrat RLS (spec de sécurité) — ✅ LIVRÉE (doc ; démo intact)

> **Livrable** : contrat table-par-table actionnable pour l'étape 5.  
> **Non livré ici** : bascule stricte / retrait des policies `pwa demo anon *` / auth.  
> Inventaire live vérifié le **2026-07-22** sur le projet Supabase `ravoire-app`
> (`ooirydwzxltdtvlyhqar`) via `pg_policies`. RLS **déjà activée** sur toutes les
> tables listées ci-dessous.

### 4.0 — Principes & helpers

| Principe | Détail |
|----------|--------|
| **Double voie actuelle** | Policies `authenticated` auth-ready **+** policies permissives `pwa demo anon …` (`USING/WITH CHECK (true)`). |
| **Employé** | Accès limité à ses lignes : `user_id = current_employee_id()` (variantes ci-dessous). |
| **Admin** | Accès total : `is_admin()` (table `user_roles`, UUID Auth). |
| **Démo (aujourd'hui)** | Client PWA = rôle `anon` (clé publique, pas de session). `user_id` passé par le client → falsifiable. |
| **Étape 5 (cible)** | Session `authenticated` ; **DROP** de toutes les policies `pwa demo anon %` ; `user_id` dérivé de la session, plus du client. |

Helpers SQL (déjà en prod) :

```sql
-- Pont Auth UUID → public.user.id (via email, case-insensitive)
current_employee_id() → SELECT u.id FROM public."user" u
  JOIN auth.users a ON lower(a.email) = lower(u.email)
  WHERE a.id = auth.uid() LIMIT 1;

-- Admin dashboard
is_admin(user_uuid uuid DEFAULT auth.uid()) → EXISTS (
  SELECT 1 FROM user_roles WHERE user_id = user_uuid AND role = 'admin'
);
```

> ⚠️ **Pré-requis étape 5** : chaque employé PWA doit avoir le **même email** dans
> `auth.users` et `public.user`. Sans ça, `current_employee_id()` → NULL → aucune
> policy employé ne passe.

Sources migrations locales PWA :
- `supabase/migrations/20260722120000_gre_availability.sql` (table + RLS complète)
- `supabase/migrations/20260722130000_gre_form_idempotence.sql` (UPDATE opening/closing)
- `supabase/migrations/20260621180000_pwa_demo_employees_rpc.sql` (RPC démo)

Policies formulaires / démo / storage appliquées historiquement via MCP (GRE-55) :
`gre55_pwa_demo_anon_policies`, `gre55_pwa_telecollecte_photos_*` — **pas** de fichiers
locaux correspondants dans ce repo (uniquement en base + historique agent).

---

### 4.1 — Inventaire actuel (live) → contrat cible

Légende colonnes : **Démo** = policies `anon` actuelles ; **Auth-ready** = policies
`authenticated` déjà posées ; **Cible étape 5** = comportement après DROP des anon +
corrections listées en §4.2.

#### `opening_form`

| Op | Démo (`anon`) | Auth-ready (`authenticated`) | Cible étape 5 |
|----|---------------|------------------------------|---------------|
| SELECT | `true` | `user_id = current_employee_id()` | garder employé + `is_admin()` ALL |
| INSERT | `true` | `user_id = current_employee_id()` | idem |
| UPDATE | `true` | `user_id = current_employee_id()` | idem (requis par upsert) |
| DELETE | — | via admin ALL | admin only |

Policies live : `opening_form admin all`, `… employee select/insert/update own`,
`pwa demo anon select/insert/update opening_form`.

#### `closing_form`

| Op | Démo | Auth-ready | Cible étape 5 |
|----|------|------------|---------------|
| SELECT | `true` | `user_id = current_employee_id() OR partner_user_id = current_employee_id()` | garder (partenaire = double mission) |
| INSERT | `true` | `user_id = current_employee_id()` | idem |
| UPDATE | `true` | `user_id = current_employee_id()` | idem (upsert) |
| DELETE | — | admin ALL | admin only |

> Note : `partner_user_id` n'est pas encore renseigné par la PWA (reste 3a) — la clause
> SELECT partenaire est déjà prête pour le jour où il le sera.

#### `daily_info`

| Op | Démo | Auth-ready | Cible étape 5 |
|----|------|------------|---------------|
| SELECT | `true` | `user_id = current_employee_id()` | garder |
| INSERT | `true` | `user_id = current_employee_id()` | garder |
| UPDATE | — | — | **pas nécessaire** tant que journal insert-only (pas d'upsert) |
| DELETE | — | admin ALL | admin only |

> Multi-lignes volontaire (ouverture + fermeture écrivent des lignes distinctes) — pas
> de contrainte unique, donc pas de piège UPDATE pour l'instant.

#### `availability`

| Op | Démo | Auth-ready | Cible étape 5 |
|----|------|------------|---------------|
| SELECT | `true` | `user_id = current_employee_id()` | garder |
| INSERT | `true` | `user_id = current_employee_id()` | garder |
| UPDATE | `true` | `user_id = current_employee_id()` | garder (upsert `(user_id, date)`) |
| DELETE | — | admin ALL | admin only |

Référence locale complète : `20260722120000_gre_availability.sql`.

#### `planning`

| Op | Démo | Auth-ready **actuel** | Cible étape 5 |
|----|------|----------------------|---------------|
| SELECT | `true` | **`true` pour tout `authenticated`** ⚠️ | **restreindre** : `user_id = current_employee_id() OR double_id = current_employee_id()` |
| INSERT/UPDATE/DELETE | — | admin ALL (`is_admin()`) | admin only ; PWA ne confirme pas encore (`user_confirmed` lecture seule) |

PWA lit déjà avec `.or(user_id.eq.X, double_id.eq.X)` (`usePlanning`) — le filtre
appli ne suffit pas : en auth réelle, un employé authentifié peut aujourd'hui lire
**tout** le planning via l'API.

#### `user`

| Op | Démo | Auth-ready actuel | Cible étape 5 |
|----|------|-------------------|---------------|
| SELECT | `true` (toute la table) | `true` (toute la table) | **option A (recommandée)** : SELECT `authenticated` sur employés actifs uniquement (`actif IS DISTINCT FROM false`) — nécessaire pour afficher le collègue du planning ; **option B** : SELECT own + RPC/colleague lookup. Admin ALL. |
| INSERT/UPDATE/DELETE | — | admin ALL | admin only |

#### `user_info`

| Op | Démo | Auth-ready actuel | Cible étape 5 |
|----|------|-------------------|---------------|
| SELECT | `true` | policies **legacy** (JWT claim `user_id` / `user.role = 'admin'` + clause employé **tautologique**) ⚠️ | réécrire : employé `user_id = current_employee_id()` ; admin `is_admin()` |
| UPDATE | — | legacy (même dette) | own ou admin |
| INSERT/DELETE | — | legacy admin | `is_admin()` only |

#### `user_info_sites`

| Op | Démo | Auth-ready actuel | Cible étape 5 |
|----|------|-------------------|---------------|
| SELECT | `true` | `true` pour public (`Authenticated users can view…`) | employé : sites liés à **son** `user_info` ; admin ALL |
| écritures | — | legacy admin via JWT claim | `is_admin()` |

#### `site` (+ `site_infos`)

| Table | Démo | Auth-ready actuel | Cible étape 5 |
|-------|------|-------------------|---------------|
| `site` | SELECT `true` | SELECT `true` + admin ALL | SELECT référentiel OK pour tout `authenticated` ; écritures admin only |
| `site_infos` | SELECT `true` | SELECT/INSERT/UPDATE/DELETE **`true` pour tout `authenticated`** ⚠️ | SELECT `authenticated` OK ; **écritures → `is_admin()` only** |

#### Tables satellites PWA (hors liste nominative mais nécessaires)

| Table | Démo | Auth-ready | Cible étape 5 |
|-------|------|------------|---------------|
| `sujets` | SELECT + INSERT `true` | CRUD `true` pour tout `authenticated` ⚠️ | SELECT all ; INSERT employé (création panne manquante) ; UPDATE/DELETE → admin |
| `intervention` | SELECT + INSERT `true` | insert `reported_by = current_employee_id()` ; select own/assignee ; admin ALL | garder auth-ready ; DROP anon (le trigger `create_intervention_from_panne` tourne alors en `authenticated`) |

#### Storage — bucket `telecollecte-photos` (public aujourd'hui)

| Op | Démo (`anon`) | Auth-ready | Cible étape 5 |
|----|---------------|------------|---------------|
| SELECT | `bucket_id = 'telecollecte-photos'` | **absent** | `authenticated` SELECT (ou bucket **privé** + `createSignedUrl` côté admin/PWA) |
| INSERT | idem | **absent** | `authenticated` INSERT ; idéalement path `…/user-{current_employee_id()}/…` |
| UPDATE | — | — | requis si upsert Storage ; sinon laisser `upsert: false` (comportement PWA actuel) |
| DELETE | — | — | admin / service_role |

Chemins PWA actuels :
- fermeture : `{date}/site-{siteId}/user-{userId}/{ts}.ext`
- nettoyage : `nettoyage/{date}/site-{siteId}/user-{userId}/{ts}.ext` (même bucket)

> URL stockée = `getPublicUrl` → bucket public = photos **devinables**. Trancher avec
> l'admin (doc jumeau étape 2) : garder public vs privé + path en base + URL signée.

#### RPC démo

| Objet | État | Étape 5 |
|-------|------|---------|
| `get_demo_employees()` | `SECURITY DEFINER`, `GRANT … TO anon` | `REVOKE` + drop ou garder admin-only ; retirer usage PWA |

---

### 4.2 — Gaps & pièges (checklist étape 5)

1. **Piège upsert → UPDATE** (déjà vécu §3a) : toute table passée en `upsert` doit avoir
   SELECT + INSERT + **UPDATE** employé (et démo anon tant que démo). `daily_info`
   n'est pas concernée tant qu'elle reste insert-only.
2. **Lecture planning trop large** : policy `Allow authenticated users to read planning`
   = `USING (true)` → à remplacer par filtre `user_id` / `double_id`.
3. **`user_info` legacy** : ne s'appuie pas sur `current_employee_id()` / `is_admin()` ;
   clause « own » tautologique → à réécrire avant/avec l'auth.
4. **`site_infos` / `sujets` écrits trop ouverts** pour tout `authenticated` → restreindre
   les écritures (admin ; sujets INSERT employé OK).
5. **Storage** : pas de policies `authenticated` ; bucket public ; pas de garde sur le
   préfixe `user-{id}`. À l'étape 5 : ajouter policies auth **avant** de DROP les anon
   (sinon upload casse), puis retirer anon.
6. **Pas de policy DELETE employé** sur les formulaires — souhaitable (on garde).
7. **Bridge email** `current_employee_id()` : valider la couverture employés PWA
   (emails alignés Auth ↔ `public.user`) avant d'activer le strict.
8. **Server actions** : après auth, ne plus accepter `userId` client — dériver via
   session / `current_employee_id()` (sinon RLS OK mais usurpation possible si un jour
   une policy est trop large).
9. **Migrations GRE-55 anon/storage absentes du repo local** : à l'étape 5, versionner
   le script de DROP (`DROP POLICY IF EXISTS "pwa demo anon …"`) dans
   `supabase/migrations/` pour reproductibilité.

---

### 4.3 — Matrice de bascule (ordre recommandé à l'étape 5)

```
1. Auth login + middleware + mapping email vérifié
2. Server actions : user_id depuis session
3. Ajouter policies storage authenticated (+ option bucket privé)
4. Resserrer planning / user_info / site_infos / sujets (écritures)
5. DROP POLICY "pwa demo anon %"  (toutes tables + storage)
6. REVOKE get_demo_employees FROM anon ; retirer profile switcher
7. Smoke test : ouverture / fermeture+photo / daily_info+nettoyage / dispos / planning
```

**Étape 4 = spec uniquement** (démo intact à ce stade). Activation livrée en
**étape 5** via `20260722140000_gre_auth_rls_strict.sql`.

---

## Étape 5 — Authentification réelle ✅ LIVRÉE *(GRE-54/88/90)*

Mode démo remplacé par session Supabase Auth + RLS stricte (contrat §4 activé).

### Décision produit — credentials (phase test — mécanique à garder)

- **Identifiant** = email employé (`public.user.email` = `auth.users.email`).
- **Mot de passe initial** = le **username** métier (`public.user.login`).
- Objectif : onboarding test sans envoi d'emails ; **même flux** après validation.

### Livré

1. **Login** `/login` — email + password (`src/app/login`, `components/auth/LoginForm`).
2. **Provisioning** : `scripts/provision-test-auth-users.mjs`
   (`npm run provision:auth-users`, nécessite `SUPABASE_SERVICE_ROLE_KEY`).
   Password = `login`, email aligné ; upsert (create ou reset password).
3. **Middleware** `src/middleware.ts` + `lib/supabase/middleware.ts` — refresh session,
   redirect `/login` si anon.
4. **Bridge** `current_employee_id()` validé (smoke : login → RPC → id employé).
5. **`useCurrentUser`** : session + `rpc('current_employee_id')` (plus de profileStore).
6. **Server actions** : `requireEmployeeSession()` — plus de `userId` client
   (opening / closing / availability / daily_info).
7. **RLS** : migration `20260722140000_gre_auth_rls_strict.sql` appliquée
   (planning user_id/double_id, user_info rewrite, site_infos/sujets writes,
   storage authenticated, DROP `pwa demo anon %`, REVOKE `get_demo_employees` anon).
8. **Nettoyage démo** : profileStore, demoStore, useDemoDate → `useAppDate`,
   useEmployees, ProfileSwitcher, bloc Admin profil, mocks, bannière « Mode démo ».

### TODO post-test (hors scope étape 5)

- **Forcer le changement de mot de passe à la 1ʳᵉ connexion** : flag
  (`user_metadata.must_change_password` ou table) + page `/change-password`
  bloquante tant que non changé. Ne pas bloquer le login test tant que non livré.

### Smoke validé (2026-07-22)

- Login email + password(=login) → JWT + `current_employee_id()` OK.
- Upsert `availability` en session OK ; lecture `planning` filtré OK.
- 0 policy `pwa demo anon %` restante.

---

## Étape 6 — Durcissement production (hygiène) — ✅ go-live minimal

Scope réduit livré pour démarrer les tests terrain (pas de feature produit nouvelle).

| Item | État |
|------|------|
| **Boundaries** `error.tsx` / `global-error.tsx` / `loading.tsx` / `not-found.tsx` | ✅ |
| **Offline formulaires** : bloquer submit + message i18n (pas de Background Sync) | ✅ |
| **README** réel (login, provision, parcours test, Vercel) | ✅ |
| **Env Vercel** `pwa` : `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` (alignés local ; pas de service_role) | ✅ |
| **Service worker** | ⚠️ dette : `next-pwa` en dep mais non used ; `public/sw.js` manuel network-first (`manege-v2`). Ne pas refactorer tant qu'aucun bug cache bloquant. |
| Retirer `console.*` / CI | ❌ hors scope tests terrain |

### Hygiène données (non bloquant)

- Employé `id=354` (`summer_landauer_old`) : email invalide `landauersummer@gmail.com_old`
  → bloque le provision Auth pour cette ligne. Compte actif réel = `id=367`
  (`landauersummer@gmail.com` / `summer_landauer`). Corriger ou désactiver `354` si besoin.

### TODO post-test (inchangé)

- Forcer le changement de mot de passe à la 1ʳᵉ connexion (cf. étape 5).
- Admin étape 4 (historique Formulaires) / bucket privé + signed URLs : hors scope go-live.

---

## Ordre de livraison recommandé

```
1. Disponibilités en base          ✅
2. Photo nettoyage veille          ✅
3a. Statut + idempotence           ✅
3b. Payes + contrôle enveloppe     ✅
4. Contrat RLS                     ✅
5. Auth réelle + activation RLS    ✅
6. Durcissement go-live min.       ✅ (SW = dette)
```

Admin (doc jumeau) : détail ouverture/fermeture/info-jour + grille dispos ✅.
Reste hors scope tests : historique Formulaires (étape 4 admin), bucket privé.
