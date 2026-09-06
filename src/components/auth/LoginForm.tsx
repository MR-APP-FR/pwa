'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../../lib/supabase/client';
import { useThemeColors } from '../../hooks/useThemeColors';
import { useTranslation } from '../../hooks/useTranslation';
import { PrimaryButton } from '../common/PrimaryButton';
import { RADIUS } from '../../constants/design';
import { claimLogin } from '../../app/login/actions';

export function LoginForm({ devBypassEmail }: { devBypassEmail?: string }) {
  const { colors } = useThemeColors();
  const { t } = useTranslation();
  const router = useRouter();
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function doSignIn(loginValue: string, passwordValue: string) {
    setLoading(true);
    setError(null);

    const result = await claimLogin(loginValue, passwordValue);

    if (!result.ok) {
      if (result.code === 'unknown_login') {
        setError(t('auth.contactValeria'));
      } else if (result.code === 'invalid_input') {
        setError(t('auth.invalidInput'));
      } else if (result.code === 'server_error') {
        setError(t('auth.serverError'));
      } else {
        setError(t('auth.loginError'));
      }
      setLoading(false);
      return;
    }

    const supabase = createClient();
    const { error: sessionError } = await supabase.auth.setSession({
      access_token: result.access_token,
      refresh_token: result.refresh_token,
    });

    if (sessionError) {
      setError(t('auth.serverError'));
      setLoading(false);
      return;
    }

    router.replace('/');
    router.refresh();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await doSignIn(login, password);
  }

  const inputStyle = {
    borderColor: colors.BORDER,
    backgroundColor: colors.BG_SECONDARY,
    color: colors.TEXT_PRIMARY,
    borderRadius: RADIUS.md,
  } as const;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <label htmlFor="login" className="text-sm font-medium" style={{ color: colors.TEXT_PRIMARY }}>
          {t('auth.login')}
        </label>
        <input
          id="login"
          type="text"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          placeholder={t('auth.loginPlaceholder')}
          value={login}
          onChange={(e) => setLogin(e.target.value)}
          required
          disabled={loading}
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
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={6}
          disabled={loading}
          className="w-full border px-3 py-3 text-base outline-none"
          style={inputStyle}
        />
        <p className="text-xs" style={{ color: colors.TEXT_SECONDARY }}>
          {t('auth.passwordHint')}
        </p>
      </div>
      <PrimaryButton type="submit" disabled={loading} className="w-full py-3 text-sm">
        {loading ? t('auth.signingIn') : t('auth.signIn')}
      </PrimaryButton>
      {error && (
        <p className="text-sm" style={{ color: colors.DANGER_STRONG ?? '#EB5757' }}>
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
