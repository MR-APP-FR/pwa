'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

interface FormPinnedPageHeaderProps {
  children: ReactNode;
}

/**
 * Ancre le PageHeader en haut de l'écran une fois le header logo défilé.
 * Plus fiable que `position: sticky` quand html/body ont overflow-x: hidden.
 */
export function FormPinnedPageHeader({ children }: FormPinnedPageHeaderProps) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const [pinned, setPinned] = useState(false);
  const [headerHeight, setHeaderHeight] = useState(0);

  const measureHeader = useCallback(() => {
    if (headerRef.current) {
      setHeaderHeight(headerRef.current.offsetHeight);
    }
  }, []);

  useEffect(() => {
    measureHeader();
    window.addEventListener('resize', measureHeader);
    return () => window.removeEventListener('resize', measureHeader);
  }, [measureHeader, children]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      ([entry]) => setPinned(!entry.isIntersecting),
      { root: null, threshold: 0 },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <div ref={sentinelRef} aria-hidden className="h-0 w-full" />
      {pinned && headerHeight > 0 && (
        <div aria-hidden style={{ height: headerHeight }} />
      )}
      <div
        ref={headerRef}
        style={
          pinned
            ? {
                position: 'fixed',
                top: 'env(safe-area-inset-top)',
                left: '50%',
                transform: 'translateX(-50%)',
                width: '100%',
                maxWidth: '28rem',
                zIndex: 50,
              }
            : undefined
        }
      >
        {children}
      </div>
    </>
  );
}
