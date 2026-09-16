'use client';

import Image from 'next/image';
import { useThemeColors } from '../../hooks/useThemeColors';
import { useTranslation } from '../../hooks/useTranslation';
import { formatDateTime } from '../../lib/formatDate';
import { RADIUS } from '../../constants/design';
import type { PhotoSource } from '../../database/types';

interface LockedPhotoThumbProps {
  label: string;
  signedUrl: string | null;
  source: PhotoSource | null;
  capturedAtIso: string | null;
}

/** Aperçu photo en lecture seule (formulaire déjà validé). */
export function LockedPhotoThumb({
  label,
  signedUrl,
  source,
  capturedAtIso,
}: LockedPhotoThumbProps) {
  const { colors } = useThemeColors();
  const { t } = useTranslation();
  const capturedLabel = capturedAtIso ? formatDateTime(new Date(capturedAtIso)) : null;

  return (
    <div className="space-y-1.5 pt-2">
      <label className="text-sm font-semibold" style={{ color: colors.TEXT_PRIMARY }}>
        {label}
      </label>
      {signedUrl ? (
        <div className="flex flex-col gap-2">
          <Image
            src={signedUrl}
            alt={label}
            width={96}
            height={96}
            className="rounded-lg object-cover"
            style={{ height: 96, width: 96, borderRadius: RADIUS.sm }}
            unoptimized
          />
          {(source || capturedLabel) && (
            <div
              className="rounded-xl border px-3 py-2 text-xs leading-relaxed"
              style={{
                borderColor: colors.BORDER,
                color: colors.TEXT_SECONDARY,
                backgroundColor: colors.BG_SECONDARY,
              }}
            >
              {source && (
                <p>
                  <span className="font-semibold" style={{ color: colors.TEXT_PRIMARY }}>
                    {t('forms.closing.photoSourceLabel')}
                  </span>{' '}
                  {source === 'camera_live'
                    ? t('forms.closing.photoSourceLive')
                    : t('forms.closing.photoSourcePhototheque')}
                </p>
              )}
              {capturedLabel && (
                <p className={source ? 'mt-1' : undefined}>
                  <span className="font-semibold" style={{ color: colors.TEXT_PRIMARY }}>
                    {t('forms.closing.photoCapturedAt')}
                  </span>{' '}
                  {capturedLabel}
                </p>
              )}
            </div>
          )}
        </div>
      ) : (
        <p className="text-sm" style={{ color: colors.TEXT_SECONDARY }}>
          —
        </p>
      )}
    </div>
  );
}
