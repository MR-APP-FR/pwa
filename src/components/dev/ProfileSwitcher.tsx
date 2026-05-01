'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, UserCircle2, Search, Check } from 'lucide-react';
import { useThemeColors } from '../../hooks/useThemeColors';
import { useProfileStore } from '../../stores/profileStore';
import { useEmployees, type EmployeeOption } from '../../hooks/api/useEmployees';

/**
 * Profile switcher dev mode — GRE-87.
 *
 * Bouton dans le header qui ouvre une popover listant les employés actifs.
 * Sélection persistée dans `useProfileStore` (localStorage). Pas d'auth.
 * À supprimer quand GRE-88 / GRE-90 (auth réelle) seront livrés.
 */
export function ProfileSwitcher() {
  const { colors } = useThemeColors();
  const { data: employees, isLoading, isError } = useEmployees();
  const selectedUserId = useProfileStore((s) => s.selectedUserId);
  const setSelectedUserId = useProfileStore((s) => s.setSelectedUserId);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!employees || employees.length === 0) return;
    if (selectedUserId !== null && employees.some((e) => e.id === selectedUserId)) {
      return;
    }
    setSelectedUserId(employees[0].id);
  }, [employees, selectedUserId, setSelectedUserId]);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const selectedEmployee = useMemo(
    () => employees?.find((e) => e.id === selectedUserId) ?? null,
    [employees, selectedUserId],
  );

  const filtered = useMemo(() => {
    if (!employees) return [];
    const q = query.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter(
      (e) =>
        (e.fullname ?? '').toLowerCase().includes(q) ||
        e.login.toLowerCase().includes(q) ||
        e.email.toLowerCase().includes(q),
    );
  }, [employees, query]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-full px-2 py-1 text-sm transition-colors"
        style={{
          color: colors.HEADER_TEXT,
          backgroundColor: open ? colors.BG_TERTIARY : 'transparent',
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Changer de profil de démo"
      >
        <UserCircle2 size={20} aria-hidden />
        <span className="hidden max-w-[140px] truncate sm:inline">
          {selectedEmployee?.fullname ?? selectedEmployee?.login ?? 'Profil…'}
        </span>
        <ChevronDown size={14} aria-hidden />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute right-0 top-full z-50 mt-2 w-72 rounded-xl border shadow-lg"
          style={{
            backgroundColor: colors.SETTINGS_SECTION_BG,
            borderColor: colors.BORDER,
            color: colors.TEXT_PRIMARY,
          }}
        >
          <div
            className="px-3 py-2 text-xs font-semibold uppercase tracking-wide"
            style={{ color: colors.TEXT_SECONDARY, borderBottom: `1px solid ${colors.SETTINGS_SEPARATOR}` }}
          >
            Mode démo · profil
          </div>

          <div
            className="flex items-center gap-2 px-3 py-2"
            style={{ borderBottom: `1px solid ${colors.SETTINGS_SEPARATOR}` }}
          >
            <Search size={14} style={{ color: colors.TEXT_SECONDARY }} aria-hidden />
            <input
              type="search"
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher un employé…"
              className="w-full bg-transparent text-sm outline-none"
              style={{ color: colors.TEXT_PRIMARY }}
            />
          </div>

          <div className="max-h-72 overflow-y-auto py-1">
            {isLoading && (
              <div className="px-3 py-3 text-sm" style={{ color: colors.TEXT_SECONDARY }}>
                Chargement…
              </div>
            )}
            {isError && (
              <div className="px-3 py-3 text-sm" style={{ color: colors.DANGER_STRONG }}>
                Erreur de chargement (vérifier <code>NEXT_PUBLIC_SUPABASE_*</code>).
              </div>
            )}
            {!isLoading && !isError && filtered.length === 0 && (
              <div className="px-3 py-3 text-sm" style={{ color: colors.TEXT_SECONDARY }}>
                Aucun employé trouvé.
              </div>
            )}
            {filtered.map((emp) => (
              <EmployeeRow
                key={emp.id}
                employee={emp}
                selected={emp.id === selectedUserId}
                onSelect={() => {
                  setSelectedUserId(emp.id);
                  setOpen(false);
                  setQuery('');
                }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function EmployeeRow({
  employee,
  selected,
  onSelect,
}: {
  employee: EmployeeOption;
  selected: boolean;
  onSelect: () => void;
}) {
  const { colors } = useThemeColors();
  return (
    <button
      type="button"
      onClick={onSelect}
      role="option"
      aria-selected={selected}
      className="flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors hover:opacity-80"
      style={{
        backgroundColor: selected ? colors.BG_TERTIARY : 'transparent',
        color: colors.TEXT_PRIMARY,
      }}
    >
      <div className="flex min-w-0 flex-col">
        <span className="truncate font-medium">{employee.fullname ?? employee.login}</span>
        <span className="truncate text-xs" style={{ color: colors.TEXT_SECONDARY }}>
          #{employee.id} · {employee.email}
        </span>
      </div>
      {selected && <Check size={14} aria-hidden style={{ color: colors.SUCCESS_STRONG }} />}
    </button>
  );
}
