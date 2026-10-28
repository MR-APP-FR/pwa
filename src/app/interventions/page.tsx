'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useCurrentUser } from '../../hooks/api/useCurrentUser';
import { isMaintenanceRole } from '../../lib/staff-role';

/** Ancienne route : la home tech est `/` (logo + paramètres). */
export default function InterventionsPage() {
  const router = useRouter();
  const { data: currentUser, isLoading } = useCurrentUser();
  const isMaintenance = isMaintenanceRole(currentUser?.user.role);

  useEffect(() => {
    if (isLoading) return;
    router.replace(isMaintenance ? '/' : '/');
  }, [isLoading, isMaintenance, router]);

  return (
    <div className="flex min-h-[40vh] items-center justify-center text-sm text-gray-500">
      Chargement…
    </div>
  );
}
