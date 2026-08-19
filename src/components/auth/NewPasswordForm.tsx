'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useThemeColors } from '../../hooks/useThemeColors';
import { useTranslation } from '../../hooks/useTranslation';
import { PrimaryButton } from '../common/PrimaryButton';
import { RADIUS } from '../../constants/design';
import { changeTemporaryPassword } from '../../app/premiere-connexion/actions';

export function NewPasswordForm() {
  const { colors } = useThemeColors();
  const { t } = useTranslation();
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData();
    formData.set('password', password);
    formData.set('passwordConfirmation', passwordConfirmation);

    const result = await changeTemporaryPassword(formData);

    if (!result.ok) {
      setError(result.error);
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
    <div className="mx-auto w-full max-w-sm">
      <div className="mb-8 text-center">
        <h1
          className="text-2xl font-bold tracking-tight"
          style={{ fontFamily: 'var(--font-display)', color: colors.TEXT_PRIMARY }}
        >
          {t('firstLogin.title')}
        </h1>
        <p className="mt-2 text-sm" style={{ color: colors.TEXT_SECONDARY }}>
          {t('firstLogin.subtitle')}
        </p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <label
            htmlFor="password"
            className="text-sm font-medium"
            style={{ color: colors.TEXT_PRIMARY }}
          >
            {t('firstLogin.newPassword')}
          </label>
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            disabled={loading}
            className="w-full border px-3 py-3 text-base outline-none"
            style={inputStyle}
          />
        </div>
        <div className="space-y-2">
          <label
            htmlFor="passwordConfirmation"
            className="text-sm font-medium"
            style={{ color: colors.TEXT_PRIMARY }}
          >
            {t('firstLogin.confirmPassword')}
          </label>
          <input
            id="passwordConfirmation"
            type="password"
            autoComplete="new-password"
            value={passwordConfirmation}
            onChange={(e) => setPasswordConfirmation(e.target.value)}
            required
            minLength={8}
            disabled={loading}
            className="w-full border px-3 py-3 text-base outline-none"
            style={inputStyle}
          />
        </div>
        <PrimaryButton type="submit" disabled={loading} className="w-full py-3 text-sm">
          {loading ? t('firstLogin.submitting') : t('firstLogin.submit')}
        </PrimaryButton>
        {error && (
          <p className="text-sm" style={{ color: colors.DANGER_STRONG ?? '#EB5757' }}>
            {error}
          </p>
        )}
      </form>
    </div>
  );
}
