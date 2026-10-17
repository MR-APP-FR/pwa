'use client';

import { useEffect, useState, useTransition } from 'react';
import { useThemeColors } from '../../hooks/useThemeColors';
import { useTranslation } from '../../hooks/useTranslation';
import { useCurrentUser } from '../../hooks/api/useCurrentUser';
import {
  getPayslipSignedUrl,
  listMyPayslips,
  type MyPayslipItem,
} from '../../app/profil/actions';

const MONTH_FORMATTER = new Intl.DateTimeFormat('fr-FR', {
  month: 'long',
  year: 'numeric',
});

function formatPeriodLabel(period: string): string {
  const date = new Date(`${period.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return period;
  const label = MONTH_FORMATTER.format(date);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

async function openPayslipUrl(url: string, downloadName?: string) {
  if (downloadName) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error('fetch_failed');
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = downloadName;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
      return;
    } catch {
      // fallback ci-dessous
    }
  }
  const opened = window.open(url, '_blank', 'noopener,noreferrer');
  if (!opened) window.location.assign(url);
}

/**
 * Fiches de paie — même langage UI que sites accessibles / profil :
 * titre de section + carte blanche, lignes sobres, actions texte.
 */
export function PayslipsSection() {
  const { colors } = useThemeColors();
  const { t } = useTranslation();
  const { data: currentUser } = useCurrentUser();
  const employeeId = currentUser?.user?.id ?? null;
  const [items, setItems] = useState<MyPayslipItem[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    setItems(null);
    setLoadError(null);
    setActionError(null);

    void listMyPayslips()
      .then((list) => {
        if (!cancelled) setItems(list);
      })
      .catch(() => {
        if (cancelled) return;
        setItems([]);
        setLoadError(t('settings.profile.payslipLoadError'));
      });

    return () => {
      cancelled = true;
    };
  }, [employeeId, t]);

  function handleAction(item: MyPayslipItem, mode: 'view' | 'download') {
    setActionError(null);
    setBusyId(item.id);
    startTransition(async () => {
      try {
        const url = await getPayslipSignedUrl(item.file_path);
        if (!url) {
          setActionError(t('settings.profile.payslipOpenError'));
          return;
        }
        const ym = item.period.slice(0, 7);
        await openPayslipUrl(
          url,
          mode === 'download' ? `fiche-paie-${ym}.pdf` : undefined,
        );
      } finally {
        setBusyId(null);
      }
    });
  }

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
        {items === null ? (
          <div className="px-5 py-4">
            <p className="text-sm" style={{ color: colors.TEXT_SECONDARY }}>
              {t('settings.profile.payslipLoading')}
            </p>
          </div>
        ) : items.length === 0 ? (
          <div className="px-5 py-4">
            <p className="text-sm" style={{ color: colors.TEXT_SECONDARY }}>
              {loadError ?? t('settings.profile.payslipEmptyHint')}
            </p>
          </div>
        ) : (
          items.map((item) => {
            const busy = busyId === item.id;
            return (
              <div key={item.id} className="flex items-center gap-3 px-5 py-3.5">
                <div
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: colors.PRIMARY }}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <p className="text-base font-medium" style={{ color: colors.TEXT_PRIMARY }}>
                    {formatPeriodLabel(item.period)}
                  </p>
                  <p className="text-sm" style={{ color: colors.TEXT_SECONDARY }}>
                    PDF
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => handleAction(item, 'view')}
                    className="text-sm font-semibold transition-opacity active:opacity-70 disabled:opacity-45"
                    style={{ color: colors.PRIMARY }}
                  >
                    {busy ? t('settings.profile.payslipOpening') : t('settings.profile.payslipView')}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => handleAction(item, 'download')}
                    className="text-sm font-medium transition-opacity active:opacity-70 disabled:opacity-45"
                    style={{ color: colors.TEXT_SECONDARY }}
                  >
                    {t('settings.profile.payslipDownload')}
                  </button>
                </div>
              </div>
            );
          })
        )}

        {actionError ? (
          <p className="px-5 pb-3 text-xs" style={{ color: colors.DANGER_STRONG ?? '#EB5757' }}>
            {actionError}
          </p>
        ) : null}
      </div>
    </>
  );
}
