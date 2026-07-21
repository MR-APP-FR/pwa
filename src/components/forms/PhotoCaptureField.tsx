'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { useThemeColors } from '../../hooks/useThemeColors';
import { useTranslation } from '../../hooks/useTranslation';
import { formatDateTime } from '../../lib/formatDate';
import { RADIUS } from '../../constants/design';
import type { PhotoSource } from '../../database/types';

export interface CapturedPhoto {
  file: File;
  source: PhotoSource;
  capturedAtMs: number;
}

interface PhotoCaptureFieldProps {
  label: string;
  /** Affiche l'astérisque rouge et est laissé à l'appelant pour la validation. */
  required?: boolean;
  value: CapturedPhoto | null;
  onChange: (photo: CapturedPhoto | null) => void;
}

/**
 * Étape 2 du cadrage prod (cf. pwa/docs/CADRAGE-PROD-PWA.md).
 * Champ photo réutilisable (aperçu + changer + supprimer), extrait du pattern
 * de la fermeture. Utilisé pour la photo optionnelle du nettoyage veille.
 */
export function PhotoCaptureField({ label, required = false, value, onChange }: PhotoCaptureFieldProps) {
  const { colors } = useThemeColors();
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewUri, setPreviewUri] = useState<string | null>(null);

  // Gère le cycle de vie de l'object URL pour l'aperçu.
  useEffect(() => {
    if (!value) {
      setPreviewUri(null);
      return;
    }
    const url = URL.createObjectURL(value.file);
    setPreviewUri(url);
    return () => URL.revokeObjectURL(url);
  }, [value]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onChange({ file, source: 'phototheque', capturedAtMs: file.lastModified });
    }
    e.target.value = '';
  };

  const capturedLabel = value ? formatDateTime(new Date(value.capturedAtMs)) : null;

  return (
    <div className="space-y-1.5 pt-2">
      <label className="text-sm font-semibold" style={{ color: colors.TEXT_PRIMARY }}>
        {label}
        {required && (
          <span className="ml-0.5" style={{ color: colors.DANGER }} aria-hidden>
            *
          </span>
        )}
      </label>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileChange}
        className="hidden"
      />

      {previewUri ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <Image
              src={previewUri}
              alt="Photo"
              width={72}
              height={72}
              className="rounded-lg object-cover"
              style={{ height: 72, width: 72 }}
            />
            <div className="flex flex-1 flex-col gap-1">
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="min-h-[44px] rounded-lg border py-2 text-xs font-semibold"
                style={{
                  borderColor: colors.PRIMARY,
                  backgroundColor: colors.PRIMARY + '15',
                  color: colors.PRIMARY,
                }}
              >
                {t('forms.common.changePhoto')}
              </button>
              <button
                type="button"
                onClick={() => onChange(null)}
                className="min-h-[44px] rounded-lg border py-2 text-xs font-semibold"
                style={{ borderColor: colors.BORDER, color: colors.TEXT_SECONDARY }}
              >
                {t('forms.common.removePhoto')}
              </button>
            </div>
          </div>
          {capturedLabel && (
            <div
              className="rounded-xl border px-3 py-2 text-xs leading-relaxed"
              style={{ borderColor: colors.BORDER, color: colors.TEXT_SECONDARY }}
            >
              {capturedLabel}
            </div>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="min-h-[44px] w-full rounded-lg border py-2.5 text-sm font-semibold"
          style={{
            borderColor: colors.PRIMARY,
            backgroundColor: colors.PRIMARY + '15',
            color: colors.PRIMARY,
            borderRadius: RADIUS.sm,
          }}
        >
          {t('forms.common.addPhoto')}
        </button>
      )}
    </div>
  );
}
