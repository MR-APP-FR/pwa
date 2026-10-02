'use client';

import { useEffect, useState, useTransition } from 'react';
import { createClient } from '../../lib/supabase/client';
import { useCurrentUser } from '../../hooks/api/useCurrentUser';
import { useSiteHeuresOuverture } from '../../hooks/api/useSiteHeuresOuverture';
import { useThemeColors } from '../../hooks/useThemeColors';
import { useTranslation } from '../../hooks/useTranslation';
import { getDevDateOverride } from '../../lib/dev/dateOverrideClient';
import {
  dateIsoToJourSemaineKey,
  formatHeureOuvertureDisplay,
  getExpectedOpeningDeadline,
  lateOpeningPromptCutoffFromDateIso,
} from '../../lib/parisTime';
import { BottomSheetModal } from '../common/BottomSheetModal';
import { PrimaryButton } from '../common/PrimaryButton';
import { RADIUS } from '../../constants/design';
import { reportLateOpeningToBureau } from '../../app/opening/late-opening-actions';
import type { PlanningWithColleague } from '../../database/types';

export function LateOpeningPrompt({
  todayMission,
  todayIso,
}: {
  todayMission: PlanningWithColleague | null;
  todayIso: string;
}) {
  const { colors } = useThemeColors();
  const { t } = useTranslation();
  const { data: currentUser } = useCurrentUser();
  const { data: heures, isFetched: heuresFetched } = useSiteHeuresOuverture(
    todayMission?.site_id,
  );

  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [empty, setEmpty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [hourLabel, setHourLabel] = useState('10H00');

  useEffect(() => {
    if (!todayMission || !currentUser?.user) {
      setOpen(false);
      return;
    }
    // Ouverture site = responsabilité du teneur ; le double arrive à `heures.double`.
    if (todayMission.role === 'double' && todayMission.user_id > 0) {
      setOpen(false);
      return;
    }
    if (!heuresFetched) return;

    const deadline = getExpectedOpeningDeadline(todayIso, heures ?? null);
    if (!deadline) {
      setOpen(false);
      return;
    }
    const now = getDevDateOverride() ?? new Date();
    if (now.getTime() <= deadline.getTime()) {
      setOpen(false);
      return;
    }
    const cutoff = lateOpeningPromptCutoffFromDateIso(todayIso);
    if (!cutoff || now.getTime() >= cutoff.getTime()) {
      setOpen(false);
      return;
    }

    const raw = heures?.[dateIsoToJourSemaineKey(todayIso)]?.ouvre ?? null;
    const label = formatHeureOuvertureDisplay(raw) || '10H00';
    setHourLabel(label);

    let cancelled = false;
    const supabase = createClient();
    const siteId = todayMission.site_id;
    void Promise.all([
      supabase
        .from('opening_form')
        .select('id')
        .eq('site_id', siteId)
        .eq('date', todayIso)
        .limit(1)
        .maybeSingle(),
      supabase
        .from('closing_form')
        .select('id')
        .eq('site_id', siteId)
        .eq('date', todayIso)
        .limit(1)
        .maybeSingle(),
      supabase
        .from('opening_late_alert')
        .select('reported_at')
        .eq('site_id', siteId)
        .eq('date', todayIso)
        .maybeSingle(),
    ]).then(([openRes, closeRes, alertRes]) => {
      if (cancelled) return;
      if (openRes.error || closeRes.error || alertRes.error) {
        setOpen(false);
        return;
      }
      if (openRes.data || closeRes.data || alertRes.data?.reported_at) {
        setOpen(false);
        return;
      }
      setOpen(true);
    }).catch(() => {
      if (!cancelled) setOpen(false);
    });

    const msUntilCutoff = cutoff.getTime() - now.getTime();
    const hideAtCutoff = window.setTimeout(() => setOpen(false), msUntilCutoff);

    return () => {
      cancelled = true;
      window.clearTimeout(hideAtCutoff);
    };
  }, [todayMission, todayIso, heures, heuresFetched, currentUser?.user]);

  if (!todayMission) return null;
  const mission = todayMission;

  function handleClose() {
    setOpen(false);
  }

  function handleSend() {
    const trimmed = reason.trim();
    if (trimmed.length === 0) {
      setEmpty(true);
      return;
    }
    setEmpty(false);
    setError(null);
    startTransition(async () => {
      const result = await reportLateOpeningToBureau(
        mission.site_id,
        todayIso,
        trimmed,
        hourLabel,
      );
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOpen(false);
    });
  }

  return (
    <BottomSheetModal
      isOpen={open}
      onClose={handleClose}
      colors={colors}
      title={t('screens.home.lateOpeningTitle')}
      titleId="late-opening-title"
      closeAriaLabel={t('common.cancel')}
      doneLabel={t('screens.home.lateOpeningSend')}
      hideDoneButton
    >
      <p className="mb-3 text-sm leading-relaxed" style={{ color: colors.TEXT_PRIMARY }}>
        {t('screens.home.lateOpeningBody', { hour: hourLabel })}
      </p>
      <textarea
        autoFocus
        placeholder={t('screens.home.lateOpeningPlaceholder')}
        value={reason}
        onChange={(e) => {
          setReason(e.target.value);
          if (e.target.value.trim()) setEmpty(false);
        }}
        maxLength={500}
        rows={4}
        className="min-h-24 w-full resize-none rounded-xl border px-3 py-3 text-base"
        style={{
          color: colors.TEXT_PRIMARY,
          borderColor: empty ? colors.DANGER : colors.BORDER,
          backgroundColor: colors.BG_PRIMARY,
          borderRadius: RADIUS.sm,
        }}
      />
      {empty && (
        <p className="mt-2 text-sm font-semibold" style={{ color: colors.DANGER }} role="alert">
          {t('screens.home.lateOpeningEmpty')}
        </p>
      )}
      {error && (
        <p className="mt-2 text-sm" style={{ color: colors.DANGER }} role="alert">
          {error}
        </p>
      )}
      <PrimaryButton
        onClick={handleSend}
        disabled={pending || reason.trim().length === 0}
        className="mt-4 w-full py-3.5 text-base"
        style={{ backgroundColor: colors.DANGER }}
      >
        {pending ? '...' : t('screens.home.lateOpeningSend')}
      </PrimaryButton>
    </BottomSheetModal>
  );
}
