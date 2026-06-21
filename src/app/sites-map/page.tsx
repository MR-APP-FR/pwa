'use client';

import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { PageHeader } from '../../components/layout/PageHeader';
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
    <div className="flex min-h-0 flex-1 flex-col" style={{ backgroundColor: colors.BG_SECONDARY }}>
      <PageHeader
        title={t('screens.sitesMap.title')}
        showBack
        onBack={() => router.push('/')}
      />
      <SitesMapView />
    </div>
  );
}
