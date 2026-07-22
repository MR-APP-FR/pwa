'use client';

import Link from 'next/link';
import { CalendarDays, ChevronRight, MapPin } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useThemeColors } from '../../hooks/useThemeColors';
import { useTranslation } from '../../hooks/useTranslation';
import { RADIUS } from '../../constants/design';
import type { PlanningWithColleague } from '../../database/types';
import type { ThemeColors } from '../../types/theme.types';

interface AssignmentBannerProps {
  todayMission: PlanningWithColleague | null;
  nextMission: PlanningWithColleague | null;
  nextDayLabel: string | null;
}

interface AssignmentCardProps {
  label: string;
  mission: PlanningWithColleague | null;
  accentColor: string;
  accentMuted: string;
  dateLabel?: string | null;
  emptyMessage: string;
  icon: LucideIcon;
  colors: ThemeColors;
}

/** Réduit text-xl → text-base si le titre passe sur 2+ lignes. */
function AssignmentTitle({
  color,
  children,
}: {
  color: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [compact, setCompact] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const measure = () => {
      // Toujours mesurer en taille « xl » pour éviter compact ↔ normal en boucle.
      const prev = el.style.fontSize;
      el.style.fontSize = '1.25rem';
      const lineHeight = parseFloat(getComputedStyle(el).lineHeight);
      const singleLine = Number.isFinite(lineHeight) && lineHeight > 0 ? lineHeight : 20;
      const wraps = el.scrollHeight > singleLine * 1.4;
      el.style.fontSize = prev;
      setCompact(wraps);
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [children]);

  return (
    <p
      ref={ref}
      className={`font-bold uppercase leading-tight tracking-tight ${compact ? 'text-base' : 'text-xl'}`}
      style={{ color, fontFamily: 'var(--font-display)' }}
    >
      {children}
    </p>
  );
}

function AssignmentCard({
  label,
  mission,
  accentColor,
  accentMuted,
  dateLabel,
  emptyMessage,
  icon: Icon,
  colors,
}: AssignmentCardProps) {
  return (
    <div
      className="overflow-hidden"
      style={{
        borderRadius: RADIUS.xl,
        boxShadow: colors.CARD_SHADOW,
        backgroundColor: colors.SETTINGS_SECTION_BG,
        border: `1px solid ${colors.BORDER}`,
      }}
    >
      <Link
        href={mission ? `/mission?id=${mission.id}` : '#'}
        className="group block no-underline transition-opacity active:opacity-80"
      >
        <div className="flex items-center gap-3 p-4">
          <div
            className="flex shrink-0 items-center justify-center"
            style={{
              width: 44,
              height: 44,
              borderRadius: RADIUS.sm,
              backgroundColor: accentMuted,
            }}
          >
            <Icon size={22} color={accentColor} strokeWidth={2.25} />
          </div>

          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <p
              className="text-sm font-bold uppercase tracking-wide"
              style={{ color: colors.TEXT_SECONDARY, fontFamily: 'var(--font-display)' }}
            >
              {label}
            </p>
            {mission ? (
              <AssignmentTitle color={accentColor}>
                {mission.site_name}
                {dateLabel && ` · ${dateLabel}`}
              </AssignmentTitle>
            ) : (
              <p className="text-base" style={{ color: colors.TEXT_SECONDARY }}>
                {emptyMessage}
              </p>
            )}
          </div>

          {mission && (
            <ChevronRight
              size={22}
              className="shrink-0 opacity-40"
              color={colors.TEXT_SECONDARY}
              strokeWidth={2.5}
            />
          )}
        </div>
      </Link>
    </div>
  );
}

export function AssignmentBanner({
  todayMission,
  nextMission,
  nextDayLabel,
}: AssignmentBannerProps) {
  const { colors } = useThemeColors();
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-2.5">
      <AssignmentCard
        label={t('screens.home.todayAssignment')}
        mission={todayMission}
        accentColor={colors.ACCENT_RED}
        accentMuted={colors.ACCENT_RED_MUTED}
        emptyMessage={t('screens.home.noAssignmentToday')}
        icon={MapPin}
        colors={colors}
      />
      <AssignmentCard
        label={t('screens.home.nextAssignment')}
        mission={nextMission}
        accentColor={colors.ACCENT_BLUE}
        accentMuted={colors.ACCENT_BLUE_MUTED}
        dateLabel={nextDayLabel}
        emptyMessage={t('screens.home.noNextAssignment')}
        icon={CalendarDays}
        colors={colors}
      />
    </div>
  );
}
