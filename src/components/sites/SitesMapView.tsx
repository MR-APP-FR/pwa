'use client';

import { useEffect, useMemo } from 'react';
import L from 'leaflet';
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet';
import { RADIUS } from '../../constants/design';
import { useSites } from '../../hooks/api/useSites';
import { useThemeColors } from '../../hooks/useThemeColors';
import { useTranslation } from '../../hooks/useTranslation';
import type { Site, SiteStatut } from '../../database/types';

import 'leaflet/dist/leaflet.css';

const FRANCE_CENTER: L.LatLngExpression = [46.6034, 1.8883];
const FRANCE_ZOOM = 6;
const OSM_TILES = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

const STATUS_I18N: Record<SiteStatut, string> = {
  actif: 'screens.sitesMap.statusActif',
  ferme: 'screens.sitesMap.statusFerme',
  temporaire: 'screens.sitesMap.statusTemporaire',
  automatique: 'screens.sitesMap.statusAutomatique',
};

const STATUS_BADGE: Record<SiteStatut, { backgroundColor: string; color: string }> = {
  actif: { backgroundColor: '#dcfce7', color: '#166534' },
  ferme: { backgroundColor: '#fee2e2', color: '#991b1b' },
  temporaire: { backgroundColor: '#fef9c3', color: '#854d0e' },
  automatique: { backgroundColor: '#dbeafe', color: '#1e40af' },
};

const PIN_ICON = L.icon({
  iconUrl: '/pin.png',
  iconSize: [36, 36],
  iconAnchor: [18, 36],
  popupAnchor: [0, -36],
});

function hasCoordinates(site: Site): site is Site & { latitude: number; longitude: number } {
  return site.latitude != null && site.longitude != null;
}

function MapBounds({ sites }: { sites: Array<Site & { latitude: number; longitude: number }> }) {
  const map = useMap();

  useEffect(() => {
    if (sites.length === 0) {
      map.setView(FRANCE_CENTER, FRANCE_ZOOM);
      return;
    }
    if (sites.length === 1) {
      map.setView([sites[0].latitude, sites[0].longitude], 13);
      return;
    }
    const bounds = L.latLngBounds(sites.map((site) => [site.latitude, site.longitude]));
    map.fitBounds(bounds, { padding: [50, 50] });
  }, [map, sites]);

  return null;
}

export default function SitesMapView() {
  const { colors } = useThemeColors();
  const { t } = useTranslation();
  const { data } = useSites();

  const sitesWithCoords = useMemo(
    () => (data?.sites ?? []).filter(hasCoordinates),
    [data?.sites],
  );

  return (
    <div className="relative flex-1" style={{ minHeight: 0 }}>
      <div className="absolute inset-0 [&_.leaflet-tile-pane]:grayscale">
        <MapContainer
          className="sites-map"
          center={FRANCE_CENTER}
          zoom={FRANCE_ZOOM}
          style={{ height: '100%', width: '100%' }}
          scrollWheelZoom
        >
          <TileLayer attribution={OSM_ATTRIBUTION} url={OSM_TILES} />
          <MapBounds sites={sitesWithCoords} />
          {sitesWithCoords.map((site) => {
            const statut = site.statut ?? 'automatique';
            const badge = STATUS_BADGE[statut];
            return (
              <Marker
                key={site.id}
                position={[site.latitude, site.longitude]}
                icon={PIN_ICON}
              >
                <Popup>
                  <div className="min-w-40 space-y-1.5 p-0.5">
                    <p className="text-sm font-semibold leading-snug" style={{ color: colors.TEXT_PRIMARY }}>
                      {site.name}
                    </p>
                    {site.adresse ? (
                      <p className="text-xs leading-snug" style={{ color: colors.TEXT_SECONDARY }}>
                        {site.adresse}
                      </p>
                    ) : null}
                    {site.ville || site.code_postal ? (
                      <p className="text-xs leading-snug" style={{ color: colors.TEXT_SECONDARY }}>
                        {[site.code_postal, site.ville].filter(Boolean).join(' ')}
                      </p>
                    ) : null}
                    {site.metro ? (
                      <p className="text-xs leading-snug" style={{ color: colors.TEXT_SECONDARY }}>
                        🚇 {site.metro}
                      </p>
                    ) : null}
                    <span
                      className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
                      style={badge}
                    >
                      {t(STATUS_I18N[statut])}
                    </span>
                    <a
                      href={`https://maps.google.com/?q=${site.latitude},${site.longitude}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 flex items-center justify-center gap-1.5 py-2 text-xs font-semibold uppercase tracking-wide"
                      style={{
                        backgroundColor: colors.PRIMARY,
                        color: colors.TEXT_INVERSE,
                        borderRadius: RADIUS.sm,
                      }}
                    >
                      {t('screens.planning.go')}
                    </a>
                  </div>
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>
      </div>

      <div
        className="pointer-events-none absolute bottom-4 left-4 right-4 rounded-xl px-3 py-2 text-center text-xs font-medium shadow-sm"
        style={{
          backgroundColor: colors.SETTINGS_SECTION_BG,
          color: colors.TEXT_SECONDARY,
          border: `1px solid ${colors.BORDER}`,
        }}
      >
        {t('screens.sitesMap.siteCount', { count: String(sitesWithCoords.length) })}
      </div>
    </div>
  );
}
