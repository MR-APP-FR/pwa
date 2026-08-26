'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { X, Search, MapPin, Check, LogOut } from 'lucide-react';
import { useThemeColors } from '../../hooks/useThemeColors';
import { useTranslation } from '../../hooks/useTranslation';
import { useCurrentUser } from '../../hooks/api/useCurrentUser';
import { useSites } from '../../hooks/api/useSites';
import { createClient } from '../../lib/supabase/client';
import { PageHeader } from '../../components/layout/PageHeader';
import { PrimaryButton } from '../../components/common/PrimaryButton';
import { DevToolsPanel } from '../../components/dev/DevToolsPanel';
import { PushSettingsRow } from '../../components/pwa/PushSettingsRow';
import { updatePreferredSites } from './actions';
import { ProfileMediaCard } from '../../components/profil/ProfileMediaCard';

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
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, startSaving] = useTransition();
  const backdropRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (isOpen) {
      setSelectedIds(initialSelectedIds);
      setSearchQuery('');
      setSaveError(null);
      requestAnimationFrame(() => setIsVisible(true));
    } else {
      setIsVisible(false);
    }
  }, [isOpen, initialSelectedIds]);

  const handleClose = () => {
    setIsVisible(false);
    setTimeout(onClose, 200);
  };

  const handleSave = () => {
    setSaveError(null);
    startSaving(async () => {
      const result = await updatePreferredSites(selectedIds);
      if (!result.ok) {
        setSaveError(result.error);
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ['currentUser'] });
      handleClose();
    });
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
              placeholder="Rechercher un site.."
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
        {saveError && (
          <p className="px-5 pb-1 text-xs" style={{ color: colors.ACCENT_RED ?? '#EB5757' }}>
            {saveError}
          </p>
        )}
        <div
          className="flex gap-3 px-5 py-4 border-t"
          style={{ borderColor: colors.TEXT_SECONDARY + '12' }}
        >
          <button
            onClick={handleClose}
            disabled={isSaving}
            className="flex-1 py-2.5 rounded-xl text-sm font-medium border transition-colors duration-150"
            style={{ borderColor: colors.TEXT_SECONDARY + '20', color: colors.TEXT_SECONDARY }}
          >
            Annuler
          </button>
          <PrimaryButton
            onClick={handleSave}
            disabled={isSaving}
            className="flex flex-[1.5] items-center justify-center gap-1.5 py-2.5 text-sm"
          >
            <Check size={16} />
            {isSaving ? 'Enregistrement…' : 'Sauvegarder'}
          </PrimaryButton>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default function ProfilPage() {
  const { colors } = useThemeColors();
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: currentUserData, isLoading: isUserLoading } = useCurrentUser();
  const preferredSites = currentUserData?.sites ?? [];
  const [isEditSitesOpen, setIsEditSitesOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [avatarPath, setAvatarPath] = useState<string | null>(null);
  const [cniPath, setCniPath] = useState<string | null>(null);

  useEffect(() => {
    setAvatarPath(currentUserData?.userInfo?.avatar_url ?? null);
    setCniPath(currentUserData?.userInfo?.cni_url ?? null);
  }, [currentUserData?.userInfo?.avatar_url, currentUserData?.userInfo?.cni_url]);

  const fullname = useMemo(() => {
    if (currentUserData?.user?.fullname) return currentUserData.user.fullname;
    const first = currentUserData?.userInfo?.first_name ?? '';
    const last = currentUserData?.userInfo?.last_name ?? '';
    return `${first} ${last}`.trim() || currentUserData?.user?.login || '';
  }, [currentUserData]);

  const email = currentUserData?.user?.email ?? currentUserData?.userInfo?.email ?? '';
  const telephone = currentUserData?.userInfo?.telephone ?? '';
  const ville = currentUserData?.userInfo?.reste_tout_lhiver_sur ?? '';

  async function handleSignOut() {
    setSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace('/login');
    router.refresh();
  }

  return (
    <div className="flex-1 flex flex-col overflow-y-auto pb-10" style={{ backgroundColor: colors.BG_SECONDARY }}>
      <PageHeader accent="primary" title={t('screens.profil.title')} />
      <p
        className="text-xs font-semibold uppercase tracking-wider px-5 pt-7 pb-2"
        style={{ color: colors.TEXT_SECONDARY }}
      >
        {t('settings.profile.title')}
      </p>
      <ProfileMediaCard
        kind="avatar"
        path={avatarPath}
        onUploaded={(nextPath) => {
          setAvatarPath(nextPath);
          void queryClient.invalidateQueries({ queryKey: ['currentUser'] });
        }}
      />
      <div
        className="mx-5 mt-3 overflow-hidden rounded-2xl"
        style={{ backgroundColor: colors.SETTINGS_SECTION_BG, boxShadow: colors.CARD_SHADOW }}
      >
        <div className="flex items-center px-5 py-4">
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

      <div className="mt-3">
        <ProfileMediaCard
          kind="cni"
          path={cniPath}
          onUploaded={(nextPath) => {
            setCniPath(nextPath);
            void queryClient.invalidateQueries({ queryKey: ['currentUser'] });
          }}
        />
      </div>

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

      <PushSettingsRow />

      <DevToolsPanel colors={colors} />

      <div className="mx-5 mt-8">
        <button
          type="button"
          onClick={() => void handleSignOut()}
          disabled={signingOut}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-semibold transition-opacity active:opacity-80"
          style={{
            borderColor: colors.BORDER,
            backgroundColor: colors.SETTINGS_SECTION_BG,
            color: colors.DANGER_STRONG ?? '#EB5757',
            boxShadow: colors.CARD_SHADOW,
          }}
        >
          <LogOut size={16} />
          {signingOut ? t('auth.signingOut') : t('auth.signOut')}
        </button>
      </div>

      <EditSitesModal
        isOpen={isEditSitesOpen}
        onClose={() => setIsEditSitesOpen(false)}
        colors={colors}
        initialSelectedIds={preferredSites.map((s) => s.site_id)}
      />
    </div>
  );
}
