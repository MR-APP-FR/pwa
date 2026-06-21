'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { User, X, Search, MapPin, Check, ChevronDown } from 'lucide-react';
import { useThemeColors } from '../../hooks/useThemeColors';
import { useTranslation } from '../../hooks/useTranslation';
import { useCurrentUser } from '../../hooks/api/useCurrentUser';
import { useSites } from '../../hooks/api/useSites';
import { useEmployees } from '../../hooks/api/useEmployees';
import { useProfileStore } from '../../stores/profileStore';
import { useDemoStore } from '../../stores/demoStore';
import { formatDateLong } from '../../lib/formatDate';
import { PageHeader } from '../../components/layout/PageHeader';
import { PrimaryButton } from '../../components/common/PrimaryButton';

function EditSitesModal({
  isOpen,
  onClose,
  colors,
  initialSelectedIds,
}: {
  isOpen: boolean;
  onClose: () => void;
  colors: Record<string, string>;
  initialSelectedIds: number[];
}) {
  const { data: sitesData } = useSites();
  const allSites = sitesData?.sites ?? [];
  const groupes = sitesData?.groupes ?? [];
  const [selectedIds, setSelectedIds] = useState<number[]>(initialSelectedIds);
  const [searchQuery, setSearchQuery] = useState('');
  const [isVisible, setIsVisible] = useState(false);
  const backdropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      setSelectedIds(initialSelectedIds);
      setSearchQuery('');
      requestAnimationFrame(() => setIsVisible(true));
    } else {
      setIsVisible(false);
    }
  }, [isOpen, initialSelectedIds]);

  const handleClose = () => {
    setIsVisible(false);
    setTimeout(onClose, 200);
  };

  const toggleSite = (siteId: number) => {
    setSelectedIds((prev) =>
      prev.includes(siteId) ? prev.filter((id) => id !== siteId) : [...prev, siteId],
    );
  };

  const query = searchQuery.toLowerCase().trim();
  const filteredGroupes = groupes
    .map((groupe) => {
      const groupSites = allSites.filter((s) => {
        if (s.group_id !== groupe.id) return false;
        if (!query) return true;
        return (
          s.name.toLowerCase().includes(query) ||
          (s.ville && s.ville.toLowerCase().includes(query)) ||
          (s.cp_ville && s.cp_ville.toLowerCase().includes(query))
        );
      });
      return { groupe, sites: groupSites };
    })
    .filter((g) => g.sites.length > 0);

  const selectedCount = selectedIds.length;

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
        className="w-full max-w-md rounded-2xl overflow-hidden flex flex-col"
        style={{
          backgroundColor: colors.BG_PRIMARY,
          maxHeight: '80vh',
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
          <div>
            <h2 className="text-xl font-bold" style={{ color: colors.TEXT_PRIMARY }}>
              Modifier mes sites
            </h2>
            <p className="text-xs mt-1" style={{ color: colors.TEXT_SECONDARY }}>
              {selectedCount} site{selectedCount > 1 ? 's' : ''} sélectionné{selectedCount > 1 ? 's' : ''}
            </p>
          </div>
          <button
            onClick={handleClose}
            className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{ backgroundColor: colors.TEXT_SECONDARY + '15' }}
          >
            <X size={16} color={colors.TEXT_SECONDARY} />
          </button>
        </div>
        <div className="px-5 py-2">
          <div
            className="flex items-center rounded-xl px-3 h-10 border"
            style={{
              backgroundColor: colors.TEXT_SECONDARY + '08',
              borderColor: colors.TEXT_SECONDARY + '15',
            }}
          >
            <Search size={16} color={colors.TEXT_SECONDARY} className="mr-2 flex-shrink-0" />
            <input
              type="text"
              placeholder="Rechercher un site..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 bg-transparent text-sm outline-none"
              style={{ color: colors.TEXT_PRIMARY }}
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="ml-2">
                <X size={14} color={colors.TEXT_SECONDARY} />
              </button>
            )}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-5 pb-3" style={{ minHeight: 0 }}>
          {filteredGroupes.length === 0 ? (
            <div className="flex flex-col items-center py-10 gap-3">
              <MapPin size={36} color={colors.TEXT_SECONDARY + '40'} />
              <p className="text-sm" style={{ color: colors.TEXT_SECONDARY }}>Aucun site trouvé</p>
            </div>
          ) : (
            filteredGroupes.map(({ groupe, sites }, idx) => (
              <div key={groupe.id} className={idx > 0 ? 'mt-4' : 'mt-1'}>
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: colors.PRIMARY }} />
                  <span
                    className="text-[10px] font-semibold uppercase tracking-wider"
                    style={{ color: colors.TEXT_SECONDARY }}
                  >
                    {groupe.name}
                  </span>
                  <div className="flex-1 h-px" style={{ backgroundColor: colors.TEXT_SECONDARY + '12' }} />
                </div>
                {sites.map((site) => {
                  const isSelected = selectedIds.includes(site.id);
                  return (
                    <button
                      key={site.id}
                      onClick={() => toggleSite(site.id)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg mb-1 text-left transition-colors duration-150"
                      style={{
                        backgroundColor: isSelected ? colors.SUCCESS_STRONG + '0D' : 'transparent',
                        border: `1px solid ${
                          isSelected ? colors.SUCCESS_STRONG + '40' : colors.TEXT_SECONDARY + '10'
                        }`,
                      }}
                    >
                      <div
                        className="w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 transition-colors duration-150"
                        style={{
                          backgroundColor: isSelected ? colors.SUCCESS_STRONG : 'transparent',
                          border: `1.5px solid ${
                            isSelected ? colors.SUCCESS_STRONG : colors.TEXT_SECONDARY + '35'
                          }`,
                        }}
                      >
                        {isSelected && <Check size={13} color="#fff" strokeWidth={3} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate" style={{ color: colors.TEXT_PRIMARY }}>
                          {site.name}
                        </p>
                        {(site.ville || site.cp_ville) && (
                          <p className="text-[11px] truncate" style={{ color: colors.TEXT_SECONDARY }}>
                            {site.ville ?? site.cp_ville}
                          </p>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
        <div
          className="flex gap-3 px-5 py-4 border-t"
          style={{ borderColor: colors.TEXT_SECONDARY + '12' }}
        >
          <button
            onClick={handleClose}
            className="flex-1 py-2.5 rounded-xl text-sm font-medium border transition-colors duration-150"
            style={{ borderColor: colors.TEXT_SECONDARY + '20', color: colors.TEXT_SECONDARY }}
          >
            Annuler
          </button>
          <PrimaryButton
            onClick={handleClose}
            className="flex flex-[1.5] items-center justify-center gap-1.5 py-2.5 text-sm"
          >
            <Check size={16} />
            Sauvegarder
          </PrimaryButton>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function EmployeePickerModal({
  isOpen,
  onClose,
  colors,
  employees,
  isLoading,
  selectedUserId,
  onSelect,
}: {
  isOpen: boolean;
  onClose: () => void;
  colors: Record<string, string>;
  employees: ReturnType<typeof useEmployees>['data'];
  isLoading: boolean;
  selectedUserId: number | null;
  onSelect: (id: number) => void;
}) {
  const [query, setQuery] = useState('');
  const [isVisible, setIsVisible] = useState(false);
  const backdropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      requestAnimationFrame(() => setIsVisible(true));
    } else {
      setIsVisible(false);
    }
  }, [isOpen]);

  const handleClose = () => {
    setIsVisible(false);
    setTimeout(onClose, 200);
  };

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

  if (!isOpen) return null;

  return createPortal(
    <div
      ref={backdropRef}
      onClick={(e) => {
        if (e.target === backdropRef.current) handleClose();
      }}
      className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center px-0 sm:px-4"
      style={{
        backgroundColor: isVisible ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0)',
        transition: 'background-color 0.2s ease',
      }}
    >
      <div
        className="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl overflow-hidden flex flex-col"
        style={{
          backgroundColor: colors.BG_PRIMARY,
          maxHeight: '85vh',
          boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
          transform: isVisible ? 'translateY(0)' : 'translateY(100%)',
          opacity: isVisible ? 1 : 0,
          transition: 'transform 0.25s ease, opacity 0.2s ease',
        }}
      >
        <div className="flex justify-center pt-3">
          <div className="w-9 h-1 rounded-full" style={{ backgroundColor: colors.TEXT_SECONDARY + '30' }} />
        </div>
        <div className="flex items-start justify-between px-5 pt-4 pb-2">
          <div>
            <h2 className="text-xl font-bold" style={{ color: colors.TEXT_PRIMARY }}>
              Profil employé
            </h2>
            <p className="text-xs mt-1" style={{ color: colors.TEXT_SECONDARY }}>
              Mode démo · choisir un employé
            </p>
          </div>
          <button
            onClick={handleClose}
            className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{ backgroundColor: colors.TEXT_SECONDARY + '15' }}
          >
            <X size={16} color={colors.TEXT_SECONDARY} />
          </button>
        </div>
        <div className="px-5 py-2">
          <div
            className="flex items-center rounded-xl px-3 h-10 border"
            style={{
              backgroundColor: colors.TEXT_SECONDARY + '08',
              borderColor: colors.TEXT_SECONDARY + '15',
            }}
          >
            <Search size={16} color={colors.TEXT_SECONDARY} className="mr-2 flex-shrink-0" />
            <input
              type="search"
              autoFocus
              placeholder="Rechercher un employé…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="flex-1 bg-transparent text-sm outline-none"
              style={{ color: colors.TEXT_PRIMARY }}
            />
            {query && (
              <button onClick={() => setQuery('')} className="ml-2">
                <X size={14} color={colors.TEXT_SECONDARY} />
              </button>
            )}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-5 pb-3" style={{ minHeight: 0 }}>
          {isLoading ? (
            <div className="py-10 text-center text-sm" style={{ color: colors.TEXT_SECONDARY }}>
              Chargement…
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center py-10 gap-3">
              <User size={36} color={colors.TEXT_SECONDARY + '40'} />
              <p className="text-sm" style={{ color: colors.TEXT_SECONDARY }}>
                Aucun employé trouvé
              </p>
            </div>
          ) : (
            filtered.map((emp) => {
              const selected = emp.id === selectedUserId;
              return (
                <button
                  key={emp.id}
                  type="button"
                  onClick={() => {
                    onSelect(emp.id);
                    handleClose();
                  }}
                  className="w-full flex items-center gap-3 px-3 py-3 rounded-lg mb-1 text-left transition-colors duration-150"
                  style={{
                    backgroundColor: selected ? colors.SUCCESS_STRONG + '0D' : 'transparent',
                    border: `1px solid ${
                      selected ? colors.SUCCESS_STRONG + '40' : colors.TEXT_SECONDARY + '10'
                    }`,
                  }}
                >
                  <div
                    className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{
                      backgroundColor: selected ? colors.SUCCESS_STRONG : 'transparent',
                      border: `1.5px solid ${
                        selected ? colors.SUCCESS_STRONG : colors.TEXT_SECONDARY + '35'
                      }`,
                    }}
                  >
                    {selected && <Check size={13} color="#fff" strokeWidth={3} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: colors.TEXT_PRIMARY }}>
                      {emp.fullname ?? emp.login}
                    </p>
                    <p className="text-[11px] truncate" style={{ color: colors.TEXT_SECONDARY }}>
                      #{emp.id} · {emp.email}
                    </p>
                  </div>
                </button>
              );
            })
          )}
        </div>
        <div
          className="px-5 py-4 border-t"
          style={{
            borderColor: colors.TEXT_SECONDARY + '12',
            paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))',
          }}
        >
          <button
            onClick={handleClose}
            className="w-full py-3 rounded-xl text-sm font-medium border transition-colors duration-150"
            style={{ borderColor: colors.TEXT_SECONDARY + '20', color: colors.TEXT_SECONDARY }}
          >
            Fermer
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function AdminSection({ colors }: { colors: Record<string, string> }) {
  const { data: employees, isLoading } = useEmployees();
  const selectedUserId = useProfileStore((s) => s.selectedUserId);
  const setSelectedUserId = useProfileStore((s) => s.setSelectedUserId);
  const overrideDateIso = useDemoStore((s) => s.overrideDateIso);
  const setOverrideDateIso = useDemoStore((s) => s.setOverrideDateIso);

  const [employeeModalOpen, setEmployeeModalOpen] = useState(false);

  useEffect(() => {
    if (!employees || employees.length === 0) return;
    if (selectedUserId !== null && employees.some((e) => e.id === selectedUserId)) return;
    setSelectedUserId(employees[0].id);
  }, [employees, selectedUserId, setSelectedUserId]);

  const selectedEmployee = useMemo(
    () => employees?.find((e) => e.id === selectedUserId) ?? null,
    [employees, selectedUserId],
  );

  const todayIso = new Date().toISOString().split('T')[0];
  const selectedDateIso = overrideDateIso ?? todayIso;
  const selectedDateLabel = formatDateLong(new Date(`${selectedDateIso}T12:00:00`));

  return (
    <div
      className="mx-5 overflow-hidden rounded-2xl"
      style={{ backgroundColor: colors.SETTINGS_SECTION_BG, boxShadow: colors.CARD_SHADOW }}
    >
      {/* Employee picker */}
      <div className="px-5 py-4" style={{ borderBottom: `1px solid ${colors.SETTINGS_SEPARATOR}` }}>
        <p className="text-xs font-medium mb-2" style={{ color: colors.TEXT_SECONDARY }}>
          Profil employé
        </p>
        <button
          type="button"
          onClick={() => setEmployeeModalOpen(true)}
          className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg border text-sm"
          style={{
            borderColor: colors.BORDER,
            backgroundColor: colors.BG_SECONDARY,
            color: colors.TEXT_PRIMARY,
          }}
        >
          <span className="truncate font-medium">
            {isLoading ? 'Chargement…' : (selectedEmployee?.fullname ?? selectedEmployee?.login ?? 'Choisir…')}
          </span>
          <ChevronDown size={16} color={colors.TEXT_SECONDARY} />
        </button>
      </div>

      <EmployeePickerModal
        isOpen={employeeModalOpen}
        onClose={() => setEmployeeModalOpen(false)}
        colors={colors}
        employees={employees}
        isLoading={isLoading}
        selectedUserId={selectedUserId}
        onSelect={setSelectedUserId}
      />

      {/* Date picker */}
      <div className="px-5 py-4">
        <p className="text-xs font-medium mb-2" style={{ color: colors.TEXT_SECONDARY }}>
          Date simulée
        </p>
        <p className="text-sm font-medium mb-2" style={{ color: colors.TEXT_PRIMARY }}>
          {selectedDateLabel}
        </p>
        <div className="flex items-center gap-2">
          <input
            type="date"
            lang="fr-FR"
            value={selectedDateIso}
            onChange={(e) => setOverrideDateIso(e.target.value || null)}
            className="flex-1 px-3 py-2.5 rounded-lg border text-sm"
            style={{
              borderColor: colors.BORDER,
              backgroundColor: colors.BG_SECONDARY,
              color: colors.TEXT_PRIMARY,
              colorScheme: 'light',
            }}
          />
          {overrideDateIso && (
            <button
              type="button"
              onClick={() => setOverrideDateIso(null)}
              className="px-3 py-2.5 rounded-lg border text-xs font-semibold"
              style={{
                borderColor: colors.BORDER,
                backgroundColor: colors.BG_SECONDARY,
                color: colors.TEXT_SECONDARY,
              }}
            >
              Aujourd'hui
            </button>
          )}
        </div>
        {overrideDateIso && (
          <p className="text-xs mt-1.5" style={{ color: colors.PRIMARY }}>
            ⚠ Date simulée active — l&apos;app affiche le {selectedDateLabel}
          </p>
        )}
      </div>
    </div>
  );
}

export default function ProfilPage() {
  const { colors } = useThemeColors();
  const { t } = useTranslation();
  const { data: currentUserData, isLoading: isUserLoading } = useCurrentUser();
  const preferredSites = currentUserData?.sites ?? [];
  const [isEditSitesOpen, setIsEditSitesOpen] = useState(false);

  const fullname = useMemo(() => {
    if (currentUserData?.user?.fullname) return currentUserData.user.fullname;
    const first = currentUserData?.userInfo?.first_name ?? '';
    const last = currentUserData?.userInfo?.last_name ?? '';
    return `${first} ${last}`.trim() || currentUserData?.user?.login || '';
  }, [currentUserData]);

  const email = currentUserData?.user?.email ?? currentUserData?.userInfo?.email ?? '';
  const telephone = currentUserData?.userInfo?.telephone ?? '';
  const ville = currentUserData?.userInfo?.reste_tout_lhiver_sur ?? '';

  return (
    <div className="flex-1 flex flex-col overflow-y-auto pb-10" style={{ backgroundColor: colors.BG_SECONDARY }}>
      <PageHeader title={t('screens.profil.title')} />
      {/* Profile */}
      <p
        className="text-xs font-semibold uppercase tracking-wider px-5 pt-7 pb-2"
        style={{ color: colors.TEXT_SECONDARY }}
      >
        {t('settings.profile.title')}
      </p>
      <div
        className="mx-5 overflow-hidden rounded-2xl"
        style={{ backgroundColor: colors.SETTINGS_SECTION_BG, boxShadow: colors.CARD_SHADOW }}
      >
        <div className="flex items-center px-5 py-4">
          <div
            className="mr-4 flex h-12 w-12 items-center justify-center rounded-2xl"
            style={{ backgroundColor: colors.PRIMARY_MUTED }}
          >
            <User size={20} color={colors.PRIMARY} strokeWidth={2.25} />
          </div>
          <div className="flex-1">
            <p className="text-lg font-semibold" style={{ color: colors.TEXT_PRIMARY }}>
              {isUserLoading ? '...' : fullname}
            </p>
            {email && <p className="text-sm" style={{ color: colors.TEXT_SECONDARY }}>{email}</p>}
            {telephone && <p className="text-sm" style={{ color: colors.TEXT_SECONDARY }}>{telephone}</p>}
            {ville && <p className="text-sm" style={{ color: colors.TEXT_SECONDARY }}>{ville}</p>}
          </div>
        </div>
      </div>

      {/* Preferred Sites */}
      <div className="flex items-center justify-between px-5 pt-7 pb-2">
        <p className="text-sm uppercase" style={{ color: colors.TEXT_SECONDARY }}>
          {t('settings.profile.preferredSitesTitle')}
        </p>
        <button
          onClick={() => setIsEditSitesOpen(true)}
          className="text-sm font-medium"
          style={{ color: colors.PRIMARY }}
        >
          {t('common.edit')}
        </button>
      </div>
      <div
        className="mx-5 overflow-hidden rounded-2xl"
        style={{ backgroundColor: colors.SETTINGS_SECTION_BG, boxShadow: colors.CARD_SHADOW }}
      >
        {preferredSites.length === 0 ? (
          <div className="px-4 py-3">
            <p className="text-sm" style={{ color: colors.TEXT_SECONDARY }}>
              {t('settings.profile.noPreferredSites')}
            </p>
          </div>
        ) : (
          preferredSites.map((site) => (
            <div key={site.id} className="flex items-center px-5 py-3">
              <div
                className="w-2 h-2 rounded-full mr-3"
                style={{ backgroundColor: colors.SUCCESS_STRONG }}
              />
              <div className="flex-1">
                <p className="text-base font-medium" style={{ color: colors.TEXT_PRIMARY }}>
                  {site.site_name}
                </p>
                <p className="text-sm" style={{ color: colors.TEXT_SECONDARY }}>
                  {site.ville}{site.ville ? ' • ' : ''}{site.statut}
                </p>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Admin (demo) */}
      <p
        className="text-xs font-semibold uppercase tracking-wider px-5 pt-7 pb-2"
        style={{ color: colors.TEXT_SECONDARY }}
      >
        Admin · Mode démo
      </p>
      <AdminSection colors={colors} />

      <EditSitesModal
        isOpen={isEditSitesOpen}
        onClose={() => setIsEditSitesOpen(false)}
        colors={colors}
        initialSelectedIds={preferredSites.map((s) => s.site_id)}
      />
    </div>
  );
}
