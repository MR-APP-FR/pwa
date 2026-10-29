'use client';

import { useEffect, useState } from 'react';
import { hasMyPayslips } from '../app/profil/actions';
import { useCurrentUser } from './api/useCurrentUser';

/**
 * True si l’employé courant a ≥1 fiche de paie.
 * `null` pendant le chargement (home : garder la tuile idées pour éviter un flash).
 */
export function useHasPayslips(): boolean | null {
  const { data: currentUser } = useCurrentUser();
  const employeeId = currentUser?.user?.id ?? null;
  const [hasPayslips, setHasPayslips] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    setHasPayslips(null);

    if (!employeeId) {
      setHasPayslips(false);
      return () => {
        cancelled = true;
      };
    }

    void hasMyPayslips()
      .then((value) => {
        if (!cancelled) setHasPayslips(value);
      })
      .catch(() => {
        if (!cancelled) setHasPayslips(false);
      });

    return () => {
      cancelled = true;
    };
  }, [employeeId]);

  return hasPayslips;
}
