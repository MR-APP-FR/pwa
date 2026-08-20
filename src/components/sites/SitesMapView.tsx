'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { RADIUS } from '../../constants/design';
import { useSites } from '../../hooks/api/useSites';
import { useThemeColors } from '../../hooks/useThemeColors';
import { useTranslation } from '../../hooks/useTranslation';
import type { Site, SiteStatut } from '../../database/types';

const FRANCE_CENTER = { lat: 46.6034, lng: 1.8883 };
const FRANCE_ZOOM = 6;
const SCRIPT_ID = 'google-maps-js';

/** Style gris épuré (Silver) : pas de POI, pas de stations métro / transit. */
const GREY_STYLE: google.maps.MapTypeStyle[] = [
  { elementType: 'geometry', stylers: [{ color: '#f5f5f5' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#616161' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#f5f5f5' }] },
  {
    featureType: 'administrative.land_parcel',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#bdbdbd' }],
  },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#e5e5e5' }] },
  { featureType: 'poi.park', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
  { featureType: 'road', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  {
    featureType: 'road.arterial',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#757575' }],
  },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#dadada' }] },
  {
    featureType: 'road.highway',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#616161' }],
  },
  {
    featureType: 'road.local',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#9e9e9e' }],
  },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#c9c9c9' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#9e9e9e' }] },
];

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

function hasCoordinates(site: Site): site is Site & { latitude: number; longitude: number } {
  return site.latitude != null && site.longitude != null;
}

function loadGoogleMaps(apiKey: string): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('window unavailable'));
  if (window.google?.maps?.Map) return Promise.resolve();

  const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
  if (existing) {
    return new Promise((resolve, reject) => {
      if (window.google?.maps?.Map) {
        resolve();
        return;
      }
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener(
        'error',
        () => reject(new Error('Impossible de charger Google Maps')),
        { once: true },
      );
    });
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly&language=fr&region=FR`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Impossible de charger Google Maps'));
    document.head.appendChild(script);
  });
}

function fitMapToSites(
  map: google.maps.Map,
  sites: Array<Site & { latitude: number; longitude: number }>,
) {
  if (sites.length === 0) {
    map.setCenter(FRANCE_CENTER);
    map.setZoom(FRANCE_ZOOM);
    return;
  }
  if (sites.length === 1) {
    map.setCenter({ lat: sites[0].latitude, lng: sites[0].longitude });
    map.setZoom(13);
    return;
  }
  const bounds = new google.maps.LatLngBounds();
  for (const site of sites) {
    bounds.extend({ lat: site.latitude, lng: site.longitude });
  }
  map.fitBounds(bounds, 50);
}

export default function SitesMapView() {
  const { colors } = useThemeColors();
  const { t } = useTranslation();
  const { data } = useSites();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const infoRef = useRef<google.maps.InfoWindow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const tRef = useRef(t);
  const colorsRef = useRef(colors);
  tRef.current = t;
  colorsRef.current = colors;

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  const sitesWithCoords = useMemo(
    () => (data?.sites ?? []).filter(hasCoordinates),
    [data?.sites],
  );

  useEffect(() => {
    if (!apiKey) {
      setError(tRef.current('screens.sitesMap.missingKey'));
      return;
    }
    if (!containerRef.current) return;

    let cancelled = false;
    let resizeObserver: ResizeObserver | null = null;

    loadGoogleMaps(apiKey)
      .then(() => {
        if (cancelled || !containerRef.current) return;

        const map = new google.maps.Map(containerRef.current, {
          center: FRANCE_CENTER,
          zoom: FRANCE_ZOOM,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          clickableIcons: false,
          gestureHandling: 'greedy',
          styles: GREY_STYLE,
        });
        mapRef.current = map;
        infoRef.current = new google.maps.InfoWindow();
        setReady(true);

        resizeObserver = new ResizeObserver(() => {
          google.maps.event.trigger(map, 'resize');
        });
        resizeObserver.observe(containerRef.current);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : tRef.current('screens.sitesMap.loadError'));
        }
      });

    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
      markersRef.current.forEach((marker) => marker.setMap(null));
      markersRef.current = [];
      infoRef.current?.close();
      infoRef.current = null;
      mapRef.current = null;
    };
  }, [apiKey]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    markersRef.current.forEach((marker) => marker.setMap(null));
    markersRef.current = [];

    const info = infoRef.current;

    for (const site of sitesWithCoords) {
      const marker = new google.maps.Marker({
        map,
        position: { lat: site.latitude, lng: site.longitude },
        title: site.name,
        icon: {
          url: '/pin.png',
          scaledSize: new google.maps.Size(36, 36),
          anchor: new google.maps.Point(18, 36),
        },
      });
      marker.addListener('click', () => {
        info?.setContent(buildInfoContent(site, colorsRef.current, tRef.current));
        info?.open({ map, anchor: marker });
      });
      markersRef.current.push(marker);
    }

    fitMapToSites(map, sitesWithCoords);
  }, [sitesWithCoords, ready]);

  return (
    <div className="relative flex-1" style={{ minHeight: 0 }}>
      <div ref={containerRef} className="absolute inset-0" />

      {error ? (
        <div
          className="absolute inset-0 z-10 flex items-center justify-center px-6"
          style={{ backgroundColor: colors.BG_TERTIARY }}
        >
          <p className="text-center text-sm" style={{ color: colors.TEXT_SECONDARY }}>
            {error}
          </p>
        </div>
      ) : null}

      {!ready && !error ? (
        <div
          className="absolute inset-0 z-10 flex items-center justify-center"
          style={{ backgroundColor: colors.BG_TERTIARY }}
        >
          <p className="text-sm" style={{ color: colors.TEXT_SECONDARY }}>
            {t('screens.sitesMap.loading')}
          </p>
        </div>
      ) : null}

      <div
        className="pointer-events-none absolute bottom-4 left-4 right-4 z-10 rounded-xl px-3 py-2 text-center text-xs font-medium shadow-sm"
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

function buildInfoContent(
  site: Site & { latitude: number; longitude: number },
  colors: { TEXT_PRIMARY: string; TEXT_SECONDARY: string; PRIMARY: string; TEXT_INVERSE: string },
  t: (key: string) => string,
): HTMLElement {
  const root = document.createElement('div');
  root.style.minWidth = '10rem';
  root.style.padding = '2px';

  const title = document.createElement('p');
  title.style.fontSize = '14px';
  title.style.fontWeight = '600';
  title.style.lineHeight = '1.25';
  title.style.margin = '0 0 6px';
  title.style.color = colors.TEXT_PRIMARY;
  title.textContent = site.name;
  root.appendChild(title);

  if (site.adresse) {
    const address = document.createElement('p');
    address.style.fontSize = '12px';
    address.style.lineHeight = '1.25';
    address.style.margin = '0 0 2px';
    address.style.color = colors.TEXT_SECONDARY;
    address.textContent = site.adresse;
    root.appendChild(address);
  }

  const cityLine = [site.code_postal, site.ville].filter(Boolean).join(' ');
  if (cityLine) {
    const city = document.createElement('p');
    city.style.fontSize = '12px';
    city.style.lineHeight = '1.25';
    city.style.margin = '0 0 4px';
    city.style.color = colors.TEXT_SECONDARY;
    city.textContent = cityLine;
    root.appendChild(city);
  }

  if (site.metro) {
    const metro = document.createElement('p');
    metro.style.fontSize = '12px';
    metro.style.lineHeight = '1.25';
    metro.style.margin = '0 0 6px';
    metro.style.color = colors.TEXT_SECONDARY;
    metro.textContent = `🚇 ${site.metro}`;
    root.appendChild(metro);
  }

  const statut = site.statut ?? 'automatique';
  const badgeStyle = STATUS_BADGE[statut];
  const badge = document.createElement('span');
  badge.style.display = 'inline-flex';
  badge.style.alignItems = 'center';
  badge.style.borderRadius = '9999px';
  badge.style.padding = '2px 8px';
  badge.style.fontSize = '12px';
  badge.style.fontWeight = '500';
  badge.style.backgroundColor = badgeStyle.backgroundColor;
  badge.style.color = badgeStyle.color;
  badge.textContent = t(STATUS_I18N[statut]);
  root.appendChild(badge);

  const go = document.createElement('a');
  go.href = `https://maps.google.com/?q=${site.latitude},${site.longitude}`;
  go.target = '_blank';
  go.rel = 'noopener noreferrer';
  go.style.display = 'flex';
  go.style.alignItems = 'center';
  go.style.justifyContent = 'center';
  go.style.marginTop = '8px';
  go.style.padding = '8px 0';
  go.style.fontSize = '12px';
  go.style.fontWeight = '600';
  go.style.letterSpacing = '0.04em';
  go.style.textTransform = 'uppercase';
  go.style.textDecoration = 'none';
  go.style.backgroundColor = colors.PRIMARY;
  go.style.color = colors.TEXT_INVERSE;
  go.style.borderRadius = `${RADIUS.sm}px`;
  go.textContent = t('screens.planning.go');
  root.appendChild(go);

  return root;
}
