'use client';

import { useThemeColors } from '../../hooks/useThemeColors';

interface PageSectionTitleProps {
  title: string;
  detail?: string;
}

/** Titre de sous-page : site, date, semaine… toujours sous le header, même typo. */
export function PageSectionTitle({ title, detail }: PageSectionTitleProps) {
  const { colors } = useThemeColors();

  return (
    <div className="flex min-w-0 flex-col items-center gap-0.5 px-4 pb-1 pt-4 text-center">
      <p
        className="min-w-0 break-words text-[18px] font-bold uppercase leading-tight"
        style={{ color: colors.PRIMARY, fontFamily: 'var(--font-display)' }}
      >
        {title}
      </p>
      {detail && (
        <p
          className="min-w-0 break-words text-[15px] font-bold uppercase leading-tight"
          style={{ color: colors.PRIMARY, fontFamily: 'var(--font-display)' }}
        >
          {detail}
        </p>
      )}
    </div>
  );
}
