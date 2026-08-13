'use client';

import { useEffect } from 'react';
import { Header } from './Header';
import { useThemeColors } from '../../hooks/useThemeColors';
import { useSuppressGlobalHeader } from '../../app/providers';

interface FormScrollLayoutProps {
  children: React.ReactNode;
  footer?: React.ReactNode;
}

/** Hauteur réservée sous le contenu pour le footer fixe (bouton + safe area). */
const FOOTER_SPACER = 'calc(5.5rem + env(safe-area-inset-bottom))';

/**
 * Layout formulaire : scroll natif de la page.
 * Le header logo défile ; le PageHeader (sticky) se fixe en haut ;
 * le footer d'action reste collé en bas de l'écran.
 *
 * Masque le Header sticky global (rendu par AppShell) pendant son montage,
 * puisqu'il rend lui-même un Header en variant scrollant.
 */
export function FormScrollLayout({ children, footer }: FormScrollLayoutProps) {
  const { colors } = useThemeColors();
  const { hide, show } = useSuppressGlobalHeader();

  useEffect(() => {
    hide();
    return show;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <Header variant="static" />
      {children}
      {footer && <div aria-hidden style={{ height: FOOTER_SPACER }} />}
      {footer && (
        <div
          className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          <div
            className="pointer-events-auto w-full max-w-md border-t"
            style={{
              backgroundColor: colors.BG_SECONDARY,
              borderColor: colors.BORDER,
            }}
          >
            {footer}
          </div>
        </div>
      )}
    </>
  );
}
