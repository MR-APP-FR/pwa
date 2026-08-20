#!/usr/bin/env node
/**
 * Provisionne des comptes Auth pour les employés actifs (phase test).
 *
 * Règles :
 * - email Auth = public.user.email (pré-requis current_employee_id())
 * - password initial = public.user.email (temporaire, must_change_password)
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
    .order('id');

  if (error) throw new Error(`Lecture public.user : ${error.message}`);
  return data ?? [];
}

async function loadAuthUsersByEmail() {
  const byEmail = new Map();
  let page = 1;
  const perPage = 200;
  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(`listUsers : ${error.message}`);
    for (const user of data.users) {
      if (user.email) byEmail.set(user.email.toLowerCase(), user);
    }
    if (data.users.length < perPage) return byEmail;
    page += 1;
  }
}

async function markMustChangePassword(userId, email) {
  const { error } = await admin.from('user').update({ must_change_password: true }).eq('id', userId);
  if (error) {
    throw new Error(`must_change_password ${email} : ${error.message}`);
  }
}

async function upsertAuthUser(employee, authByEmail) {
  const email = employee.email.trim();
  const password = email;

  const existing = authByEmail.get(email.toLowerCase());
  if (existing) {
    const { error } = await admin.auth.admin.updateUserById(existing.id, {
      password,
      email_confirm: true,
    });
    if (error) throw new Error(`updateUser ${email} : ${error.message}`);
    await markMustChangePassword(employee.id, email);
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
  authByEmail.set(email.toLowerCase(), data.user);
  await markMustChangePassword(employee.id, email);
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

  const authByEmail = dryRun ? new Map() : await loadAuthUsersByEmail();

  for (const emp of employees) {
    if (dryRun) {
      console.log(`  [dry-run] id=${emp.id} email=${emp.email} password=<email>`);
      continue;
    }
    try {
      const result = await upsertAuthUser(emp, authByEmail);
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
