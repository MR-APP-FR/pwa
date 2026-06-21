'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Trash2, X } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useThemeColors } from '../../hooks/useThemeColors';
import { useTranslation } from '../../hooks/useTranslation';
import { useSujets } from '../../hooks/api/useSujets';
import { createSujet } from '../../lib/actions/daily-info';
import { PrimaryButton } from '../common/PrimaryButton';
import { YesNoToggle } from '../common/YesNoToggle';
import { RADIUS } from '../../constants/design';

export type SujetReasons = Record<number, string>;

interface PannesSectionProps {
  siteId: number | undefined;
  selectedSujetIds: number[];
  onToggleSujet: (id: number) => void;
  sujetReasons: SujetReasons;
  onSujetReasonChange: (id: number, reason: string) => void;
  onClearPannes: () => void;
}

export function buildPannesDetail(
  selectedSujetIds: number[],
  sujetReasons: SujetReasons,
  sujets: { id: number; name: string }[],
): string | null {
  const lines = selectedSujetIds
    .map((id) => {
      const name = sujets.find((s) => s.id === id)?.name;
      const reason = sujetReasons[id]?.trim();
      if (!name) return reason || null;
      return reason ? `${name}: ${reason}` : name;
    })
    .filter((line): line is string => Boolean(line));

  return lines.length > 0 ? lines.join('\n') : null;
}

function PannesSelectionContent({
  siteId,
  selectedSujetIds,
  onToggleSujet,
  sujetReasons,
  onSujetReasonChange,
}: Omit<PannesSectionProps, 'onClearPannes'>) {
  const { colors } = useThemeColors();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data: sujets } = useSujets(siteId);

  const [newSujetName, setNewSujetName] = useState('');
  const [creatingSujet, setCreatingSujet] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const yesLabel = t('forms.opening.fondDeCaisseYes');
  const noLabel = t('forms.opening.fondDeCaisseNo');

  async function handleCreateSujet() {
    if (!siteId) return;
    const trimmed = newSujetName.trim();
    if (trimmed.length === 0) return;
    setCreatingSujet(true);
    setCreateError(null);
    try {
      const result = await createSujet(siteId, trimmed);
      if (!result.ok) {
        setCreateError(result.error);
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ['sujets', siteId] });
      setNewSujetName('');
    } finally {
      setCreatingSujet(false);
    }
  }

  function setHasProblem(id: number, hasProblem: boolean) {
    const currentlySelected = selectedSujetIds.includes(id);
    if (hasProblem && !currentlySelected) {
      onToggleSujet(id);
    } else if (!hasProblem && currentlySelected) {
      onToggleSujet(id);
      onSujetReasonChange(id, '');
    }
  }

  return (
    <div className="space-y-2.5">
      <p className="px-1 text-sm" style={{ color: colors.TEXT_SECONDARY }}>
        {t('forms.dailyInfo.pannesSujetsHelp')}
      </p>

      {(sujets ?? []).length === 0 ? (
        <p className="px-1 text-sm italic" style={{ color: colors.TEXT_SECONDARY }}>
          {t('forms.dailyInfo.pannesSujetsEmpty')}
        </p>
      ) : (
        (sujets ?? []).map((s) => {
          const hasProblem = selectedSujetIds.includes(s.id);
          return (
            <div key={s.id} className="card-surface space-y-2.5 px-3.5 py-3">
              <div className="flex items-center justify-between gap-3">
                <span
                  className="min-w-0 text-sm font-bold leading-snug"
                  style={{
                    color: hasProblem ? colors.TEXT_PRIMARY : colors.TEXT_SECONDARY,
                    fontFamily: 'var(--font-display)',
                  }}
                >
                  {s.name}
                </span>
                <YesNoToggle
                  compact
                  noFirst
                  invertSelectedColors
                  value={hasProblem}
                  onChange={(value) => setHasProblem(s.id, value)}
                  yesLabel={yesLabel}
                  noLabel={noLabel}
                />
              </div>
              {hasProblem && (
                <input
                  type="text"
                  placeholder={t('forms.dailyInfo.pannesSujetReasonPlaceholder')}
                  value={sujetReasons[s.id] ?? ''}
                  onChange={(e) => onSujetReasonChange(s.id, e.target.value)}
                  className="w-full rounded-xl border px-3 py-2.5 text-sm"
                  style={{
                    color: colors.TEXT_PRIMARY,
                    borderColor: colors.BORDER,
                    backgroundColor: colors.BG_SECONDARY,
                    borderRadius: RADIUS.sm,
                  }}
                />
              )}
            </div>
          );
        })
      )}

      <div className="card-surface space-y-2 px-3.5 py-3">
        <p className="text-sm font-bold" style={{ color: colors.TEXT_PRIMARY, fontFamily: 'var(--font-display)' }}>
          {t('forms.dailyInfo.pannesSujetCreateLabel')}
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={newSujetName}
            onChange={(e) => setNewSujetName(e.target.value)}
            placeholder={t('forms.dailyInfo.pannesSujetCreatePlaceholder')}
            className="flex-1 rounded-xl border px-3 py-2.5 text-sm"
            style={{
              color: colors.TEXT_PRIMARY,
              borderColor: colors.BORDER,
              backgroundColor: colors.BG_SECONDARY,
              borderRadius: RADIUS.sm,
            }}
          />
          <button
            type="button"
            onClick={handleCreateSujet}
            disabled={creatingSujet || newSujetName.trim().length === 0}
            className="shrink-0 rounded-xl border px-3 py-2.5 text-xs font-semibold disabled:opacity-60"
            style={{
              borderColor: colors.PRIMARY,
              backgroundColor: colors.PRIMARY + '15',
              color: colors.PRIMARY,
              borderRadius: RADIUS.sm,
            }}
          >
            {creatingSujet ? '...' : t('forms.dailyInfo.pannesSujetCreate')}
          </button>
        </div>
        {createError && (
          <p className="text-xs" style={{ color: '#EB5757' }}>
            {createError}
          </p>
        )}
      </div>
    </div>
  );
}

function PannesModal({
  isOpen,
  onClose,
  colors,
  children,
}: {
  isOpen: boolean;
  onClose: () => void;
  colors: Record<string, string>;
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  const [isVisible, setIsVisible] = useState(false);
  const backdropRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => setIsVisible(true));
    } else {
      setIsVisible(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen) {
      dialogRef.current?.focus();
    }
  }, [isOpen]);

  const handleClose = () => {
    setIsVisible(false);
    setTimeout(onClose, 200);
  };

  if (!isOpen) return null;

  return createPortal(
    <div
      ref={backdropRef}
      onClick={(e) => {
        if (e.target === backdropRef.current) handleClose();
      }}
      className="fixed inset-0 z-[9999] flex items-end justify-center sm:items-center sm:px-4"
      style={{
        backgroundColor: isVisible ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0)',
        transition: 'background-color 0.2s ease',
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="pannes-modal-title"
        tabIndex={-1}
        className="flex w-full max-w-md flex-col overflow-hidden outline-none sm:rounded-2xl"
        style={{
          backgroundColor: colors.BG_SECONDARY,
          maxHeight: '90vh',
          boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
          transform: isVisible ? 'translateY(0)' : 'translateY(100%)',
          opacity: isVisible ? 1 : 0,
          transition: 'transform 0.2s ease, opacity 0.2s ease',
        }}
      >
        <div className="flex justify-center pt-3">
          <div className="h-1 w-9 rounded-full" style={{ backgroundColor: colors.TEXT_SECONDARY + '30' }} />
        </div>
        <div className="flex items-start justify-between px-4 pb-2 pt-4">
          <h2
            id="pannes-modal-title"
            className="pr-4 text-xl font-bold"
            style={{ color: colors.TEXT_PRIMARY, fontFamily: 'var(--font-display)' }}
          >
            {t('forms.dailyInfo.pannesModalSelectionTitle')}
          </h2>
          <button
            type="button"
            onClick={handleClose}
            aria-label={t('common.cancel')}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
            style={{ backgroundColor: colors.TEXT_SECONDARY + '15' }}
          >
            <X size={16} color={colors.TEXT_SECONDARY} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {children}
          <PrimaryButton onClick={handleClose} className="mt-4 w-full py-3.5 text-base">
            {t('forms.dailyInfo.pannesModalDone')}
          </PrimaryButton>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function PannesSection({
  siteId,
  selectedSujetIds,
  onToggleSujet,
  sujetReasons,
  onSujetReasonChange,
  onClearPannes,
}: PannesSectionProps) {
  const { colors } = useThemeColors();
  const { t } = useTranslation();
  const { data: sujets } = useSujets(siteId);

  const [modalOpen, setModalOpen] = useState(false);

  const hasPannes = selectedSujetIds.length > 0;

  const summaryItems = selectedSujetIds
    .map((id) => {
      const name = (sujets ?? []).find((s) => s.id === id)?.name;
      const reason = sujetReasons[id]?.trim();
      if (!name) return null;
      return {
        id,
        label: reason ? `${name} — ${reason}` : name,
      };
    })
    .filter((item): item is { id: number; label: string } => Boolean(item));

  const summaryFallback =
    hasPannes && summaryItems.length === 0
      ? t('forms.dailyInfo.pannesSummaryCount').replace('{{count}}', String(selectedSujetIds.length))
      : null;

  function openModal() {
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
  }

  return (
    <>
      <div className="space-y-2">
        {hasPannes ? (
          <ul className="list-none space-y-1.5">
            {summaryItems.map((item) => (
              <li
                key={item.id}
                className="text-base font-bold leading-snug"
                style={{
                  color: colors.ACCENT_ORANGE,
                  fontFamily: 'var(--font-display)',
                }}
              >
                {item.label}
              </li>
            ))}
            {summaryFallback && (
              <li
                className="text-base font-bold leading-snug"
                style={{
                  color: colors.ACCENT_ORANGE,
                  fontFamily: 'var(--font-display)',
                }}
              >
                {summaryFallback}
              </li>
            )}
          </ul>
        ) : (
          <p className="text-xs" style={{ color: colors.TEXT_SECONDARY }}>
            {t('forms.dailyInfo.pannesNone')}
          </p>
        )}
        <button
          type="button"
          onClick={openModal}
          className="w-full rounded-xl border py-2.5 text-sm font-semibold"
          style={{
            borderColor: hasPannes ? colors.PRIMARY : colors.BORDER,
            backgroundColor: hasPannes ? colors.PRIMARY + '15' : colors.BG_SECONDARY,
            color: hasPannes ? colors.PRIMARY : colors.TEXT_PRIMARY,
            borderRadius: RADIUS.sm,
          }}
        >
          {hasPannes ? t('common.edit') : t('forms.dailyInfo.pannesReportButton')}
        </button>
        {hasPannes && (
          <button
            type="button"
            onClick={onClearPannes}
            className="flex w-full items-center justify-center gap-2 rounded-xl border py-2.5 text-sm font-semibold transition-all active:scale-[0.98]"
            style={{
              borderColor: colors.ACCENT_RED + '35',
              backgroundColor: colors.ACCENT_RED_MUTED,
              color: colors.ACCENT_RED,
              borderRadius: RADIUS.sm,
              fontFamily: 'var(--font-display)',
            }}
          >
            <Trash2 size={16} aria-hidden />
            {t('forms.dailyInfo.pannesClear')}
          </button>
        )}
      </div>

      <PannesModal isOpen={modalOpen} onClose={closeModal} colors={colors}>
        <PannesSelectionContent
          siteId={siteId}
          selectedSujetIds={selectedSujetIds}
          onToggleSujet={onToggleSujet}
          sujetReasons={sujetReasons}
          onSujetReasonChange={onSujetReasonChange}
        />
      </PannesModal>
    </>
  );
}
