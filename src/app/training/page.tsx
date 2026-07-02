'use client';

import { useRouter } from 'next/navigation';
import { PageHeader } from '../../components/layout/PageHeader';
import { TrainingThemeCard } from '../../components/training/TrainingThemeCard';
import { TRAINING_THEMES } from '../../constants/trainingThemes';
import { useThemeColors } from '../../hooks/useThemeColors';
import { useTranslation } from '../../hooks/useTranslation';

export default function TrainingPage() {
  const router = useRouter();
  const { colors } = useThemeColors();
  const { t } = useTranslation();

  return (
    <div className="flex flex-1 flex-col" style={{ backgroundColor: colors.BG_SECONDARY }}>
      <PageHeader
        title={t('screens.training.title')}
        showBack
        onBack={() => router.push('/')}
      />

      <div className="flex-1 overflow-y-auto px-4 pb-8 pt-4">
        <p
          className="mb-4 text-sm leading-relaxed"
          style={{ color: colors.TEXT_SECONDARY }}
        >
          {t('screens.training.subtitle')}
        </p>

        <div className="grid grid-cols-2 gap-3">
          {TRAINING_THEMES.map((theme) => (
            <TrainingThemeCard
              key={theme.id}
              emoji={theme.emoji}
              labelKey={theme.labelKey}
              colSpan={theme.colSpan}
              disabled
            />
          ))}
        </div>
      </div>
    </div>
  );
}
