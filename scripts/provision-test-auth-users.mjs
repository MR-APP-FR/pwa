#!/usr/bin/env node
/**
 * Provisionne des comptes Auth pour les employés actifs (phase test).
 *
 * Règles (CADRAGE étape 5) :
 * - email Auth = public.user.email (pré-requis current_employee_id())
 * - password initial = public.user.login (username métier)
 *
 * Usage :
 *   SUPABASE_SERVICE_ROLE_KEY=... node scripts/provision-test-auth-users.mjs
 *   SUPABASE_SERVICE_ROLE_KEY=... node scripts/provision-test-auth-users.mjs --limit=5
 *   SUPABASE_SERVICE_ROLE_KEY=... node scripts/provision-test-auth-users.mjs --email=foo@bar.com
 *
 * Dry-run (aucune écriture) :
 *   node scripts/provision-test-auth-users.mjs --dry-run
 */

import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://ooirydwzxltdtvlyhqar.supabase.co';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const limitArg = args.find((a) => a.startsWith('--limit='));
const emailArg = args.find((a) => a.startsWith('--email='));
const limit = limitArg ? Number(limitArg.split('=')[1]) : null;
const onlyEmail = emailArg ? emailArg.split('=')[1]?.toLowerCase() : null;

if (!serviceKey && !dryRun) {
  console.error(
    'SUPABASE_SERVICE_ROLE_KEY manquant.\n' +
      '  export SUPABASE_SERVICE_ROLE_KEY="$(supabase --workdir . projects api-keys --project-ref ooirydwzxltdtvlyhqar -o env | grep SERVICE_ROLE | cut -d= -f2-)"\n' +
      '  # ou récupérer la clé service_role dans le dashboard Supabase',
  );
  process.exit(1);
}

const admin = serviceKey
  ? createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;

async function listActiveEmployees() {
  // Via service role (bypass RLS)
  const { data, error } = await admin
    .from('user')
    .select('id, login, email, fullname, actif')
    .eq('actif', true)
    .not('email', 'is', null)
    .neq('email', '')
    .not('login', 'is', null)
    .neq('login', '')
    .order('id');

  if (error) throw new Error(`Lecture public.user : ${error.message}`);
  return data ?? [];
}

async function findAuthUserByEmail(email) {
  // listUsers paginé — pour un volume terrain raisonnable
  let page = 1;
  const perPage = 200;
  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(`listUsers : ${error.message}`);
    const hit = data.users.find((u) => (u.email ?? '').toLowerCase() === email.toLowerCase());
    if (hit) return hit;
    if (data.users.length < perPage) return null;
    page += 1;
  }
}

async function upsertAuthUser(employee) {
  const email = employee.email.trim();
  const password = employee.login; // username métier

  const existing = await findAuthUserByEmail(email);
  if (existing) {
    const { error } = await admin.auth.admin.updateUserById(existing.id, {
      password,
      email_confirm: true,
    });
    if (error) throw new Error(`updateUser ${email} : ${error.message}`);
    return { action: 'updated', email, login: employee.login, id: existing.id };
  }

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      public_user_id: employee.id,
      login: employee.login,
      fullname: employee.fullname,
    },
  });
  if (error) throw new Error(`createUser ${email} : ${error.message}`);
  return { action: 'created', email, login: employee.login, id: data.user.id };
}

async function main() {
  if (dryRun && !admin) {
    console.log('Dry-run sans service key : liste non disponible. Fournis la clé pour un dry-run réel.');
    process.exit(0);
  }

  let employees = await listActiveEmployees();
  if (onlyEmail) {
    employees = employees.filter((e) => e.email.toLowerCase() === onlyEmail);
  }
  if (limit != null && Number.isFinite(limit)) {
    employees = employees.slice(0, limit);
  }

  console.log(`Employés à provisionner : ${employees.length}${dryRun ? ' (dry-run)' : ''}`);

  for (const emp of employees) {
    if (dryRun) {
      console.log(`  [dry-run] id=${emp.id} email=${emp.email} password=${emp.login}`);
      continue;
    }
    try {
      const result = await upsertAuthUser(emp);
      console.log(`  ✓ ${result.action} ${result.email} (login=${result.login})`);
    } catch (err) {
      console.error(`  ✗ ${emp.email} : ${err.message}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
