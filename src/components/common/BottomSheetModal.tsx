'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { PrimaryButton } from './PrimaryButton';

export interface BottomSheetModalCloseApi {
  close: () => void;
}

interface BottomSheetModalProps {
  isOpen: boolean;
  onClose: () => void;
  colors: Record<string, string>;
  title: string;
  titleId: string;
  closeAriaLabel: string;
  doneLabel: string;
  children: React.ReactNode | ((api: BottomSheetModalCloseApi) => React.ReactNode);
}

export function BottomSheetModal({
  isOpen,
  onClose,
  colors,
  title,
  titleId,
  closeAriaLabel,
  doneLabel,
  children,
}: BottomSheetModalProps) {
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
      if (e.key === 'Escape') handleClose();
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

  const content = typeof children === 'function' ? children({ close: handleClose }) : children;

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
        aria-labelledby={titleId}
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
            id={titleId}
            className="pr-4 text-xl font-bold"
            style={{ color: colors.TEXT_PRIMARY, fontFamily: 'var(--font-display)' }}
          >
            {title}
          </h2>
          <button
            type="button"
            onClick={handleClose}
            aria-label={closeAriaLabel}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
            style={{ backgroundColor: colors.TEXT_SECONDARY + '15' }}
          >
            <X size={16} color={colors.TEXT_SECONDARY} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {content}
          <PrimaryButton onClick={handleClose} className="mt-4 w-full py-3.5 text-base">
            {doneLabel}
          </PrimaryButton>
        </div>
      </div>
    </div>,
    document.body,
  );
}
