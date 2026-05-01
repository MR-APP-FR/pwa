'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { Suspense, useMemo, useState, useTransition } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { usePlanning } from '../../hooks/api/usePlanning';
import { useCurrentUser } from '../../hooks/api/useCurrentUser';
import { useSujets } from '../../hooks/api/useSujets';
import { useSiteDailyInfoQuestions } from '../../hooks/api/useSiteDailyInfoQuestions';
import { useThemeColors } from '../../hooks/useThemeColors';
import { useTranslation } from '../../hooks/useTranslation';
import { WEEK_YEAR, WEEK_MONTH } from '../../constants/mock';
import { createSujet, submitDailyInfo } from './actions';

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function ConditionalQuestion({
  label,
  value,
  onChange,
  yesLabel,
  noLabel,
}: {
  label: string;
  value: boolean | null;
  onChange: (v: boolean) => void;
  yesLabel: string;
  noLabel: string;
}) {
  const { colors } = useThemeColors();
  return (
    <div className="space-y-1">
      <label className="text-sm font-semibold" style={{ color: colors.TEXT_PRIMARY }}>
        {label}
      </label>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onChange(true)}
          className="flex-1 py-2 rounded-lg border text-sm font-semibold"
          style={{
            borderColor: value === true ? colors.PRIMARY : colors.BORDER,
            backgroundColor: value === true ? colors.PRIMARY + '15' : colors.BG_SECONDARY,
            color: value === true ? colors.PRIMARY : colors.TEXT_PRIMARY,
          }}
        >
          {yesLabel}
        </button>
        <button
          type="button"
          onClick={() => onChange(false)}
          className="flex-1 py-2 rounded-lg border text-sm font-semibold"
          style={{
            borderColor: value === false ? colors.PRIMARY : colors.BORDER,
            backgroundColor: value === false ? colors.PRIMARY + '15' : colors.BG_SECONDARY,
            color: value === false ? colors.PRIMARY : colors.TEXT_PRIMARY,
          }}
        >
          {noLabel}
        </button>
      </div>
    </div>
  );
}

function InfoJourContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { colors } = useThemeColors();
  const { t } = useTranslation();
  const { data: planningData } = usePlanning({ year: WEEK_YEAR, month: WEEK_MONTH });
  const { data: currentUser } = useCurrentUser();

  const missionId = Number(searchParams.get('id'));
  const mission = planningData?.planning.find((m) => m.id === missionId);

  const { data: sujets } = useSujets(mission?.site_id);
  const { data: questions } = useSiteDailyInfoQuestions(mission?.site_id);
  const showCarteParking = useMemo(() => questions?.includes('carte_parking') ?? false, [questions]);
  const showMusiqueDisney = useMemo(() => questions?.includes('musique_disney') ?? false, [questions]);

  const [nettoyageVeille, setNettoyageVeille] = useState<boolean | null>(null);
  const [selectedSujetIds, setSelectedSujetIds] = useState<number[]>([]);
  const [pannesAutre, setPannesAutre] = useState('');
  const [pannes, setPannes] = useState('');
  const [carteParking, setCarteParking] = useState<boolean | null>(null);
  const [musiqueDisney, setMusiqueDisney] = useState<boolean | null>(null);
  const [newSujetName, setNewSujetName] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [creatingSujet, setCreatingSujet] = useState(false);

  const toggleSujet = (id: number) => {
    setSelectedSujetIds((prev) =>
      prev.includes(id) ? prev.filter((sid) => sid !== id) : [...prev, id],
    );
  };

  async function handleCreateSujet() {
    if (!mission) return;
    const trimmed = newSujetName.trim();
    if (trimmed.length === 0) return;
    setCreatingSujet(true);
    setSubmitError(null);
    try {
      const result = await createSujet(mission.site_id, trimmed);
      if (!result.ok) {
        setSubmitError(result.error);
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ['sujets', mission.site_id] });
      setSelectedSujetIds((prev) => (prev.includes(result.id) ? prev : [...prev, result.id]));
      setNewSujetName('');
    } finally {
      setCreatingSujet(false);
    }
  }

  function handleSubmit() {
    setSubmitError(null);
    if (!mission) {
      setSubmitError("Mission introuvable.");
      return;
    }
    if (!currentUser?.user) {
      setSubmitError('Aucun employé sélectionné. Choisis un profil dans le header.');
      return;
    }

    startTransition(async () => {
      const result = await submitDailyInfo({
        siteId: mission.site_id,
        userId: currentUser.user.id,
        date: `${mission.year}-${pad2(mission.month)}-${pad2(mission.day)}`,
        nettoyageVeille,
        panneSujetIds: selectedSujetIds,
        pannesAutre: pannesAutre.trim().length === 0 ? null : pannesAutre.trim(),
        pannes: pannes.trim().length === 0 ? null : pannes.trim(),
        carteParking: showCarteParking ? carteParking : null,
        musiqueDisney: showMusiqueDisney ? musiqueDisney : null,
      });
      if (result.ok) {
        setSubmitted(true);
      } else {
        setSubmitError(result.error);
      }
    });
  }

  if (submitted) {
    return (
      <div
        className="flex-1 flex flex-col items-center justify-center p-6 gap-3"
        style={{ backgroundColor: colors.BG_SECONDARY }}
      >
        <span className="text-6xl mb-2">&#x2705;</span>
        <h2 className="text-xl font-bold text-center" style={{ color: colors.TEXT_PRIMARY }}>
          {t('forms.dailyInfo.successTitle')}
        </h2>
        <p className="text-base text-center" style={{ color: colors.TEXT_SECONDARY }}>
          {t('forms.dailyInfo.successDescription')}
        </p>
        <button
          type="button"
          onClick={() => router.back()}
          className="mt-4 px-6 py-3 rounded-2xl text-base font-bold"
          style={{ backgroundColor: colors.PRIMARY, color: colors.TEXT_INVERSE }}
        >
          Retour au planning
        </button>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col" style={{ backgroundColor: colors.BG_SECONDARY }}>
      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-3">
        {mission && (
          <div
            className="rounded-2xl border px-5 py-4"
            style={{ backgroundColor: colors.SETTINGS_SECTION_BG, borderColor: colors.BORDER }}
          >
            <p className="text-lg font-bold" style={{ color: colors.TEXT_PRIMARY }}>
              {mission.site_name}
            </p>
            <p className="text-sm mt-1" style={{ color: colors.TEXT_SECONDARY }}>
              {`${mission.day}/${mission.month}/${mission.year}`}
            </p>
          </div>
        )}

        <div
          className="rounded-2xl border px-5 py-5 space-y-5"
          style={{ backgroundColor: colors.SETTINGS_SECTION_BG, borderColor: colors.BORDER }}
        >
          <ConditionalQuestion
            label={t('forms.dailyInfo.nettoyageVeille')}
            value={nettoyageVeille}
            onChange={setNettoyageVeille}
            yesLabel={t('forms.opening.fondDeCaisseYes')}
            noLabel={t('forms.opening.fondDeCaisseNo')}
          />

          <div className="space-y-2">
            <label className="text-sm font-semibold" style={{ color: colors.TEXT_PRIMARY }}>
              {t('forms.dailyInfo.pannesSujetsTitle')}
            </label>
            <p className="text-xs" style={{ color: colors.TEXT_SECONDARY }}>
              {t('forms.dailyInfo.pannesSujetsHelp')}
            </p>
            <div className="flex flex-wrap gap-2">
              {(sujets ?? []).length === 0 ? (
                <p className="text-xs italic" style={{ color: colors.TEXT_SECONDARY }}>
                  {t('forms.dailyInfo.pannesSujetsEmpty')}
                </p>
              ) : (
                (sujets ?? []).map((s) => {
                  const selected = selectedSujetIds.includes(s.id);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => toggleSujet(s.id)}
                      className="px-3 py-1.5 rounded-full border text-xs font-medium"
                      style={{
                        borderColor: selected ? colors.PRIMARY : colors.BORDER,
                        backgroundColor: selected ? colors.PRIMARY + '15' : colors.BG_SECONDARY,
                        color: selected ? colors.PRIMARY : colors.TEXT_PRIMARY,
                      }}
                    >
                      {s.name}
                    </button>
                  );
                })
              )}
            </div>

            <div className="flex gap-2 pt-1">
              <input
                type="text"
                value={newSujetName}
                onChange={(e) => setNewSujetName(e.target.value)}
                placeholder={t('forms.dailyInfo.pannesSujetCreatePlaceholder')}
                className="flex-1 px-3 py-2 rounded-lg border text-sm"
                style={{
                  color: colors.TEXT_PRIMARY,
                  borderColor: colors.BORDER,
                  backgroundColor: colors.BG_SECONDARY,
                }}
              />
              <button
                type="button"
                onClick={handleCreateSujet}
                disabled={creatingSujet || newSujetName.trim().length === 0}
                className="px-3 py-2 rounded-lg border text-xs font-semibold disabled:opacity-60"
                style={{
                  borderColor: colors.PRIMARY,
                  backgroundColor: colors.PRIMARY + '15',
                  color: colors.PRIMARY,
                }}
              >
                {creatingSujet ? '...' : t('forms.dailyInfo.pannesSujetCreate')}
              </button>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-semibold" style={{ color: colors.TEXT_PRIMARY }}>
              {t('forms.dailyInfo.pannesAutre')}
            </label>
            <input
              type="text"
              value={pannesAutre}
              onChange={(e) => setPannesAutre(e.target.value)}
              placeholder={t('forms.dailyInfo.pannesAutrePlaceholder')}
              className="w-full px-3 py-2 rounded-lg border text-sm"
              style={{
                color: colors.TEXT_PRIMARY,
                borderColor: colors.BORDER,
                backgroundColor: colors.BG_SECONDARY,
              }}
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-semibold" style={{ color: colors.TEXT_PRIMARY }}>
              {t('forms.dailyInfo.pannesDetail')}
            </label>
            <textarea
              value={pannes}
              onChange={(e) => setPannes(e.target.value)}
              rows={3}
              placeholder={t('forms.dailyInfo.pannesDetailPlaceholder')}
              className="w-full px-3 py-2 rounded-lg border text-sm resize-none"
              style={{
                color: colors.TEXT_PRIMARY,
                borderColor: colors.BORDER,
                backgroundColor: colors.BG_SECONDARY,
              }}
            />
          </div>

          {showCarteParking && (
            <ConditionalQuestion
              label={t('forms.dailyInfo.carteParking')}
              value={carteParking}
              onChange={setCarteParking}
              yesLabel={t('forms.opening.fondDeCaisseYes')}
              noLabel={t('forms.opening.fondDeCaisseNo')}
            />
          )}

          {showMusiqueDisney && (
            <ConditionalQuestion
              label={t('forms.dailyInfo.musiqueDisney')}
              value={musiqueDisney}
              onChange={setMusiqueDisney}
              yesLabel={t('forms.opening.fondDeCaisseYes')}
              noLabel={t('forms.opening.fondDeCaisseNo')}
            />
          )}
        </div>

        {submitError && (
          <div
            className="rounded-xl border px-3 py-2 text-xs"
            style={{ borderColor: '#EB5757', color: '#EB5757', backgroundColor: '#EB575710' }}
          >
            {submitError}
          </div>
        )}
      </div>

      <div
        className="px-5 py-4 border-t"
        style={{ backgroundColor: colors.BG_SECONDARY, borderColor: colors.BORDER }}
      >
        <button
          type="button"
          onClick={handleSubmit}
          disabled={pending}
          className="w-full py-4 rounded-2xl text-base font-bold disabled:opacity-60"
          style={{ backgroundColor: colors.PRIMARY, color: colors.TEXT_INVERSE }}
        >
          {pending ? '...' : t('forms.dailyInfo.submit')}
        </button>
      </div>
    </div>
  );
}

export default function InfoJourPage() {
  return (
    <Suspense>
      <InfoJourContent />
    </Suspense>
  );
}
