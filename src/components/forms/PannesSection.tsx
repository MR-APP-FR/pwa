'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useThemeColors } from '../../hooks/useThemeColors';
import { useTranslation } from '../../hooks/useTranslation';
import { useSujets } from '../../hooks/api/useSujets';
import { createSujet } from '../../lib/actions/daily-info';

interface PannesSectionProps {
  siteId: number | undefined;
  selectedSujetIds: number[];
  onToggleSujet: (id: number) => void;
  pannesAutre: string;
  onPannesAutreChange: (v: string) => void;
  pannes: string;
  onPannesChange: (v: string) => void;
  onClearPannes: () => void;
}

type ModalStep = 'confirm' | 'selection';

function PannesSelectionContent({
  siteId,
  selectedSujetIds,
  onToggleSujet,
  pannesAutre,
  onPannesAutreChange,
  pannes,
  onPannesChange,
}: Omit<PannesSectionProps, 'onClearPannes'>) {
  const { colors } = useThemeColors();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data: sujets } = useSujets(siteId);

  const [newSujetName, setNewSujetName] = useState('');
  const [creatingSujet, setCreatingSujet] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

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
      if (!selectedSujetIds.includes(result.id)) {
        onToggleSujet(result.id);
      }
      setNewSujetName('');
    } finally {
      setCreatingSujet(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="space-y-2">
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
                  onClick={() => onToggleSujet(s.id)}
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
        {createError && (
          <p className="text-xs" style={{ color: '#EB5757' }}>
            {createError}
          </p>
        )}
      </div>

      <div className="space-y-1">
        <label className="text-sm font-semibold" style={{ color: colors.TEXT_PRIMARY }}>
          {t('forms.dailyInfo.pannesAutre')}
        </label>
        <input
          type="text"
          value={pannesAutre}
          onChange={(e) => onPannesAutreChange(e.target.value)}
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
          onChange={(e) => onPannesChange(e.target.value)}
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
    </div>
  );
}

function PannesModal({
  isOpen,
  step,
  onClose,
  onStepChange,
  onClearPannes,
  colors,
  children,
  title,
}: {
  isOpen: boolean;
  step: ModalStep;
  onClose: () => void;
  onStepChange: (step: ModalStep) => void;
  onClearPannes: () => void;
  colors: Record<string, string>;
  children: React.ReactNode;
  title: string;
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
  }, [isOpen, step]);

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
      className="fixed inset-0 z-[9999] flex items-center justify-center px-4"
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
        className="w-full max-w-md rounded-2xl overflow-hidden flex flex-col outline-none"
        style={{
          backgroundColor: colors.BG_PRIMARY,
          maxHeight: '85vh',
          boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
          transform: isVisible ? 'scale(1)' : 'scale(0.95)',
          opacity: isVisible ? 1 : 0,
          transition: 'transform 0.2s ease, opacity 0.2s ease',
        }}
      >
        <div className="flex justify-center pt-3">
          <div className="w-9 h-1 rounded-full" style={{ backgroundColor: colors.TEXT_SECONDARY + '30' }} />
        </div>
        <div className="flex items-start justify-between px-5 pt-4 pb-2">
          <h2 id="pannes-modal-title" className="text-xl font-bold pr-4" style={{ color: colors.TEXT_PRIMARY }}>
            {title}
          </h2>
          <button
            type="button"
            onClick={handleClose}
            aria-label={t('common.cancel')}
            className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
            style={{ backgroundColor: colors.TEXT_SECONDARY + '15' }}
          >
            <X size={16} color={colors.TEXT_SECONDARY} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-5">
          {step === 'confirm' ? (
            <div className="space-y-4 pb-2">
              <p className="text-sm" style={{ color: colors.TEXT_SECONDARY }}>
                {t('forms.dailyInfo.pannesHasQuestion')}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onClearPannes();
                    handleClose();
                  }}
                  className="flex-1 py-3 rounded-lg border text-sm font-semibold"
                  style={{
                    borderColor: colors.BORDER,
                    backgroundColor: colors.BG_SECONDARY,
                    color: colors.TEXT_PRIMARY,
                  }}
                >
                  {t('forms.opening.fondDeCaisseNo')}
                </button>
                <button
                  type="button"
                  onClick={() => onStepChange('selection')}
                  className="flex-1 py-3 rounded-lg border text-sm font-semibold"
                  style={{
                    borderColor: colors.PRIMARY,
                    backgroundColor: colors.PRIMARY + '15',
                    color: colors.PRIMARY,
                  }}
                >
                  {t('forms.opening.fondDeCaisseYes')}
                </button>
              </div>
            </div>
          ) : (
            <>
              {children}
              <button
                type="button"
                onClick={handleClose}
                className="w-full mt-5 py-3 rounded-xl text-sm font-bold"
                style={{ backgroundColor: colors.PRIMARY, color: colors.TEXT_INVERSE }}
              >
                {t('forms.dailyInfo.pannesModalDone')}
              </button>
            </>
          )}
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
  pannesAutre,
  onPannesAutreChange,
  pannes,
  onPannesChange,
  onClearPannes,
}: PannesSectionProps) {
  const { colors } = useThemeColors();
  const { t } = useTranslation();
  const { data: sujets } = useSujets(siteId);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalStep, setModalStep] = useState<ModalStep>('confirm');

  const hasPannes =
    selectedSujetIds.length > 0 || pannesAutre.trim().length > 0 || pannes.trim().length > 0;

  const summaryParts: string[] = [];
  if (selectedSujetIds.length > 0) {
    const names = (sujets ?? [])
      .filter((s) => selectedSujetIds.includes(s.id))
      .map((s) => s.name);
    if (names.length > 0) {
      summaryParts.push(names.join(', '));
    } else {
      summaryParts.push(
        t('forms.dailyInfo.pannesSummaryCount').replace('{{count}}', String(selectedSujetIds.length)),
      );
    }
  }
  if (pannesAutre.trim().length > 0) {
    summaryParts.push(pannesAutre.trim());
  }
  if (pannes.trim().length > 0) {
    summaryParts.push(t('forms.dailyInfo.pannesSummaryDetail'));
  }

  function openModal() {
    setModalStep('confirm');
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setModalStep('confirm');
  }

  const modalTitle =
    modalStep === 'confirm'
      ? t('forms.dailyInfo.pannesSujetsTitle')
      : t('forms.dailyInfo.pannesModalSelectionTitle');

  return (
    <>
      <div className="space-y-2">
        <label className="text-sm font-semibold" style={{ color: colors.TEXT_PRIMARY }}>
          {t('forms.dailyInfo.pannesSujetsTitle')}
        </label>
        {hasPannes ? (
          <p className="text-xs leading-relaxed" style={{ color: colors.TEXT_SECONDARY }}>
            {summaryParts.join(' · ')}
          </p>
        ) : (
          <p className="text-xs" style={{ color: colors.TEXT_SECONDARY }}>
            {t('forms.dailyInfo.pannesNone')}
          </p>
        )}
        <button
          type="button"
          onClick={openModal}
          className="w-full py-2.5 rounded-lg border text-sm font-semibold"
          style={{
            borderColor: hasPannes ? colors.PRIMARY : colors.BORDER,
            backgroundColor: hasPannes ? colors.PRIMARY + '15' : colors.BG_SECONDARY,
            color: hasPannes ? colors.PRIMARY : colors.TEXT_PRIMARY,
          }}
        >
          {hasPannes ? t('common.edit') : t('forms.dailyInfo.pannesReportButton')}
        </button>
      </div>

      <PannesModal
        isOpen={modalOpen}
        step={modalStep}
        onClose={closeModal}
        onStepChange={setModalStep}
        onClearPannes={onClearPannes}
        colors={colors}
        title={modalTitle}
      >
        <PannesSelectionContent
          siteId={siteId}
          selectedSujetIds={selectedSujetIds}
          onToggleSujet={onToggleSujet}
          pannesAutre={pannesAutre}
          onPannesAutreChange={onPannesAutreChange}
          pannes={pannes}
          onPannesChange={onPannesChange}
        />
      </PannesModal>
    </>
  );
}
