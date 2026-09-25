'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../../lib/supabase/client';
import {
  listAdminSwitchableUsers,
  requestAdminImpersonation,
  getAdminViewStatus,
} from '../../lib/auth/adminViewActions';
import type { AdminSwitchableUser } from '../../lib/auth/adminView';

/**
 * Panneau vue admin CRM (prod) : changer d'employé via Edge `admin-pwa-view`.
 * Visible uniquement si le cookie view_token est présent.
 */
export function AdminViewPanel({ colors }: { colors: Record<string, string> }) {
  const router = useRouter();
  const [active, setActive] = useState(false);
  const [adminEmail, setAdminEmail] = useState<string | null>(null);
  const [users, setUsers] = useState<AdminSwitchableUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    void (async () => {
      const status = await getAdminViewStatus();
      setActive(status.active);
      setAdminEmail(status.adminEmail);
      if (status.active) {
        const list = await listAdminSwitchableUsers();
        setUsers(list);
      }
    })();
  }, []);

  if (!active) return null;

  async function switchTo(userId: number) {
    setSwitching(true);
    setError(null);
    const result = await requestAdminImpersonation(userId);
    if (!result.ok) {
      setError(
        result.error === 'no_admin_view'
          ? 'Session admin expirée. Reconnecte-toi.'
          : 'Impossible de basculer sur cet employé.',
      );
      setSwitching(false);
      return;
    }

    const supabase = createClient();
    const { error: verifyError } = await supabase.auth.verifyOtp({
      token_hash: result.token_hash,
      type: 'email',
    });

    if (verifyError) {
      setError('Session employé impossible. Réessaie.');
      setSwitching(false);
      return;
    }

    router.replace('/');
    router.refresh();
  }

  return (
    <div
      className="mx-5 mt-8 overflow-hidden rounded-2xl border border-dashed p-4"
      style={{ borderColor: '#0d6e6e', backgroundColor: '#0d6e6e12' }}
    >
      <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#0d6e6e' }}>
        Vue admin (terrain)
      </p>
      {adminEmail ? (
        <p className="mt-1 text-[11px]" style={{ color: colors.TEXT_SECONDARY }}>
          Connecté en admin : {adminEmail}
        </p>
      ) : null}
      <div className="mt-3">
        <label className="text-xs font-medium" style={{ color: colors.TEXT_SECONDARY }}>
          Voir comme un employé
        </label>
        <select
          defaultValue=""
          disabled={switching || users.length === 0}
          onChange={(e) => {
            const id = Number(e.target.value);
            if (id) void switchTo(id);
          }}
          className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
          style={{
            borderColor: colors.BORDER,
            backgroundColor: colors.BG_SECONDARY,
            color: colors.TEXT_PRIMARY,
          }}
        >
          <option value="" disabled>
            {users.length === 0
              ? switching
                ? 'Chargement…'
                : 'Aucun employé'
              : switching
                ? 'Basculement…'
                : 'Choisir un employé'}
          </option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.fullname || u.login} ({u.login})
            </option>
          ))}
        </select>
        <p className="mt-1 text-[11px]" style={{ color: colors.TEXT_SECONDARY }}>
          Les actions terrain s&apos;enregistrent sous l&apos;identité choisie. Déconnexion pour
          quitter la vue admin.
        </p>
        {error ? (
          <p className="mt-2 text-xs" style={{ color: colors.DANGER_STRONG ?? '#EB5757' }}>
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
