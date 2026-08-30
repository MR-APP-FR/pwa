'use client';

import Link from 'next/link';
import {
  Bell,
  CalendarClock,
  CalendarDays,
  ChevronRight,
  IdCard,
  MessageCircle,
  UserRound,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useThemeColors } from '../../hooks/useThemeColors';
import { useTranslation } from '../../hooks/useTranslation';
import { RADIUS } from '../../constants/design';
import { LOGO } from '../../constants/colors';
import type { HomeAssistantTodo, HomeAssistantTodoId } from '../../hooks/useHomeAssistantTodos';

const TODO_ICON: Record<HomeAssistantTodoId, LucideIcon> = {
  photo: UserRound,
  cni: IdCard,
  push: Bell,
  messages: MessageCircle,
  planning: CalendarDays,
  availability: CalendarClock,
};

const TODO_TINT: Record<HomeAssistantTodoId, { bg: string; fg: string }> = {
  photo: { bg: LOGO.orangeMuted, fg: LOGO.orange },
  cni: { bg: LOGO.blueMuted, fg: LOGO.blue },
  push: { bg: LOGO.purpleMuted, fg: LOGO.purple },
  messages: { bg: LOGO.purpleMuted, fg: LOGO.purple },
  planning: { bg: LOGO.skyMuted, fg: LOGO.sky },
  availability: { bg: LOGO.yellowMuted, fg: LOGO.yellow },
};

function SleepingRobot() {
  return (
    <div className="home-assistant-orb relative flex h-14 w-14 shrink-0 items-center justify-center">
      <span className="home-assistant-zzz" aria-hidden>
        zzz
      </span>
      <svg viewBox="0 0 64 64" className="h-11 w-11" aria-hidden>
        <rect x="10" y="16" width="44" height="36" rx="14" fill={LOGO.blue} />
        <rect x="16" y="22" width="32" height="20" rx="10" fill="#E8F1FA" />
        <path
          d="M24 32c1.4 1.6 3.4 2.4 8 2.4s6.6-.8 8-2.4"
          fill="none"
          stroke={LOGO.blue}
          strokeWidth="2.4"
          strokeLinecap="round"
        />
        <circle cx="22" cy="14" r="4" fill={LOGO.sky} />
        <circle cx="42" cy="14" r="4" fill={LOGO.sky} />
        <rect x="26" y="48" width="12" height="5" rx="2.5" fill={LOGO.orange} />
      </svg>
    </div>
  );
}

function AwakeRobot() {
  return (
    <div className="home-assistant-awake-halo relative flex h-11 w-11 shrink-0 items-center justify-center">
      <svg viewBox="0 0 64 64" className="home-assistant-awake h-10 w-10" aria-hidden>
        <rect x="10" y="16" width="44" height="36" rx="14" fill={LOGO.blue} />
        <rect x="16" y="22" width="32" height="20" rx="10" fill="#E8F1FA" />
        <circle cx="26" cy="32" r="3.2" fill={LOGO.blue} />
        <circle cx="38" cy="32" r="3.2" fill={LOGO.blue} />
        <circle cx="22" cy="14" r="4" fill={LOGO.orange} />
        <circle cx="42" cy="14" r="4" fill={LOGO.orange} />
        <path
          d="M28 44c2.2 2 5.8 2 8 0"
          fill="none"
          stroke={LOGO.orange}
          strokeWidth="2.4"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}

interface HomeAssistantCardProps {
  todos: HomeAssistantTodo[];
}

export function HomeAssistantCard({ todos }: HomeAssistantCardProps) {
  const { colors } = useThemeColors();
  const { t } = useTranslation();
  const idle = todos.length === 0;

  return (
    <section
      className="w-full overflow-hidden"
      style={{
        backgroundColor: colors.SETTINGS_SECTION_BG,
        borderRadius: RADIUS.md,
        boxShadow: colors.CARD_SHADOW,
        border: `1px solid ${colors.BORDER}`,
      }}
      aria-label={
        idle
          ? t('screens.home.assistantAriaIdle')
          : t('screens.home.assistantAriaBusy', { count: String(todos.length) })
      }
    >
      {idle ? (
        <div className="flex items-center gap-3.5 px-4 py-3.5">
          <SleepingRobot />
          <div className="min-w-0">
            <p
              className="text-[15px] font-semibold leading-tight"
              style={{ color: colors.TEXT_PRIMARY, fontFamily: 'var(--font-display)' }}
            >
              {t('screens.home.assistantIdleTitle')}
            </p>
            <p className="mt-0.5 text-[13px] leading-snug" style={{ color: colors.TEXT_SECONDARY }}>
              {t('screens.home.assistantIdleSubtitle')}
            </p>
          </div>
        </div>
      ) : (
        <div>
          <div
            className="flex items-center gap-3 px-4 py-3"
            style={{ borderBottom: `1px solid ${colors.SETTINGS_SEPARATOR}` }}
          >
            <AwakeRobot />
            <div className="min-w-0 flex-1">
              <p
                className="text-[15px] font-semibold leading-tight"
                style={{ color: colors.TEXT_PRIMARY, fontFamily: 'var(--font-display)' }}
              >
                {t('screens.home.assistantBusyTitle')}
              </p>
              <p className="mt-0.5 text-[12px]" style={{ color: colors.TEXT_SECONDARY }}>
                {t('screens.home.assistantBusySubtitle', { count: String(todos.length) })}
              </p>
            </div>
            <span
              className="flex h-7 min-w-7 items-center justify-center px-1.5 text-[13px] font-bold"
              style={{
                borderRadius: 9999,
                backgroundColor: colors.DANGER,
                color: colors.TEXT_INVERSE,
              }}
            >
              {todos.length > 9 ? '9+' : todos.length}
            </span>
          </div>

          <ul className="flex flex-col">
            {todos.map((todo, index) => {
              const Icon = TODO_ICON[todo.id];
              const tint = TODO_TINT[todo.id];
              return (
                <li key={todo.id}>
                  <Link
                    href={todo.href}
                    className="flex min-h-13 items-center gap-3 px-4 py-2.5 no-underline transition-colors active:opacity-80"
                    style={{
                      borderTop: index === 0 ? undefined : `1px solid ${colors.SETTINGS_SEPARATOR}`,
                    }}
                  >
                    <span
                      className="flex h-9 w-9 shrink-0 items-center justify-center"
                      style={{ borderRadius: RADIUS.sm, backgroundColor: tint.bg }}
                    >
                      <Icon size={18} color={tint.fg} strokeWidth={2.2} />
                    </span>
                    <span
                      className="min-w-0 flex-1 text-[14px] font-medium leading-snug"
                      style={{ color: colors.TEXT_PRIMARY }}
                    >
                      {t(todo.titleKey, todo.titleParams)}
                    </span>
                    <ChevronRight size={18} color={colors.TEXT_MUTED} strokeWidth={2} />
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
