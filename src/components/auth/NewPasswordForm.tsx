'use client';

import { useState } from 'react';
import { useThemeColors } from '../../hooks/useThemeColors';
import { useTranslation } from '../../hooks/useTranslation';
import { PrimaryButton } from '../common/PrimaryButton';
import { RADIUS } from '../../constants/design';
import { createClient } from '../../lib/supabase/client';
import { navigateFullPage } from '../../lib/auth/fullPageNav';

/**
 * Première connexion (MDP temporaire CRM).
 * Pas de Server Action / type=submit : même piège iOS que LoginForm
 * (GET natif + disabled qui vide les champs + refresh RSC).
 */
export function NewPasswordForm() {
  const { colors } = useThemeColors();
  const { t } = useTranslation();
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function doChangePassword() {
    if (loading) return;

    setLoading(true);
    setError(null);

    try {
      if (password.length < 8) {
        setError('Le mot de passe doit contenir au moins 8 caractères.');
        return;
      }
      if (password !== passwordConfirmation) {
        setError('Les mots de passe ne correspondent pas.');
        return;
      }

      const supabase = createClient();
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError(`Impossible de changer le mot de passe : ${updateError.message}`);
        return;
      }

      const { error: flagError } = await supabase.rpc('mark_password_changed');
      if (flagError) {
        setError(
          `Mot de passe changé mais mise à jour du statut échouée : ${flagError.message}`,
        );
        return;
      }

      navigateFullPage('/');
    } catch (err) {
      console.error('change password', err);
      setError('Impossible de changer le mot de passe pour le moment.');
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    e.stopPropagation();
    void doChangePassword();
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
      <form
        method="post"
        action="/premiere-connexion"
        onSubmit={handleSubmit}
        className="space-y-4"
        noValidate
      >
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
            name="password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
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
            name="passwordConfirmation"
            type="password"
            autoComplete="new-password"
            value={passwordConfirmation}
            onChange={(e) => setPasswordConfirmation(e.target.value)}
            required
            minLength={8}
            className="w-full border px-3 py-3 text-base outline-none"
            style={inputStyle}
          />
        </div>
        <PrimaryButton
          type="button"
          disabled={loading}
          className="w-full py-3 text-sm"
          onClick={() => void doChangePassword()}
        >
          {loading ? t('firstLogin.submitting') : t('firstLogin.submit')}
        </PrimaryButton>
        {error && (
          <p className="text-sm" style={{ color: colors.DANGER_STRONG ?? '#EB5757' }} role="alert">
            {error}
          </p>
        )}
      </form>
    </div>
  );
}
