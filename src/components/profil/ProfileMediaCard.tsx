'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { Camera, ImagePlus, IdCard, UserRound } from 'lucide-react';
import { useThemeColors } from '../../hooks/useThemeColors';
import { useTranslation } from '../../hooks/useTranslation';
import { compressImageFile } from '../../lib/compressImageFile';
import { isBrowserOffline } from '../../lib/offline';
import { RADIUS, TOUCH_TARGET } from '../../constants/design';
import {
  getStaffMediaSignedUrl,
  uploadStaffMedia,
  type StaffMediaKind,
} from '../../app/profil/actions';

function isPdfPath(path: string | null | undefined): boolean {
  if (!path) return false;
  return /\.pdf$/i.test(path.split('?')[0] ?? '');
}

interface ProfileMediaCardProps {
  kind: StaffMediaKind;
  path: string | null;
  onUploaded: (path: string) => void;
}

export function ProfileMediaCard({ kind, path, onUploaded }: ProfileMediaCardProps) {
  const { colors } = useThemeColors();
  const { t } = useTranslation();
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!path) {
      setSignedUrl(null);
      return;
    }
    let cancelled = false;
    getStaffMediaSignedUrl(path).then((url) => {
      if (!cancelled) setSignedUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [path]);

  const missing = !path;
  const isPdf = isPdfPath(path);
  const isAvatar = kind === 'avatar';
  const capture = isAvatar ? 'user' : 'environment';

  function handleFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    if (isBrowserOffline()) {
      setError(t('settings.profile.offline'));
      return;
    }
    startTransition(async () => {
      try {
        const toSend =
          file.type === 'application/pdf'
            ? file
            : await compressImageFile(file, isAvatar ? { maxEdge: 720, quality: 0.78 } : undefined);
        const fd = new FormData();
        fd.set('kind', kind);
        fd.set('file', toSend);
        const result = await uploadStaffMedia(fd);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setSignedUrl(result.signedUrl);
        onUploaded(result.path);
      } catch {
        setError(t('settings.profile.uploadError'));
      }
    });
  }

  const title = isAvatar ? t('settings.profile.photoTitle') : t('settings.profile.cniTitle');
  const hint = missing
    ? isAvatar
      ? t('settings.profile.photoMissing')
      : t('settings.profile.cniMissing')
    : isAvatar
      ? t('settings.profile.photoHint')
      : t('settings.profile.cniHint');

  return (
    <div
      className="mx-5 overflow-hidden rounded-2xl px-5 py-4"
      style={{ backgroundColor: colors.SETTINGS_SECTION_BG, boxShadow: colors.CARD_SHADOW }}
    >
      <div className="flex items-start gap-3">
        {isAvatar ? (
          <div
            className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full"
            style={{
              backgroundColor: colors.PRIMARY_MUTED,
              boxShadow: missing ? `inset 0 0 0 1.5px ${colors.TEXT_SECONDARY}35` : undefined,
            }}
          >
            {signedUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={signedUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="flex h-full w-full items-center justify-center">
                <UserRound size={26} color={colors.PRIMARY} strokeWidth={2} />
              </span>
            )}
          </div>
        ) : (
          <div
            className="relative h-[72px] w-[114px] shrink-0 overflow-hidden rounded-lg"
            style={{
              backgroundColor: colors.PRIMARY_MUTED,
              boxShadow: missing ? `inset 0 0 0 1.5px dashed ${colors.TEXT_SECONDARY}50` : undefined,
            }}
          >
            {signedUrl && !isPdf ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={signedUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="flex h-full w-full flex-col items-center justify-center gap-1">
                <IdCard size={22} color={colors.PRIMARY} strokeWidth={2} />
                <span className="text-[10px] font-semibold" style={{ color: colors.PRIMARY }}>
                  CNI
                </span>
              </span>
            )}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold" style={{ color: colors.TEXT_PRIMARY }}>
            {title}
          </p>
          <p className="mt-0.5 text-sm" style={{ color: colors.TEXT_SECONDARY }}>
            {isPending ? t('settings.profile.uploading') : hint}
          </p>
        </div>
      </div>

      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture={capture}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          handleFile(file);
        }}
      />
      <input
        ref={galleryRef}
        type="file"
        accept={isAvatar ? 'image/*' : 'image/*,application/pdf'}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          handleFile(file);
        }}
      />

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          disabled={isPending}
          onClick={() => cameraRef.current?.click()}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border px-3 text-sm font-semibold transition-opacity active:opacity-80 disabled:opacity-50"
          style={{
            minHeight: TOUCH_TARGET,
            borderColor: colors.PRIMARY,
            backgroundColor: colors.PRIMARY + '15',
            color: colors.PRIMARY,
            borderRadius: RADIUS.sm,
          }}
        >
          <Camera size={16} />
          {t('settings.profile.takePhoto')}
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={() => galleryRef.current?.click()}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border px-3 text-sm font-semibold transition-opacity active:opacity-80 disabled:opacity-50"
          style={{
            minHeight: TOUCH_TARGET,
            borderColor: colors.BORDER,
            color: colors.TEXT_PRIMARY,
            borderRadius: RADIUS.sm,
          }}
        >
          <ImagePlus size={16} />
          {t('settings.profile.chooseFile')}
        </button>
      </div>

      {signedUrl && isPdf && (
        <a
          href={signedUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-block text-sm font-semibold"
          style={{ color: colors.PRIMARY }}
        >
          {t('settings.profile.cniView')}
        </a>
      )}

      {error && (
        <p className="mt-2 text-xs" style={{ color: colors.ACCENT_RED ?? '#EB5757' }}>
          {error}
        </p>
      )}
    </div>
  );
}
