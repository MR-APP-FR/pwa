export type GeoFix =
  | { ok: true; latitude: number; longitude: number; atMs: number }
  | { ok: false; error: 'denied' | 'unavailable' | 'timeout' | 'unsupported' };

const GEO_TIMEOUT_MS = 12_000;

export function requestGeolocation(): Promise<GeoFix> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return Promise.resolve({ ok: false, error: 'unsupported' });
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          ok: true,
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          atMs: Date.now(),
        });
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) resolve({ ok: false, error: 'denied' });
        else if (err.code === err.TIMEOUT) resolve({ ok: false, error: 'timeout' });
        else resolve({ ok: false, error: 'unavailable' });
      },
      {
        enableHighAccuracy: true,
        timeout: GEO_TIMEOUT_MS,
        maximumAge: 30_000,
      },
    );
  });
}
