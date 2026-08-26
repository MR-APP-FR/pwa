/** Distance max (m) pour une fermeture classique quand le site a des coordonnées. */
export const GEO_CLOSE_MAX_METERS = 200;

export function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function siteHasCoordinates(
  latitude: number | null | undefined,
  longitude: number | null | undefined,
): boolean {
  return (
    typeof latitude === 'number' &&
    Number.isFinite(latitude) &&
    typeof longitude === 'number' &&
    Number.isFinite(longitude)
  );
}

export interface ClosingForceCheck {
  needsForce: boolean;
  distanceM: number | null;
  early: boolean;
  geoFailed: boolean;
}

export function evaluateClosingForce(input: {
  siteLatitude: number | null | undefined;
  siteLongitude: number | null | undefined;
  clientLatitude: number | null | undefined;
  clientLongitude: number | null | undefined;
  beforeDeadline: boolean;
}): ClosingForceCheck {
  const early = input.beforeDeadline;
  let distanceM: number | null = null;
  let geoFailed = false;

  if (siteHasCoordinates(input.siteLatitude, input.siteLongitude)) {
    const lat = input.clientLatitude;
    const lng = input.clientLongitude;
    if (
      typeof lat !== 'number' ||
      !Number.isFinite(lat) ||
      typeof lng !== 'number' ||
      !Number.isFinite(lng)
    ) {
      geoFailed = true;
    } else {
      const meters = Math.round(
        haversineMeters(lat, lng, input.siteLatitude as number, input.siteLongitude as number),
      );
      if (meters > GEO_CLOSE_MAX_METERS) distanceM = meters;
    }
  }

  return {
    needsForce: early || geoFailed || distanceM != null,
    distanceM,
    early,
    geoFailed,
  };
}
