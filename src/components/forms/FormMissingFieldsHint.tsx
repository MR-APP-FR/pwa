'use client';

import { useThemeColors } from '../../hooks/useThemeColors';
import { useTranslation } from '../../hooks/useTranslation';
import { BottomSheetModal } from '../common/BottomSheetModal';

interface FormMissingFieldsHintProps {
  items: string[];
  open: boolean;
  onClose: () => void;
}

/** Popup listant les champs manquants (ouverture / fermeture). */
export function FormMissingFieldsHint({ items, open, onClose }: FormMissingFieldsHintProps) {
  const { colors } = useThemeColors();
  const { t } = useTranslation();

  if (items.length === 0) return null;

  return (
    <BottomSheetModal
      isOpen={open}
      onClose={onClose}
      colors={colors}
      title={t('forms.common.missingFieldsTitle')}
      titleId="missing-fields-sheet-title"
      closeAriaLabel={t('common.cancel')}
      doneLabel={t('forms.common.missingFieldsDone')}
    >
      <ul className="list-disc space-y-2 pl-5 pb-2">
        {items.map((item) => (
          <li key={item} className="text-sm leading-snug" style={{ color: colors.TEXT_PRIMARY }}>
            {item}
          </li>
        ))}
      </ul>
    </BottomSheetModal>
  );
}
