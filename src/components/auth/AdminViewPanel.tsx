'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Search, UserRound, X } from 'lucide-react';
import { createClient } from '../../lib/supabase/client';
import { navigateFullPage } from '../../lib/auth/fullPageNav';
import {
  listAdminSwitchableUsers,
  requestAdminImpersonation,
  getAdminViewStatus,
  startAdminView,
} from '../../lib/auth/adminViewActions';
import type { AdminSwitchableUser } from '../../lib/auth/adminView';

type LoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; users: AdminSwitchableUser[] }
  | { status: 'error'; message: string };

/**
 * Panneau vue admin CRM (prod) : changer d'employé via Edge `admin-pwa-view`.
 * Visible uniquement si le cookie view_token est présent.
 */
export function AdminViewPanel({ colors }: { colors: Record<string, string> }) {
  const [active, setActive] = useState(false);
  const [adminEmail, setAdminEmail] = useState<string | null>(null);
  const [load, setLoad] = useState<LoadState>({ status: 'idle' });
  const [error, setError] = useState<string | null>(null);
  const [switching, setSwitching] = useState(false);
  const [query, setQuery] = useState('');

  const loadUsers = useCallback(async () => {
    setLoad({ status: 'loading' });
    setError(null);

    const listed = await listAdminSwitchableUsers();
    if (listed.ok) {
      setLoad({ status: 'ready', users: listed.employees });
      return;
    }

    // Token expiré / invalide : retenter un mint avec la session Auth courante.
    if (listed.error === 'invalid_view_token' || listed.error === 'missing_view_token') {
      const remint = await startAdminView();
      if (remint.ok) {
        setAdminEmail(remint.adminEmail);
        setLoad({ status: 'ready', users: remint.employees });
        return;
      }
      setLoad({
        status: 'error',
        message:
          remint.error === 'not_admin' || remint.error === 'not_authenticated'
            ? 'Session admin expirée. Déconnecte-toi puis reconnecte-toi avec ton compte CRM.'
            : 'Impossible de rafraîchir la vue admin. Réessaie ou reconnecte-toi.',
      });
      return;
    }

    setLoad({
      status: 'error',
      message:
        listed.error === 'network_error'
          ? 'Réseau indisponible. Vérifie ta connexion puis réessaie.'
          : 'Impossible de charger la liste des employés. Réessaie.',
    });
  }, []);

  useEffect(() => {
    void (async () => {
      const status = await getAdminViewStatus();
      setActive(status.active);
      setAdminEmail(status.adminEmail);
      if (status.active) {
        await loadUsers();
      }
    })();
  }, [loadUsers]);

  const users = load.status === 'ready' ? load.users : [];
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        (u.fullname || '').toLowerCase().includes(q) ||
        (u.login || '').toLowerCase().includes(q),
    );
  }, [users, query]);

  if (!active) return null;

  async function switchTo(userId: number) {
    setSwitching(true);
    setError(null);
    const result = await requestAdminImpersonation(userId);
    if (!result.ok) {
      setError(
        result.error === 'no_admin_view' || result.error === 'invalid_view_token'
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

    navigateFullPage('/');
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
        <p className="text-xs font-medium" style={{ color: colors.TEXT_SECONDARY }}>
          Voir comme un employé
        </p>

        {load.status === 'loading' || load.status === 'idle' ? (
          <p className="mt-2 text-sm" style={{ color: colors.TEXT_SECONDARY }}>
            Chargement des profils…
          </p>
        ) : null}

        {load.status === 'error' ? (
          <div className="mt-2 space-y-2">
            <p className="text-sm" style={{ color: colors.DANGER_STRONG ?? '#EB5757' }}>
              {load.message}
            </p>
            <button
              type="button"
              onClick={() => void loadUsers()}
              className="rounded-lg border px-3 py-2 text-sm font-semibold"
              style={{ borderColor: '#0d6e6e', color: '#0d6e6e' }}
            >
              Réessayer
            </button>
          </div>
        ) : null}

        {load.status === 'ready' && users.length === 0 ? (
          <p className="mt-2 text-sm" style={{ color: colors.TEXT_SECONDARY }}>
            Aucun employé actif à afficher.
          </p>
        ) : null}

        {load.status === 'ready' && users.length > 0 ? (
          <>
            <div
              className="mt-2 flex items-center rounded-xl border px-3 h-10"
              style={{
                backgroundColor: colors.BG_PRIMARY ?? '#fff',
                borderColor: colors.BORDER,
              }}
            >
              <Search size={16} color={colors.TEXT_SECONDARY} className="mr-2 shrink-0" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Rechercher un profil…"
                disabled={switching}
                className="flex-1 bg-transparent text-sm outline-none"
                style={{ color: colors.TEXT_PRIMARY }}
              />
              {query ? (
                <button type="button" onClick={() => setQuery('')} className="ml-1 p-1" aria-label="Effacer">
                  <X size={14} color={colors.TEXT_SECONDARY} />
                </button>
              ) : null}
            </div>

            <div
              className="mt-2 max-h-56 overflow-y-auto rounded-xl border"
              style={{
                borderColor: colors.BORDER,
                backgroundColor: colors.BG_PRIMARY ?? '#fff',
              }}
            >
              {filtered.length === 0 ? (
                <p className="px-3 py-4 text-sm" style={{ color: colors.TEXT_SECONDARY }}>
                  Aucun profil trouvé
                </p>
              ) : (
                filtered.map((u) => {
                  const label = u.fullname || u.login;
                  const initials = initialsFrom(label);
                  return (
                    <button
                      key={u.id}
                      type="button"
                      disabled={switching}
                      onClick={() => void switchTo(u.id)}
                      className="flex w-full items-center gap-3 border-b px-3 py-2.5 text-left transition-opacity last:border-b-0 active:opacity-70 disabled:opacity-50"
                      style={{ borderColor: colors.BORDER }}
                    >
                      <span
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold"
                        style={{
                          backgroundColor: '#0d6e6e18',
                          color: '#0d6e6e',
                        }}
                        aria-hidden
                      >
                        {initials || <UserRound size={16} />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span
                          className="block truncate text-sm font-medium"
                          style={{ color: colors.TEXT_PRIMARY }}
                        >
                          {label}
                        </span>
                        {u.login && u.login !== label ? (
                          <span
                            className="block truncate text-[11px]"
                            style={{ color: colors.TEXT_SECONDARY }}
                          >
                            {u.login}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  );
                })
              )}
            </div>

            {switching ? (
              <p className="mt-2 text-sm" style={{ color: colors.TEXT_SECONDARY }}>
                Basculement…
              </p>
            ) : null}
          </>
        ) : null}

        <p className="mt-2 text-[11px]" style={{ color: colors.TEXT_SECONDARY }}>
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

function initialsFrom(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
}
