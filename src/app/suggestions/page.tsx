'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useThemeColors } from '../../hooks/useThemeColors';
import { useTranslation } from '../../hooks/useTranslation';
import { isBrowserOffline } from '../../lib/offline';
import { submitSuggestion } from './actions';
import { PageHeader } from '../../components/layout/PageHeader';
import { FormScrollLayout } from '../../components/layout/FormScrollLayout';
import { FormPinnedPageHeader } from '../../components/layout/FormPinnedPageHeader';
import { PrimaryButton } from '../../components/common/PrimaryButton';
import { YesNoToggle } from '../../components/common/YesNoToggle';
import { RADIUS } from '../../constants/design';

const CATEGORIES = ['materiel', 'organisation', 'ambiance', 'autres'] as const;
type Category = (typeof CATEGORIES)[number];

function categoryLabelKey(cat: Category): string {
  return `screens.suggestions.category${cat.charAt(0).toUpperCase()}${cat.slice(1)}`;
}

export default function SuggestionsPage() {
  const router = useRouter();
  const { colors } = useThemeColors();
  const { t } = useTranslation();

  const [corps, setCorps] = useState('');
  const [categorie, setCategorie] = useState<Category | null>(null);
  const [isAnonymous, setIsAnonymous] = useState(false);
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
      const result = await submitSuggestion(corps, categorie, isAnonymous);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSubmitted(true);
    });
  };

  const resetForm = () => {
    setCorps('');
    setCategorie(null);
    setIsAnonymous(false);
    setSubmitted(false);
    setError(null);
  };

  if (submitted) {
    return (
      <FormScrollLayout>
        <div
          className="flex min-h-[50vh] flex-col items-center justify-center gap-3 p-6"
          style={{ backgroundColor: colors.BG_SECONDARY }}
        >
          <h2 className="text-xl font-bold text-center" style={{ color: colors.TEXT_PRIMARY }}>
            {t('screens.suggestions.successTitle')}
          </h2>
          <p className="text-base text-center" style={{ color: colors.TEXT_SECONDARY }}>
            {t('screens.suggestions.successDescription')}
          </p>
          <PrimaryButton onClick={resetForm} className="mt-4 px-6 py-3 text-base">
            {t('screens.suggestions.sendAnother')}
          </PrimaryButton>
          <button
            type="button"
            onClick={() => router.push('/')}
            className="text-sm font-semibold"
            style={{ color: colors.TEXT_SECONDARY }}
          >
            {t('screens.suggestions.backHome')}
          </button>
        </div>
      </FormScrollLayout>
    );
  }

  return (
    <FormScrollLayout
      footer={
        <div className="px-5 py-4" style={{ backgroundColor: colors.BG_SECONDARY }}>
          <PrimaryButton onClick={handleSubmit} disabled={pending} className="w-full py-4 text-base">
            {pending ? '…' : t('screens.suggestions.submit')}
          </PrimaryButton>
        </div>
      }
    >
      <div style={{ backgroundColor: colors.BG_SECONDARY }}>
        <FormPinnedPageHeader>
          <PageHeader pin="static" accent="orange" title={t('screens.suggestions.title')} showBack />
        </FormPinnedPageHeader>

        <div className="space-y-4 px-5 py-5">
          <div className="card-surface space-y-5 px-5 py-5">
            <p className="text-sm leading-relaxed" style={{ color: colors.TEXT_SECONDARY }}>
              {t('screens.suggestions.intro')}
            </p>
            <textarea
              placeholder={t('screens.suggestions.bodyPlaceholder')}
              value={corps}
              onChange={(e) => setCorps(e.target.value)}
              rows={6}
              className="min-h-[140px] w-full resize-none rounded-xl border px-3 py-3 text-base"
              style={{
                color: colors.TEXT_PRIMARY,
                borderColor: colors.BORDER,
                backgroundColor: colors.BG_SECONDARY,
                borderRadius: RADIUS.sm,
              }}
            />

            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <h3
                  className="text-xs font-bold uppercase tracking-wide"
                  style={{ color: colors.PRIMARY, fontFamily: 'var(--font-display)' }}
                >
                  {t('screens.suggestions.categoryLabel')}
                </h3>
                <div className="h-px flex-1" style={{ backgroundColor: colors.BORDER }} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                {CATEGORIES.map((cat) => {
                  const selected = categorie === cat;
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setCategorie(selected ? null : cat)}
                      className="min-h-[44px] w-full px-3 py-2 text-sm font-bold"
                      style={{
                        borderRadius: RADIUS.sm,
                        fontFamily: 'var(--font-display)',
                        backgroundColor: selected ? colors.ACCENT_ORANGE_MUTED : colors.BG_SECONDARY,
                        color: selected ? colors.ACCENT_ORANGE : colors.TEXT_PRIMARY,
                        boxShadow: `inset 0 0 0 ${selected ? 2 : 1}px ${selected ? colors.ACCENT_ORANGE : colors.BORDER}`,
                      }}
                    >
                      {t(categoryLabelKey(cat))}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="card-surface space-y-5 px-5 py-5">
            <p className="text-sm leading-relaxed" style={{ color: colors.TEXT_SECONDARY }}>
              {t('screens.suggestions.anonymityNotice')}
            </p>
            <div className="flex items-center justify-between gap-3">
              <span
                className="text-sm font-bold"
                style={{ color: colors.TEXT_PRIMARY, fontFamily: 'var(--font-display)' }}
              >
                {t('screens.suggestions.anonymousLabel')}
              </span>
              <YesNoToggle
                compact
                value={isAnonymous}
                onChange={setIsAnonymous}
                yesLabel={t('forms.opening.fondDeCaisseYes')}
                noLabel={t('forms.opening.fondDeCaisseNo')}
                invertSelectedColors
              />
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
