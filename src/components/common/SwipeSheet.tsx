'use client';

import {
  useCallback,
  useRef,
  useState,
  type ReactNode,
  type TouchEvent,
} from 'react';
import { X } from 'lucide-react';
import { RADIUS } from '../../constants/design';
import type { ThemeColors } from '../../types/theme.types';

const CLOSE_DISTANCE = 110;
const CLOSE_VELOCITY = 0.55;

type SwipeSheetProps = {
  colors: ThemeColors;
  onClose: () => void;
  /** Hauteur max, ex. 92dvh / 85dvh */
  maxHeight?: string;
  /** Plein écran sous le grabber (ticket) vs sheet court */
  fullHeight?: boolean;
  children: ReactNode;
  /** Contenu sticky sous le grabber (titre) */
  header?: ReactNode;
  showCloseButton?: boolean;
};

/**
 * Bottom sheet mobile : grabber + swipe bas pour fermer + tap backdrop.
 * Le drag ne démarre que si le contenu interne est scrollé en haut.
 */
export function SwipeSheet({
  colors,
  onClose,
  maxHeight = '92dvh',
  fullHeight = false,
  children,
  header,
  showCloseButton = true,
}: SwipeSheetProps) {
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startY = useRef(0);
  const lastY = useRef(0);
  const lastT = useRef(0);
  const velocity = useRef(0);
  const sheetRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const finishClose = useCallback(() => {
    setDragY(typeof window !== 'undefined' ? window.innerHeight : 600);
    window.setTimeout(onClose, 180);
  }, [onClose]);

  const tracking = useRef(false);

  const onTouchStart = (e: TouchEvent) => {
    const scrollEl = scrollRef.current;
    if (scrollEl && scrollEl.scrollTop > 2) {
      tracking.current = false;
      return;
    }
    const y = e.touches[0]?.clientY ?? 0;
    startY.current = y;
    lastY.current = y;
    lastT.current = Date.now();
    velocity.current = 0;
    tracking.current = true;
  };

  const onTouchMove = (e: TouchEvent) => {
    if (!tracking.current) return;
    const y = e.touches[0]?.clientY ?? 0;
    const raw = y - startY.current;
    if (!dragging) {
      if (raw < 8) return;
      setDragging(true);
    }
    const dy = Math.max(0, raw);
    const now = Date.now();
    const dt = Math.max(1, now - lastT.current);
    velocity.current = (y - lastY.current) / dt;
    lastY.current = y;
    lastT.current = now;
    setDragY(dy);
  };

  const onTouchEnd = () => {
    if (!tracking.current) return;
    tracking.current = false;
    if (!dragging) return;
    setDragging(false);
    if (dragY > CLOSE_DISTANCE || velocity.current > CLOSE_VELOCITY) {
      finishClose();
      return;
    }
    setDragY(0);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <button
        type="button"
        aria-label="Fermer"
        className="absolute inset-0"
        style={{
          background: `rgba(0,0,0,${0.45 * Math.max(0, 1 - dragY / 400)})`,
          transition: dragging ? 'none' : 'background 0.2s ease',
        }}
        onClick={finishClose}
      />
      <div
        ref={sheetRef}
        className="relative mx-auto flex w-full max-w-md flex-col overflow-hidden"
        style={{
          maxHeight,
          height: fullHeight ? maxHeight : undefined,
          background: colors.BG_SECONDARY,
          borderTopLeftRadius: RADIUS.xl,
          borderTopRightRadius: RADIUS.xl,
          transform: `translateY(${dragY}px)`,
          transition: dragging ? 'none' : 'transform 0.22s ease',
          paddingBottom: 'env(safe-area-inset-bottom)',
          boxShadow: '0 -8px 32px rgba(44, 40, 37, 0.12)',
        }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
      >
        <div className="relative shrink-0 px-4 pb-1 pt-3">
          <div
            className="mx-auto h-1 w-10 rounded-full"
            style={{ background: colors.BORDER }}
          />
          {showCloseButton ? (
            <button
              type="button"
              aria-label="Fermer"
              onClick={finishClose}
              className="absolute right-3 top-2.5 flex h-9 w-9 items-center justify-center rounded-full"
              style={{ background: colors.BG_TERTIARY }}
            >
              <X size={16} color={colors.TEXT_SECONDARY} />
            </button>
          ) : null}
        </div>
        {header ? <div className="shrink-0">{header}</div> : null}
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {children}
        </div>
      </div>
    </div>
  );
}
