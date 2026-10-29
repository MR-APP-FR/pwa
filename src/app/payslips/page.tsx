'use client';

import { useRouter } from 'next/navigation';
import { PageHeader } from '../../components/layout/PageHeader';
import { FormScrollLayout } from '../../components/layout/FormScrollLayout';
import { FormPinnedPageHeader } from '../../components/layout/FormPinnedPageHeader';
import { PayslipsList } from '../../components/profil/PayslipsList';
import { useThemeColors } from '../../hooks/useThemeColors';
import { useTranslation } from '../../hooks/useTranslation';

export default function PayslipsPage() {
  const router = useRouter();
  const { colors } = useThemeColors();
  const { t } = useTranslation();

  return (
    <FormScrollLayout>
      <div className="flex flex-1 flex-col" style={{ backgroundColor: colors.BG_SECONDARY }}>
        <FormPinnedPageHeader>
          <PageHeader
            pin="static"
            accent="blue"
            title={t('screens.payslips.title')}
            showBack
            onBack={() => router.push('/')}
          />
        </FormPinnedPageHeader>

        <div className="flex-1 overflow-y-auto px-4 pb-8 pt-4">
          <p className="mb-5 text-sm leading-relaxed" style={{ color: colors.TEXT_SECONDARY }}>
            {t('screens.payslips.subtitle')}
          </p>

          <PayslipsList variant="page" />
        </div>
      </div>
    </FormScrollLayout>
  );
}
