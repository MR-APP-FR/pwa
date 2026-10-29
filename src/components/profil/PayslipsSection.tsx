'use client';

import { useThemeColors } from '../../hooks/useThemeColors';
import { useTranslation } from '../../hooks/useTranslation';
import { PayslipsList } from './PayslipsList';

/**
 * Fiches de paie — même langage UI que sites accessibles / profil :
 * titre de section + carte blanche, lignes sobres, actions texte.
 */
export function PayslipsSection() {
  const { colors } = useThemeColors();
  const { t } = useTranslation();

  return (
    <>
      <p
        className="text-xs font-semibold uppercase tracking-wider px-5 pt-7 pb-2"
        style={{ color: colors.TEXT_SECONDARY }}
      >
        {t('settings.profile.payslipsTitle')}
      </p>

      <div
        className="mx-5 overflow-hidden rounded-2xl"
        style={{ backgroundColor: colors.SETTINGS_SECTION_BG, boxShadow: colors.CARD_SHADOW }}
      >
        <PayslipsList variant="compact" />
      </div>
    </>
  );
}
