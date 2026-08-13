'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useThemeColors } from '../../hooks/useThemeColors';
import { useTranslation } from '../../hooks/useTranslation';
import { isBrowserOffline } from '../../lib/offline';
import { submitSuggestionAnonyme } from './actions';
import { PageHeader } from '../../components/layout/PageHeader';
import { FormScrollLayout } from '../../components/layout/FormScrollLayout';
import { FormPinnedPageHeader } from '../../components/layout/FormPinnedPageHeader';
import { PrimaryButton } from '../../components/common/PrimaryButton';
import { RADIUS } from '../../constants/design';

const CATEGORIES = ['materiel', 'organisation', 'ambiance', 'autre'] as const;
type Category = (typeof CATEGORIES)[number];

export default function SuggestionsPage() {
  const router = useRouter();
  const { colors } = useThemeColors();
  const { t } = useTranslation();

  const [corps, setCorps] = useState('');
  const [categorie, setCategorie] = useState<Category | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const handleSubmit = () => {
    setError(null);
    if (corps.trim().length === 0) {
      setError(t('screens.suggestions.errorEmpty'));
      return;
    }
    if (isBrowserOffline()) {
      setError(t('forms.common.errorOffline'));
      return;
    }
    startTransition(async () => {
      const result = await submitSuggestionAnonyme(corps, categorie);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSubmitted(true);
    });
  };

  if (submitted) {
    return (
      <FormScrollLayout>
        <div
          className="flex min-h-[50vh] flex-col items-center justify-center gap-3 p-6"
          style={{ backgroundColor: colors.BG_SECONDARY }}
        >
          <span className="text-6xl mb-2">&#x2705;</span>
          <h2 className="text-xl font-bold text-center" style={{ color: colors.TEXT_PRIMARY }}>
            {t('screens.suggestions.successTitle')}
          </h2>
          <p className="text-base text-center" style={{ color: colors.TEXT_SECONDARY }}>
            {t('screens.suggestions.successDescription')}
          </p>
          <PrimaryButton
            onClick={() => {
              setCorps('');
              setCategorie(null);
              setSubmitted(false);
            }}
            className="mt-4 px-6 py-3 text-base"
          >
            {t('screens.suggestions.sendAnother')}
          </PrimaryButton>
          <button
            type="button"
            onClick={() => router.push('/')}
            className="text-sm font-semibold"
            style={{ color: colors.TEXT_SECONDARY }}
          >
            {'←'} Accueil
          </button>
        </div>
      </FormScrollLayout>
    );
  }

  return (
    <FormScrollLayout
      footer={
        <div className="px-4 py-3" style={{ backgroundColor: colors.BG_SECONDARY }}>
          <PrimaryButton onClick={handleSubmit} disabled={pending} className="w-full py-4 text-base">
            {pending ? '…' : t('screens.suggestions.submit')}
          </PrimaryButton>
        </div>
      }
    >
      <div style={{ backgroundColor: colors.BG_SECONDARY }}>
        <FormPinnedPageHeader>
          <PageHeader pin="static" accent="yellow" title={t('screens.suggestions.title')} showBack />
        </FormPinnedPageHeader>

        <div className="space-y-3 px-4 py-4">
          <p className="text-sm leading-relaxed" style={{ color: colors.TEXT_SECONDARY }}>
            {t('screens.suggestions.intro')}
          </p>
          <div
            className="rounded-xl border px-3 py-2.5 text-xs leading-relaxed"
            style={{
              borderColor: colors.BORDER,
              backgroundColor: colors.BG_TERTIARY,
              color: colors.TEXT_SECONDARY,
            }}
          >
            {t('screens.suggestions.anonymityNotice')}
          </div>

          <div className="card-surface space-y-4 px-4 py-4">
            <textarea
              placeholder={t('screens.suggestions.bodyPlaceholder')}
              value={corps}
              onChange={(e) => setCorps(e.target.value)}
              rows={5}
              className="min-h-[120px] w-full resize-none rounded-xl border px-3 py-3 text-base"
              style={{
                color: colors.TEXT_PRIMARY,
                borderColor: colors.BORDER,
                backgroundColor: colors.BG_SECONDARY,
                borderRadius: RADIUS.sm,
              }}
            />

            <div className="space-y-1.5">
              <label className="text-sm font-semibold" style={{ color: colors.TEXT_PRIMARY }}>
                {t('screens.suggestions.categoryLabel')}
              </label>
              <div className="flex flex-wrap gap-2">
                {CATEGORIES.map((cat) => {
                  const selected = categorie === cat;
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setCategorie(selected ? null : cat)}
                      className="min-h-[40px] px-3.5 py-1.5 text-sm font-semibold"
                      style={{
                        borderRadius: RADIUS.full,
                        backgroundColor: selected ? colors.PRIMARY_MUTED : colors.BG_SECONDARY,
                        color: selected ? colors.PRIMARY : colors.TEXT_SECONDARY,
                        boxShadow: `inset 0 0 0 1px ${selected ? colors.PRIMARY : colors.BORDER}`,
                      }}
                    >
                      {t(`screens.suggestions.category${cat.charAt(0).toUpperCase()}${cat.slice(1)}`)}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {error && (
            <div
              className="rounded-xl border px-3 py-2.5 text-sm"
              style={{ borderColor: colors.DANGER, color: colors.DANGER, backgroundColor: colors.ACCENT_RED_MUTED }}
            >
              {error}
            </div>
          )}
        </div>
      </div>
    </FormScrollLayout>
  );
}
