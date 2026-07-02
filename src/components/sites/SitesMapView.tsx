'use client';

import { useMemo } from 'react';
import L from 'leaflet';
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet';
import { useSites } from '../../hooks/api/useSites';
import { useThemeColors } from '../../hooks/useThemeColors';
import { useTranslation } from '../../hooks/useTranslation';
import type { Site } from '../../database/types';

import 'leaflet/dist/leaflet.css';

const FRANCE_CENTER: L.LatLngExpression = [46.6, 2.4];
const FRANCE_ZOOM = 5.5;

/** Fond minimal N&B + labels Positron (typo légère, assombrissement doux via CSS) */
const MAP_BASE_URL = 'https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png';
const MAP_LABELS_URL = 'https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png';
const MAP_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';
const LABELS_PANE = 'labels';

function MapLabelLayer() {
  const map = useMap();

  if (!map.getPane(LABELS_PANE)) {
    map.createPane(LABELS_PANE);
    const pane = map.getPane(LABELS_PANE);
    if (pane) pane.style.zIndex = '350';
  }

  return <TileLayer pane={LABELS_PANE} url={MAP_LABELS_URL} />;
}

const PIN_ICON = L.icon({
  iconUrl: '/pin.png',
  iconSize: [36, 36],
  iconAnchor: [18, 36],
  popupAnchor: [0, -36],
});

function hasCoordinates(site: Site): site is Site & { latitude: number; longitude: number } {
  return site.latitude != null && site.longitude != null;
}

export default function SitesMapView() {
  const { colors } = useThemeColors();
  const { t } = useTranslation();
  const { data } = useSites();

  const sitesWithCoords = useMemo(
    () => (data?.sites ?? []).filter(hasCoordinates),
    [data?.sites],
  );

  if (sitesWithCoords.length === 0) {
    return (
      <div
        className="flex flex-1 items-center justify-center px-6"
        style={{ backgroundColor: colors.BG_SECONDARY }}
      >
        <p className="text-center text-sm" style={{ color: colors.TEXT_SECONDARY }}>
          {t('screens.sitesMap.empty')}
        </p>
      </div>
    );
  }

  return (
    <div className="relative flex-1" style={{ minHeight: 0 }}>
      <div className="absolute inset-0">
      <MapContainer
        className="sites-map"
        center={FRANCE_CENTER}
        zoom={FRANCE_ZOOM}
        style={{ height: '100%', width: '100%', backgroundColor: '#f2f2f2' }}
        scrollWheelZoom
      >
        <TileLayer attribution={MAP_ATTRIBUTION} url={MAP_BASE_URL} />
        <MapLabelLayer />
        {sitesWithCoords.map((site) => (
          <Marker
            key={site.id}
            position={[site.latitude, site.longitude]}
            icon={PIN_ICON}
          >
            <Popup>
              <div className="min-w-[160px] space-y-2 p-0.5">
                <p className="text-sm font-bold leading-snug" style={{ color: colors.TEXT_PRIMARY }}>
                  {site.name}
                </p>
                {site.ville && (
                  <p className="text-xs leading-snug" style={{ color: colors.TEXT_SECONDARY }}>
                    {site.ville}
                  </p>
                )}
                <a
                  href={`https://maps.google.com/?q=${site.latitude},${site.longitude}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block text-xs font-semibold underline"
                  style={{ color: colors.PRIMARY }}
                >
                  {t('screens.sitesMap.openInMaps')}
                </a>
              </div>
            </Popup>
          </Marker>
        ))}
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
