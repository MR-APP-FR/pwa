'use client';

import { Header } from './Header';
import { useThemeColors } from '../../hooks/useThemeColors';

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
 */
export function FormScrollLayout({ children, footer }: FormScrollLayoutProps) {
  const { colors } = useThemeColors();

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
