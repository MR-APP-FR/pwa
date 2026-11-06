'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { PageHeader } from '../../components/layout/PageHeader';
import { FormScrollLayout } from '../../components/layout/FormScrollLayout';
import { FormPinnedPageHeader } from '../../components/layout/FormPinnedPageHeader';
import { TechPlanningDirectoryBoard } from '../../components/annuaire/TechPlanningDirectoryBoard';
import { useThemeColors } from '../../hooks/useThemeColors';
import { useCurrentUser } from '../../hooks/api/useCurrentUser';
import { isMaintenanceRole } from '../../lib/staff-role';

export default function AnnuairePage() {
  const router = useRouter();
  const { colors } = useThemeColors();
  const { data: currentUser, isLoading } = useCurrentUser();
  const isMaintenance = isMaintenanceRole(currentUser?.user.role);

  useEffect(() => {
    if (!isLoading && !isMaintenance) {
      router.replace('/');
    }
  }, [isLoading, isMaintenance, router]);

  if (isLoading || !isMaintenance) {
    return (
      <div
        className="flex flex-1 items-center justify-center p-6 text-sm"
        style={{ color: colors.TEXT_MUTED, background: colors.BG_SECONDARY }}
      >
        Chargement…
      </div>
    );
  }

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
            accent="orange"
            title="Qui est où ?"
            showBack
            onBack={() => router.push('/')}
          />
        </FormPinnedPageHeader>
        <TechPlanningDirectoryBoard />
      </div>
    </FormScrollLayout>
  );
}
