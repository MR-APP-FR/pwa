#!/usr/bin/env node
/**
 * Supprime les comptes auth.users des employés (emails présents dans public.user).
 * Conserve les emails de admin_emails (CRM).
 *
 * Usage :
 *   SUPABASE_SERVICE_ROLE_KEY=... node scripts/delete-staff-auth-users.mjs --dry-run
 *   SUPABASE_SERVICE_ROLE_KEY=... node scripts/delete-staff-auth-users.mjs
 */

import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://ooirydwzxltdtvlyhqar.supabase.co';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const dryRun = process.argv.includes('--dry-run');

if (!serviceKey) {
  console.error('SUPABASE_SERVICE_ROLE_KEY manquant.');
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function listAuthUsers() {
  const users = [];
  let page = 1;
  const perPage = 200;
  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(`listUsers: ${error.message}`);
    users.push(...data.users);
    if (data.users.length < perPage) return users;
    page += 1;
  }
}

async function main() {
  const { data: employees, error: empError } = await admin
    .from('user')
    .select('id, login, email, actif');
  if (empError) throw new Error(`public.user: ${empError.message}`);

  const { data: admins, error: adminError } = await admin.from('admin_emails').select('email');
  if (adminError) throw new Error(`admin_emails: ${adminError.message}`);

  const adminEmails = new Set((admins ?? []).map((a) => a.email.toLowerCase()));
  const staffEmails = new Set(
    (employees ?? [])
      .map((e) => e.email?.trim().toLowerCase())
      .filter(Boolean),
  );

  const authUsers = await listAuthUsers();
  const toDelete = authUsers.filter((u) => {
    const email = u.email?.toLowerCase();
    if (!email) return false;
    if (adminEmails.has(email)) return false;
    return staffEmails.has(email);
  });
  const kept = authUsers.filter((u) => !toDelete.includes(u));

  console.log(
    JSON.stringify(
      {
        mode: dryRun ? 'dry-run' : 'delete',
        auth_total: authUsers.length,
        to_delete: toDelete.length,
        kept: kept.length,
        kept_emails: kept.map((u) => u.email).sort(),
      },
      null,
      2,
    ),
  );

  if (dryRun) {
    console.log('Dry-run : aucune suppression.');
    return;
  }

  let ok = 0;
  let fail = 0;
  for (const user of toDelete) {
    const { error } = await admin.auth.admin.deleteUser(user.id);
    if (error) {
      fail += 1;
      console.error(`FAIL ${user.email}: ${error.message}`);
    } else {
      ok += 1;
      console.log(`deleted ${user.email}`);
    }
  }

  console.log(JSON.stringify({ deleted: ok, failed: fail }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
