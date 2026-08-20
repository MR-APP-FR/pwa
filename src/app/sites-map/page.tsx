'use client';

import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { PageHeader } from '../../components/layout/PageHeader';
import { FormScrollLayout } from '../../components/layout/FormScrollLayout';
import { FormPinnedPageHeader } from '../../components/layout/FormPinnedPageHeader';
import { useThemeColors } from '../../hooks/useThemeColors';
import { useTranslation } from '../../hooks/useTranslation';

const SitesMapView = dynamic(() => import('../../components/sites/SitesMapView'), {
  ssr: false,
  loading: () => <MapLoading />,
});

function MapLoading() {
  const { colors } = useThemeColors();
  const { t } = useTranslation();

  return (
    <div
      className="flex flex-1 items-center justify-center"
      style={{ backgroundColor: colors.BG_TERTIARY }}
    >
      <p className="text-sm" style={{ color: colors.TEXT_SECONDARY }}>
        {t('screens.sitesMap.loading')}
      </p>
    </div>
  );
}

export default function SitesMapPage() {
  const router = useRouter();
  const { colors } = useThemeColors();
  const { t } = useTranslation();

  return (
    <FormScrollLayout>
      <div
        className="flex min-h-0 flex-col"
        style={{
          backgroundColor: colors.BG_SECONDARY,
          height: 'calc(100dvh - 7.5rem)',
        }}
      >
        <FormPinnedPageHeader>
          <PageHeader
            pin="static"
            accent="pink"
            title={t('screens.home.sitesMapButton')}
            showBack
            onBack={() => router.push('/')}
          />
        </FormPinnedPageHeader>
        <SitesMapView />
      </div>
    </FormScrollLayout>
  );
}
