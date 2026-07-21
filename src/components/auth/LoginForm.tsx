'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../../lib/supabase/client';
import { useThemeColors } from '../../hooks/useThemeColors';
import { useTranslation } from '../../hooks/useTranslation';
import { PrimaryButton } from '../common/PrimaryButton';
import { RADIUS } from '../../constants/design';

export function LoginForm() {
  const { colors } = useThemeColors();
  const { t } = useTranslation();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (signInError) {
      setError(t('auth.loginError'));
      setLoading(false);
      return;
    }

    router.replace('/');
    router.refresh();
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
        <label htmlFor="email" className="text-sm font-medium" style={{ color: colors.TEXT_PRIMARY }}>
          {t('auth.email')}
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          placeholder="name@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
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
    </form>
  );
}
