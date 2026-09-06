'use client';

import { useEffect, useRef, useState } from 'react';
import { Header } from './Header';
import { useThemeColors } from '../../hooks/useThemeColors';

interface FormScrollLayoutProps {
  children: React.ReactNode;
  footer?: React.ReactNode;
}

/**
 * Layout des pages intérieures : scroll natif.
 * Rend le Header logo (il défile) ; le PageHeader se fixe ensuite.
 * AppShell ne rend pas de Header sur ces routes (voir pageChrome.ts).
 * Spacer footer = hauteur réelle (hint « il manque encore » + boutons).
 */
export function FormScrollLayout({ children, footer }: FormScrollLayoutProps) {
  const { colors } = useThemeColors();
  const footerRef = useRef<HTMLDivElement>(null);
  const [footerHeight, setFooterHeight] = useState(88);

  useEffect(() => {
    if (!footer || !footerRef.current) return;
    const el = footerRef.current;
    const update = () => {
      const h = el.getBoundingClientRect().height;
      if (h > 0) setFooterHeight(Math.ceil(h));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [footer]);

  return (
    <>
      <Header variant="static" />
      {children}
      {footer && (
        <div
          aria-hidden
          style={{ height: `calc(${footerHeight}px + env(safe-area-inset-bottom))` }}
        />
      )}
      {footer && (
        <div
          className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          <div
            ref={footerRef}
            className="pointer-events-auto w-full max-w-md border-t"
            style={{
              backgroundColor: colors.BG_SECONDARY,
              borderColor: colors.BORDER,
            }}
          >
            {footer}
          </div>
        </div>
      )}
    </>
  );
}
