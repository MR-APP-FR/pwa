'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useTranslation } from '@/hooks/useTranslation';

export interface CameraCaptureResult {
  blob: Blob;
  objectUrl: string;
}

type PermissionState = 'pending' | 'granted' | 'denied' | 'unsupported';

export interface CameraCaptureProps {
  onCapture: (result: CameraCaptureResult) => void;
  onClose?: () => void;
}

export function CameraCapture({ onCapture, onClose }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [permission, setPermission] = useState<PermissionState>('pending');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const { colors } = useThemeColors();
  const { t } = useTranslation();

  const stopTracks = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function start() {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        if (!cancelled) setPermission('unsupported');
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play().catch(() => undefined);
        }
        if (!cancelled) setPermission('granted');
      } catch {
        if (!cancelled) {
          setPermission('denied');
          setErrorMessage(t('camera.errorPermission'));
        }
      }
    }

    void start();

    return () => {
      cancelled = true;
      stopTracks();
    };
  }, [stopTracks, t]);

  const handleCapture = useCallback(() => {
    const video = videoRef.current;
    if (!video || video.readyState < 2 || video.videoWidth === 0) return;

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        stopTracks();
        const objectUrl = URL.createObjectURL(blob);
        onCapture({ blob, objectUrl });
      },
      'image/jpeg',
      0.92
    );
  }, [onCapture, stopTracks]);

  return (
    <div
      className="flex flex-col gap-3 rounded-2xl border px-4 py-4"
      style={{ borderColor: colors.BORDER, backgroundColor: colors.SETTINGS_SECTION_BG }}
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl bg-black/80">
        <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
        {permission === 'pending' && (
          <div className="absolute inset-0 flex items-center justify-center text-sm font-medium text-white/90">
            {t('camera.starting')}
          </div>
        )}
      </div>

      {(permission === 'denied' && errorMessage) || permission === 'unsupported' ? (
        <p className="text-sm" style={{ color: colors.TEXT_SECONDARY }}>
          {permission === 'denied' ? errorMessage : t('camera.unsupported')}
        </p>
      ) : null}

      <div className="flex gap-2">
        {permission === 'granted' && (
          <button
            type="button"
            onClick={handleCapture}
            className="flex-1 rounded-xl py-3 text-sm font-bold"
            style={{ backgroundColor: colors.PRIMARY, color: colors.TEXT_INVERSE }}
          >
            {t('camera.capture')}
          </button>
        )}
        {onClose && (
          <button
            type="button"
            onClick={() => {
              stopTracks();
              onClose();
            }}
            className="rounded-xl border px-4 py-3 text-sm font-semibold"
            style={{ borderColor: colors.BORDER, color: colors.TEXT_PRIMARY }}
          >
            {t('common.cancel')}
          </button>
        )}
      </div>
    </div>
  );
}
