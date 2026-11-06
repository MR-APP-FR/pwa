'use client';

import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Phone, Search } from 'lucide-react';
import { useThemeColors } from '../../hooks/useThemeColors';
import { useAppDate } from '../../hooks/useAppDate';
import { useTechPlanningDirectory } from '../../hooks/api/useTechPlanningDirectory';
import { formatSiteName } from '../../lib/formatSiteName';
import { parseIsoDateAsLocalDate, toIsoDateString } from '../../lib/parisTime';
import { RADIUS, SHADOW } from '../../constants/design';
import type { TechPlanningDirectoryRow } from '../../database/types';
import type { ThemeColors } from '../../types/theme.types';

function addDaysIso(iso: string, days: number): string {
  const d = parseIsoDateAsLocalDate(iso);
  d.setDate(d.getDate() + days);
  return toIsoDateString(d);
}

function mondayOf(iso: string): string {
  const d = parseIsoDateAsLocalDate(iso);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return toIsoDateString(d);
}

function formatWeekRange(startIso: string, endIso: string): string {
  const start = parseIsoDateAsLocalDate(startIso);
  const end = parseIsoDateAsLocalDate(endIso);
  const sameMonth = start.getMonth() === end.getMonth();
  const startLabel = start.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: sameMonth ? undefined : 'short',
  });
  const endLabel = end.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  return `${startLabel} – ${endLabel}`;
}

function phoneHref(value: string | null | undefined): string | undefined {
  const raw = value?.trim();
  if (!raw) return undefined;
  const tel = raw.replace(/[^\d+]/g, '');
  return tel ? `tel:${tel}` : undefined;
}

/** Prénom (ou premier mot) pour un affichage terrain rapide. */
function shortName(displayName: string | null | undefined): string {
  const trimmed = displayName?.trim();
  if (!trimmed) return 'Sans nom';
  return trimmed.split(/\s+/)[0] ?? trimmed;
}

function roleLabel(role: TechPlanningDirectoryRow['staff_role']): string {
  if (role === 'double') return 'Double';
  if (role === 'teneur') return 'Teneur';
  return '';
}

type SiteBucket = {
  siteId: number;
  siteName: string;
  closed: boolean;
  staff: TechPlanningDirectoryRow[];
};

type ZoneBucket = {
  key: string;
  label: string;
  sites: SiteBucket[];
};

function groupDayRows(rows: TechPlanningDirectoryRow[]): ZoneBucket[] {
  const zones = new Map<string, { label: string; sites: Map<number, SiteBucket> }>();

  for (const row of rows) {
    const zoneKey = row.group_id != null ? String(row.group_id) : 'none';
    let zone = zones.get(zoneKey);
    if (!zone) {
      zone = { label: row.group_name || 'Sans zone', sites: new Map() };
      zones.set(zoneKey, zone);
    }

    let site = zone.sites.get(row.site_id);
    if (!site) {
      site = {
        siteId: row.site_id,
        siteName: row.site_name,
        closed: row.closed,
        staff: [],
      };
      zone.sites.set(row.site_id, site);
    }
    site.closed = site.closed || row.closed;
    if (row.user_id != null) site.staff.push(row);
  }

  return [...zones.entries()]
    .map(([key, zone]) => ({
      key,
      label: zone.label,
      sites: [...zone.sites.values()].sort((a, b) =>
        a.siteName.localeCompare(b.siteName, 'fr'),
      ),
    }))
    .sort((a, b) => {
      if (a.key === 'none') return 1;
      if (b.key === 'none') return -1;
      return a.label.localeCompare(b.label, 'fr');
    });
}

export function TechPlanningDirectoryBoard() {
  const { colors } = useThemeColors();
  const { today } = useAppDate();
  const todayIso = toIsoDateString(today);

  const [weekStart, setWeekStart] = useState(() => mondayOf(todayIso));
  const [selectedDay, setSelectedDay] = useState(todayIso);
  const [query, setQuery] = useState('');

  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDaysIso(weekStart, i)),
    [weekStart],
  );
  const weekEnd = weekDays[6];
  const weekTitle = formatWeekRange(weekDays[0], weekEnd);

  const { data: rows, isLoading, error } = useTechPlanningDirectory(weekStart, weekEnd);

  const dayRows = useMemo(
    () => (rows ?? []).filter((r) => r.day === selectedDay),
    [rows, selectedDay],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return dayRows;
    return dayRows.filter((r) => {
      const hay = [
        r.site_name,
        r.group_name,
        r.display_name ?? '',
        r.telephone ?? '',
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [dayRows, query]);

  const zones = useMemo(() => groupDayRows(filtered), [filtered]);
  const staffCount = useMemo(
    () => filtered.filter((r) => r.user_id != null).length,
    [filtered],
  );
  const siteCount = useMemo(() => {
    const ids = new Set(filtered.map((r) => r.site_id));
    return ids.size;
  }, [filtered]);

  const countsByDay = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of rows ?? []) {
      if (r.user_id == null) continue;
      map.set(r.day, (map.get(r.day) ?? 0) + 1);
    }
    return map;
  }, [rows]);

  const dayLabel = parseIsoDateAsLocalDate(selectedDay).toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
  });

  return (
    <div
      className="relative mx-auto flex min-h-0 w-full max-w-md flex-1 flex-col"
      style={{ background: colors.BG_SECONDARY }}
    >
      <div className="min-h-0 flex-1 overflow-y-auto pb-4">
        <div
          className="sticky top-0 z-20 space-y-3 px-3 pb-3 pt-2"
          style={{
            background: colors.HEADER_BG,
            borderBottom: `1px solid ${colors.BORDER}`,
          }}
        >
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="Semaine précédente"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
              style={{ background: colors.BG_PRIMARY, border: `1px solid ${colors.BORDER}` }}
              onClick={() => {
                const next = addDaysIso(weekStart, -7);
                setWeekStart(next);
                setSelectedDay(next);
              }}
            >
              <ChevronLeft size={20} color={colors.PRIMARY} />
            </button>
            <p
              className="min-w-0 flex-1 text-center text-[15px] font-semibold tracking-tight"
              style={{ color: colors.TEXT_PRIMARY, fontFamily: 'var(--font-display)' }}
            >
              {weekTitle}
            </p>
            <button
              type="button"
              aria-label="Semaine suivante"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
              style={{ background: colors.BG_PRIMARY, border: `1px solid ${colors.BORDER}` }}
              onClick={() => {
                const next = addDaysIso(weekStart, 7);
                setWeekStart(next);
                setSelectedDay(next);
              }}
            >
              <ChevronRight size={20} color={colors.PRIMARY} />
            </button>
          </div>

          <div
            className="grid grid-cols-7 gap-1 p-1.5"
            style={{
              background: colors.BG_PRIMARY,
              borderRadius: RADIUS.md,
              border: `1px solid ${colors.BORDER}`,
              boxShadow: SHADOW.card,
            }}
          >
            {weekDays.map((day) => {
              const count = countsByDay.get(day) ?? 0;
              const isSel = day === selectedDay;
              const isToday = day === todayIso;
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => setSelectedDay(day)}
                  className="relative flex flex-col items-center gap-0.5 py-2 text-[11px] transition-colors"
                  style={{
                    borderRadius: 12,
                    background: isSel
                      ? colors.SECONDARY
                      : isToday
                        ? colors.SECONDARY_MUTED
                        : 'transparent',
                    color: isSel ? colors.TEXT_INVERSE : colors.TEXT_PRIMARY,
                  }}
                >
                  <span
                    className="font-medium"
                    style={{ color: isSel ? 'rgba(255,255,255,0.75)' : colors.TEXT_MUTED }}
                  >
                    {parseIsoDateAsLocalDate(day).toLocaleDateString('fr-FR', {
                      weekday: 'narrow',
                    })}
                  </span>
                  <span className="text-sm font-semibold leading-none">
                    {Number(day.slice(8))}
                  </span>
                  <span
                    className="mt-0.5 h-1.5 w-1.5 rounded-full"
                    style={{
                      background:
                        count > 0
                          ? isSel
                            ? colors.TEXT_INVERSE
                            : colors.SECONDARY
                          : 'transparent',
                    }}
                  />
                </button>
              );
            })}
          </div>

          <label
            className="flex items-center gap-2 px-3 py-2.5"
            style={{
              background: colors.BG_PRIMARY,
              borderRadius: RADIUS.md,
              border: `1px solid ${colors.BORDER}`,
            }}
          >
            <Search size={16} color={colors.TEXT_MUTED} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Site, prénom, téléphone…"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none"
              style={{ color: colors.TEXT_PRIMARY }}
            />
          </label>
        </div>

        <div className="space-y-3 px-3 pt-3">
          <div className="flex items-end justify-between gap-2 px-0.5">
            <p
              className="text-[13px] font-semibold capitalize"
              style={{ color: colors.TEXT_SECONDARY }}
            >
              {dayLabel}
            </p>
            {!isLoading && !error ? (
              <p className="text-[11px] font-semibold" style={{ color: colors.TEXT_MUTED }}>
                {siteCount} site{siteCount > 1 ? 's' : ''} · {staffCount} teneur
                {staffCount > 1 ? 's' : ''}
              </p>
            ) : null}
          </div>

          {error ? (
            <p className="text-sm" style={{ color: colors.DANGER }}>
              {String(error.message || error)}
            </p>
          ) : null}

          {isLoading ? (
            <p className="py-10 text-center text-sm" style={{ color: colors.TEXT_MUTED }}>
              Chargement du parc…
            </p>
          ) : zones.length === 0 ? (
            <div
              className="px-4 py-10 text-center"
              style={{
                background: colors.BG_PRIMARY,
                borderRadius: RADIUS.md,
                border: `1px dashed ${colors.BORDER}`,
              }}
            >
              <p className="text-sm" style={{ color: colors.TEXT_MUTED }}>
                {query.trim()
                  ? 'Aucun résultat pour cette recherche.'
                  : 'Rien de planifié ce jour.'}
              </p>
            </div>
          ) : (
            zones.map((zone) => (
              <section key={zone.key} className="space-y-2">
                <div className="flex items-center justify-between gap-2 px-0.5">
                  <p
                    className="text-xs font-semibold uppercase tracking-wide"
                    style={{ color: colors.SECONDARY }}
                  >
                    {zone.label}
                  </p>
                  <span
                    className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                    style={{
                      background: colors.SECONDARY_MUTED,
                      color: colors.SECONDARY,
                    }}
                  >
                    {zone.sites.length}
                  </span>
                </div>
                <div className="space-y-2">
                  {zone.sites.map((site) => (
                    <SiteCard key={site.siteId} site={site} colors={colors} />
                  ))}
                </div>
              </section>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function SiteCard({
  site,
  colors,
}: {
  site: SiteBucket;
  colors: ThemeColors;
}) {
  return (
    <div
      className="overflow-hidden"
      style={{
        borderRadius: RADIUS.md,
        background: colors.BG_PRIMARY,
        border: `1px solid ${colors.BORDER}`,
        boxShadow: SHADOW.card,
      }}
    >
      <div
        className="flex items-center justify-between gap-2 px-3 py-2.5"
        style={{ borderBottom: `1px solid ${colors.BORDER}` }}
      >
        <p
          className="min-w-0 truncate text-sm font-semibold"
          style={{ color: colors.TEXT_PRIMARY, fontFamily: 'var(--font-display)' }}
        >
          {formatSiteName(site.siteName)}
        </p>
        {site.closed ? (
          <span
            className="shrink-0 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase"
            style={{ background: colors.BG_TERTIARY, color: colors.TEXT_MUTED }}
          >
            Fermé
          </span>
        ) : null}
      </div>

      {site.closed && site.staff.length === 0 ? (
        <p className="px-3 py-3 text-sm" style={{ color: colors.TEXT_MUTED }}>
          Site fermé ce jour.
        </p>
      ) : (
        <ul className="divide-y" style={{ borderColor: colors.BORDER }}>
          {site.staff.map((person) => (
            <StaffRow key={`${person.user_id}-${person.staff_role}`} person={person} colors={colors} />
          ))}
        </ul>
      )}
    </div>
  );
}

function StaffRow({
  person,
  colors,
}: {
  person: TechPlanningDirectoryRow;
  colors: ThemeColors;
}) {
  const href = phoneHref(person.telephone);
  const chip = person.couleur?.trim() || colors.PRIMARY;
  const name = shortName(person.display_name);

  return (
    <li className="flex items-center gap-3 px-3 py-2.5">
      <span
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold"
        style={{
          background: `${chip}22`,
          color: chip,
          border: `2px solid ${chip}`,
        }}
        aria-hidden
      >
        {name.slice(0, 1).toUpperCase()}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold" style={{ color: colors.TEXT_PRIMARY }}>
          {name}
        </p>
        <p className="text-[11px] font-medium" style={{ color: colors.TEXT_MUTED }}>
          {roleLabel(person.staff_role)}
          {person.telephone ? ` · ${person.telephone}` : ' · pas de tél.'}
        </p>
      </div>
      {href ? (
        <a
          href={href}
          aria-label={`Appeler ${name}`}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl active:scale-95"
          style={{
            background: colors.ACCENT_GREEN_MUTED,
            color: colors.ACCENT_GREEN,
            boxShadow: SHADOW.card,
          }}
        >
          <Phone size={18} strokeWidth={2.35} />
        </a>
      ) : (
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
          style={{ background: colors.BG_TERTIARY, color: colors.TEXT_MUTED }}
          aria-hidden
        >
          <Phone size={18} strokeWidth={2} />
        </span>
      )}
    </li>
  );
}
