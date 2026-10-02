'use client';

import { useEffect, useState } from 'react';
import { createClient } from '../../lib/supabase/client';
import { useThemeColors } from '../../hooks/useThemeColors';
import { useTranslation } from '../../hooks/useTranslation';
import { PrimaryButton } from '../common/PrimaryButton';
import { RADIUS } from '../../constants/design';
import { claimLogin } from '../../lib/auth/claimLogin';
import { navigateFullPage } from '../../lib/auth/fullPageNav';
import { startAdminView } from '../../lib/auth/adminViewActions';

/** Survit à un reload iOS Safari (submit GET natif / remount PWA). */
const LOGIN_DRAFT_KEY = 'pwa-login-draft';

type LoginDraft = {
  login?: string;
  password?: string;
  error?: string | null;
};

function readDraft(): LoginDraft | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(LOGIN_DRAFT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as LoginDraft;
  } catch {
    return null;
  }
}

function writeDraft(draft: LoginDraft) {
  try {
    sessionStorage.setItem(LOGIN_DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // private mode / quota
  }
}

function clearDraft() {
  try {
    sessionStorage.removeItem(LOGIN_DRAFT_KEY);
  } catch {
    // ignore
  }
}

export function LoginForm({ devBypassEmail }: { devBypassEmail?: string }) {
  const { colors } = useThemeColors();
  const { t } = useTranslation();
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Restaure login/MDP/erreur après un reload Safari. Ne jamais masquer le
  // formulaire en attendant (sur iOS le useEffect peut ne pas tourner → page blanche).
  useEffect(() => {
    const draft = readDraft();
    if (!draft) return;
    if (typeof draft.login === 'string') setLogin(draft.login);
    if (typeof draft.password === 'string') setPassword(draft.password);
    if (typeof draft.error === 'string' && draft.error) setError(draft.error);
  }, []);

  async function finishWithSession(goProfilForAdminPick: boolean) {
    clearDraft();
    const path = goProfilForAdminPick ? '/profil' : '/';
    navigateFullPage(path);
  }

  /** Login admin CRM (mêmes id que le portail) + mint vue terrain. */
  async function tryAdminSignIn(email: string, passwordValue: string): Promise<boolean> {
    const supabase = createClient();
    const normalized = email.trim().toLowerCase();

    const { data: isAdmin, error: adminCheckError } = await supabase.rpc('is_email_admin', {
      check_email: normalized,
    });
    if (adminCheckError || isAdmin !== true) {
      return false;
    }

    const { data: signData, error: signError } = await supabase.auth.signInWithPassword({
      email: normalized,
      password: passwordValue,
    });
    if (signError || !signData.session?.access_token) {
      setError(t('auth.loginError'));
      return true; // c'était un admin, ne pas retomber sur claim-login
    }

    const { error: roleError } = await supabase.rpc('ensure_portal_admin_role');
    if (roleError) {
      console.error('ensure_portal_admin_role', roleError);
    }

    const view = await startAdminView(signData.session.access_token);
    if (!view.ok) {
      setError(t('auth.serverError'));
      return true;
    }

    // Admin sans ligne public.user → obligé de choisir un employé sur /profil.
    const { data: employeeId } = await supabase.rpc('current_employee_id');
    const hasEmployee =
      typeof employeeId === 'number' ? employeeId > 0 : Number(employeeId) > 0;

    await finishWithSession(!hasEmployee);
    return true;
  }

  async function doSignIn(loginValue: string, passwordValue: string) {
    if (loading) return;

    const trimmed = loginValue.trim();
    writeDraft({ login: trimmed, password: passwordValue, error: null });

    setLoading(true);
    setError(null);

    try {
      // Email admin CRM → chemin dédié (bypass local équivalent, prod-safe).
      if (trimmed.includes('@')) {
        const handled = await tryAdminSignIn(trimmed, passwordValue);
        if (handled) return;
      }

      const result = await claimLogin(trimmed, passwordValue);

      if (!result.ok) {
        let message = t('auth.loginError');
        if (result.code === 'unknown_login') {
          message = t('auth.contactValeria');
        } else if (result.code === 'invalid_input') {
          message = t('auth.invalidInput');
        } else if (result.code === 'weak_password') {
          message = t('auth.weakPassword');
        } else if (result.code === 'server_error') {
          message = t('auth.serverError');
        }
        setError(message);
        writeDraft({ login: trimmed, password: passwordValue, error: message });
        return;
      }

      const supabase = createClient();
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: result.access_token,
        refresh_token: result.refresh_token,
      });

      if (sessionError) {
        const message = t('auth.serverError');
        setError(message);
        writeDraft({ login: trimmed, password: passwordValue, error: message });
        return;
      }

      // Employé qui est aussi dans admin_emails → active aussi le switcher.
      const {
        data: { session: empSession },
      } = await supabase.auth.getSession();
      const authEmail = empSession?.user?.email;
      if (authEmail && empSession?.access_token) {
        const { data: isAdmin } = await supabase.rpc('is_email_admin', {
          check_email: authEmail,
        });
        if (isAdmin === true) {
          await supabase.rpc('ensure_portal_admin_role');
          await startAdminView(empSession.access_token);
        }
      }

      await finishWithSession(false);
    } catch (err) {
      console.error('login error', err);
      const message = t('auth.serverError');
      setError(message);
      writeDraft({ login: trimmed, password: passwordValue, error: message });
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    // Empêche le submit HTML natif (GET /login?… sur iOS signet = page vide).
    e.preventDefault();
    e.stopPropagation();
    void doSignIn(login, password);
  }

  const inputStyle = {
    borderColor: colors.BORDER,
    backgroundColor: colors.BG_SECONDARY,
    color: colors.TEXT_PRIMARY,
    borderRadius: RADIUS.md,
  } as const;

  return (
    <form
      method="post"
      action="/login"
      onSubmit={handleSubmit}
      className="space-y-4"
      noValidate
    >
      <div className="space-y-2">
        <label htmlFor="login" className="text-sm font-medium" style={{ color: colors.TEXT_PRIMARY }}>
          {t('auth.login')}
        </label>
        <input
          id="login"
          name="login"
          type="text"
          inputMode="email"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          placeholder={t('auth.loginPlaceholder')}
          value={login}
          onChange={(e) => setLogin(e.target.value)}
          required
          className="w-full border px-3 py-3 text-base outline-none"
          style={inputStyle}
        />
      </div>
      <div className="space-y-2">
        <label
          htmlFor="password"
          className="text-sm font-medium"
          style={{ color: colors.TEXT_PRIMARY }}
        >
          {t('auth.password')}
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="w-full border px-3 py-3 text-base outline-none"
          style={inputStyle}
        />
        <p className="text-xs" style={{ color: colors.TEXT_SECONDARY }}>
          {t('auth.passwordHint')}
        </p>
      </div>
      {/* type=button : ne jamais laisser iOS faire un submit GET natif. */}
      <PrimaryButton
        type="button"
        disabled={loading}
        className="w-full py-3 text-sm"
        onClick={() => void doSignIn(login, password)}
      >
        {loading ? t('auth.signingIn') : t('auth.signIn')}
      </PrimaryButton>
      {error && (
        <p className="text-sm" style={{ color: colors.DANGER_STRONG ?? '#EB5757' }} role="alert">
          {error}
        </p>
      )}
      {devBypassEmail && (
        <a
          href="/dev/bypass-login"
          className="block w-full border py-3 text-center text-sm font-medium"
          style={{ ...inputStyle, borderStyle: 'dashed' }}
        >
          Dev bypass ({devBypassEmail})
        </a>
      )}
    </form>
  );
}
