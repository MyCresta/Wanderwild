import type { Fix } from './distance';

export type LocationEvent =
  | { kind: 'fix'; fix: Fix }
  | { kind: 'error'; reason: 'denied' | 'unavailable' | 'unsupported' };

/** Watches the device position. Returns a function that stops watching. */
export function watchLocation(onEvent: (event: LocationEvent) => void): () => void {
  if (!('geolocation' in navigator)) {
    onEvent({ kind: 'error', reason: 'unsupported' });
    return () => {};
  }

  const id = navigator.geolocation.watchPosition(
    (pos) =>
      onEvent({
        kind: 'fix',
        fix: {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          time: pos.timestamp,
        },
      }),
    (err) =>
      onEvent({ kind: 'error', reason: err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable' }),
    { enableHighAccuracy: true, maximumAge: 5_000, timeout: 20_000 },
  );
  return () => navigator.geolocation.clearWatch(id);
}
