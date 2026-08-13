'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { listDevSwitchableUsers, setDevDateOverride, type DevSwitchableUser } from '../../app/dev/actions';
import { getDevDateOverride } from '../../lib/dev/dateOverrideClient';

/**
 * Panneau dev local uniquement : changer d'employé sans repasser par le login,
 * et simuler la date du jour (planning, dispo, blocage 20h05 de fermeture).
 * Ne rend rien en dehors de NODE_ENV=development (inline au build par Next).
 */
export function DevToolsPanel({ colors }: { colors: Record<string, string> }) {
  const router = useRouter();
  const [users, setUsers] = useState<DevSwitchableUser[]>([]);
  const [dateInput, setDateInput] = useState('');

  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;
    listDevSwitchableUsers().then(setUsers).catch(() => setUsers([]));
    const current = getDevDateOverride();
    setDateInput(current ? current.toISOString().slice(0, 10) : '');
  }, []);

  if (process.env.NODE_ENV !== 'development') return null;

  async function applyDate(value: string) {
    setDateInput(value);
    await setDevDateOverride(value || null);
    router.refresh();
  }

  return (
    <div
      className="mx-5 mt-8 overflow-hidden rounded-2xl border border-dashed p-4"
      style={{ borderColor: '#c99a00', backgroundColor: '#fff3cd15' }}
    >
      <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#8a6d00' }}>
        🔧 Dev tools (local uniquement)
      </p>

      <div className="mt-3">
        <label className="text-xs font-medium" style={{ color: colors.TEXT_SECONDARY }}>
          Changer d&apos;employé
        </label>
        <select
          defaultValue=""
          onChange={(e) => {
            if (e.target.value) window.location.href = `/dev/switch-user?userId=${e.target.value}`;
          }}
          className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
          style={{ borderColor: colors.BORDER, backgroundColor: colors.BG_SECONDARY, color: colors.TEXT_PRIMARY }}
        >
          <option value="" disabled>
            {users.length === 0 ? 'Chargement…' : 'Choisir un employé'}
          </option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.fullname} ({u.login})
            </option>
          ))}
        </select>
        <p className="mt-1 text-[11px]" style={{ color: colors.TEXT_SECONDARY }}>
          Ne fonctionne que pour les employés provisionnés côté Auth (
          <code>npm run provision:auth-users</code>).
        </p>
      </div>

      <div className="mt-4">
        <label className="text-xs font-medium" style={{ color: colors.TEXT_SECONDARY }}>
          Simuler la date du jour
        </label>
        <div className="mt-1 flex gap-2">
          <input
            type="date"
            value={dateInput}
            onChange={(e) => void applyDate(e.target.value)}
            className="flex-1 rounded-lg border px-3 py-2 text-sm"
            style={{ borderColor: colors.BORDER, backgroundColor: colors.BG_SECONDARY, color: colors.TEXT_PRIMARY }}
          />
          {dateInput && (
            <button
              type="button"
              onClick={() => void applyDate('')}
              className="rounded-lg border px-3 py-2 text-sm font-medium"
              style={{ borderColor: colors.BORDER, color: colors.TEXT_SECONDARY }}
            >
              Réinitialiser
            </button>
          )}
        </div>
        <p className="mt-1 text-[11px]" style={{ color: colors.TEXT_SECONDARY }}>
          Affecte l&apos;accueil, planning, dispo et le blocage 20h05 de fermeture (garde serveur
          inclus). N&apos;affecte pas les horodatages déjà écrits en base.
        </p>
      </div>
    </div>
  );
}
