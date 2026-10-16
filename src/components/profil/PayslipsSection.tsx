'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { FileText } from 'lucide-react';
import { useThemeColors } from '../../hooks/useThemeColors';
import { useTranslation } from '../../hooks/useTranslation';
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

/**
 * Section paramètres : visible seulement s'il existe au moins une fiche de paie.
 */
export function PayslipsSection() {
  const { colors } = useThemeColors();
  const { t } = useTranslation();
  const [items, setItems] = useState<MyPayslipItem[] | null>(null);
  const [selectedId, setSelectedId] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    void listMyPayslips().then((list) => {
      if (cancelled) return;
      setItems(list);
      if (list.length > 0) {
        setSelectedId(String(list[0].id));
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const selected = useMemo(() => {
    if (!items || !selectedId) return null;
    return items.find((item) => String(item.id) === selectedId) ?? null;
  }, [items, selectedId]);

  if (items === null || items.length === 0) {
    return null;
  }

  function handleOpen() {
    if (!selected) return;
    setError(null);
    startTransition(async () => {
      const url = await getPayslipSignedUrl(selected.file_path);
      if (!url) {
        setError(t('settings.profile.payslipOpenError'));
        return;
      }
      window.open(url, '_blank', 'noopener,noreferrer');
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
        <div className="flex items-start gap-3 px-5 py-4">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl"
            style={{ backgroundColor: colors.PRIMARY_MUTED }}
          >
            <FileText size={18} color={colors.PRIMARY} strokeWidth={2.25} />
          </div>
          <div className="min-w-0 flex-1 space-y-3">
            <div>
              <label
                htmlFor="payslip-month"
                className="text-xs font-semibold uppercase tracking-wider"
                style={{ color: colors.TEXT_SECONDARY }}
              >
                {t('settings.profile.payslipMonth')}
              </label>
              <select
                id="payslip-month"
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
                className="mt-1.5 w-full rounded-xl border px-3 py-2.5 text-base"
                style={{
                  borderColor: colors.BORDER,
                  backgroundColor: colors.BG_SECONDARY,
                  color: colors.TEXT_PRIMARY,
                }}
              >
                {items.map((item) => (
                  <option key={item.id} value={String(item.id)}>
                    {formatPeriodLabel(item.period)}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={handleOpen}
              disabled={isPending || !selected}
              className="text-sm font-semibold transition-opacity active:opacity-80 disabled:opacity-50"
              style={{ color: colors.PRIMARY }}
            >
              {isPending ? t('settings.profile.payslipOpening') : t('settings.profile.payslipView')}
            </button>
            {error ? (
              <p className="text-sm" style={{ color: colors.DANGER_STRONG ?? '#EB5757' }}>
                {error}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}
