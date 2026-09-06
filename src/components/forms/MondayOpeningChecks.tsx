'use client';

import { useThemeColors } from '../../hooks/useThemeColors';
import { useTranslation } from '../../hooks/useTranslation';
import { YesNoToggle } from '../common/YesNoToggle';
import { RADIUS } from '../../constants/design';
import type { OpeningAffaires, OpeningPanneaux } from '../../database/types/forms.types';

export const PANNEAUX_COLLES_KEYS = ['prix', 'consigne_securite', 'info'] as const;
export const PANNEAUX_VOLANTS_KEYS = ['reviens_5mn', 'en_panne', 'pause_dej'] as const;
export const AFFAIRES_KEYS = ['produits_entretien', 'fournitures', 'rouleaux_cb'] as const;

export type PanneauKey = (typeof PANNEAUX_COLLES_KEYS)[number] | (typeof PANNEAUX_VOLANTS_KEYS)[number];
export type AffaireKey = (typeof AFFAIRES_KEYS)[number];

export type PanneauxState = Record<PanneauKey, boolean | null>;
export type AffairesState = Record<
  AffaireKey,
  { present: boolean | null; reste: string }
>;

export function emptyPanneauxState(): PanneauxState {
  return {
    prix: null,
    consigne_securite: null,
    info: null,
    reviens_5mn: null,
    en_panne: null,
    pause_dej: null,
  };
}

export function emptyAffairesState(): AffairesState {
  return {
    produits_entretien: { present: null, reste: '' },
    fournitures: { present: null, reste: '' },
    rouleaux_cb: { present: null, reste: '' },
  };
}

export function areMondayChecksComplete(
  panneaux: PanneauxState,
  affaires: AffairesState,
): boolean {
  for (const key of [...PANNEAUX_COLLES_KEYS, ...PANNEAUX_VOLANTS_KEYS]) {
    if (panneaux[key] === null) return false;
  }
  for (const key of AFFAIRES_KEYS) {
    const item = affaires[key];
    if (item.present === null) return false;
    if (item.present === false && item.reste.trim().length === 0) return false;
  }
  return true;
}

export function buildMondayPayload(
  panneaux: PanneauxState,
  affaires: AffairesState,
): { panneaux: OpeningPanneaux; affaires: OpeningAffaires } | null {
  if (!areMondayChecksComplete(panneaux, affaires)) return null;

  const panneauxOut = {} as OpeningPanneaux;
  for (const key of [...PANNEAUX_COLLES_KEYS, ...PANNEAUX_VOLANTS_KEYS]) {
    panneauxOut[key] = panneaux[key] === true;
  }

  const affairesOut = {} as OpeningAffaires;
  for (const key of AFFAIRES_KEYS) {
    const item = affaires[key];
    const present = item.present === true;
    const resteRaw = item.reste.trim();
    const reste = present ? null : Number(resteRaw);
    affairesOut[key] = {
      present,
      reste: present || !Number.isFinite(reste) ? null : reste,
    };
  }

  return { panneaux: panneauxOut, affaires: affairesOut };
}

interface MondayOpeningChecksProps {
  mode?: 'all' | 'panneaux' | 'affaires';
  panneaux: PanneauxState;
  onPanneauChange: (key: PanneauKey, value: boolean) => void;
  affaires: AffairesState;
  onAffairePresentChange: (key: AffaireKey, value: boolean) => void;
  onAffaireResteChange: (key: AffaireKey, value: string) => void;
  fieldError?: string | null;
}

function panneauLabelKey(key: PanneauKey): string {
  return `forms.opening.panneaux.items.${key}`;
}

function affaireLabelKey(key: AffaireKey): string {
  return `forms.opening.affaires.items.${key}`;
}

function PanneauItem({
  label,
  value,
  onChange,
  yesLabel,
  noLabel,
  error,
}: {
  label: string;
  value: boolean | null;
  onChange: (v: boolean) => void;
  yesLabel: string;
  noLabel: string;
  error?: boolean;
}) {
  const { colors } = useThemeColors();
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium leading-snug" style={{ color: colors.TEXT_PRIMARY }}>
        {label}
        <span className="ml-0.5" style={{ color: colors.DANGER }} aria-hidden>
          *
        </span>
      </label>
      <YesNoToggle
        value={value}
        onChange={onChange}
        yesLabel={yesLabel}
        noLabel={noLabel}
        error={error}
      />
    </div>
  );
}

function PanneauSubgroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const { colors } = useThemeColors();
  return (
    <div
      className="overflow-hidden rounded-xl border"
      style={{
        borderColor: colors.BORDER,
        backgroundColor: colors.BG_SECONDARY,
        borderRadius: RADIUS.md,
      }}
    >
      <div
        className="border-b px-3.5 py-2.5"
        style={{ borderColor: colors.BORDER, backgroundColor: colors.BG_TERTIARY }}
      >
        <p
          className="text-[11px] font-semibold uppercase tracking-wide"
          style={{ color: colors.PRIMARY, fontFamily: 'var(--font-display)' }}
        >
          {title}
        </p>
      </div>
      <div className="space-y-3 px-3.5 py-3.5">{children}</div>
    </div>
  );
}

export function MondayOpeningChecks({
  mode = 'all',
  panneaux,
  onPanneauChange,
  affaires,
  onAffairePresentChange,
  onAffaireResteChange,
  fieldError,
}: MondayOpeningChecksProps) {
  const { colors } = useThemeColors();
  const { t } = useTranslation();
  const yesLabel = t('forms.opening.fondDeCaisseYes');
  const noLabel = t('forms.opening.fondDeCaisseNo');
  const showPanneaux = mode === 'all' || mode === 'panneaux';
  const showAffaires = mode === 'all' || mode === 'affaires';

  return (
    <div className="space-y-4">
      {showPanneaux && (
        <>
          <PanneauSubgroup title={t('forms.opening.panneaux.colles')}>
            {PANNEAUX_COLLES_KEYS.map((key) => (
              <PanneauItem
                key={key}
                label={t(panneauLabelKey(key))}
                value={panneaux[key]}
                onChange={(v) => onPanneauChange(key, v)}
                yesLabel={yesLabel}
                noLabel={noLabel}
                error={fieldError === `panneau_${key}`}
              />
            ))}
          </PanneauSubgroup>

          <PanneauSubgroup title={t('forms.opening.panneaux.volants')}>
            {PANNEAUX_VOLANTS_KEYS.map((key) => (
              <PanneauItem
                key={key}
                label={t(panneauLabelKey(key))}
                value={panneaux[key]}
                onChange={(v) => onPanneauChange(key, v)}
                yesLabel={yesLabel}
                noLabel={noLabel}
                error={fieldError === `panneau_${key}`}
              />
            ))}
          </PanneauSubgroup>
        </>
      )}

      {showAffaires && (
        <div className="space-y-3">
          {mode === 'all' && (
            <p
              className="text-[11px] font-semibold uppercase tracking-wide"
              style={{ color: colors.TEXT_SECONDARY, fontFamily: 'var(--font-display)' }}
            >
              {t('forms.opening.affaires.title')}
            </p>
          )}
          <p className="text-sm" style={{ color: colors.TEXT_SECONDARY }}>
            {t('forms.opening.affaires.intro')}
          </p>
          {AFFAIRES_KEYS.map((key) => {
            const item = affaires[key];
            return (
              <div key={key} className="space-y-2">
                <label className="text-sm font-medium leading-snug" style={{ color: colors.TEXT_PRIMARY }}>
                  {t(affaireLabelKey(key))}
                  <span className="ml-0.5" style={{ color: colors.DANGER }} aria-hidden>
                    *
                  </span>
                </label>
                <YesNoToggle
                  value={item.present}
                  onChange={(v) => onAffairePresentChange(key, v)}
                  yesLabel={yesLabel}
                  noLabel={noLabel}
                  error={fieldError === `affaire_${key}`}
                />
                {item.present === false && (
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={item.reste}
                    onChange={(e) => onAffaireResteChange(key, e.target.value)}
                    placeholder={t('forms.opening.affaires.restePlaceholder')}
                    className="w-full rounded-xl border px-3 py-2.5 text-sm"
                    style={{
                      color: colors.TEXT_PRIMARY,
                      borderColor:
                        fieldError === `affaire_reste_${key}` ? colors.DANGER : colors.BORDER,
                      backgroundColor: colors.BG_SECONDARY,
                      borderRadius: RADIUS.sm,
                    }}
                    aria-invalid={fieldError === `affaire_reste_${key}`}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
