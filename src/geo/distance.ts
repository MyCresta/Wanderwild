export interface Fix {
  lat: number;
  lng: number;
  /** Horizontal accuracy in metres. */
  accuracy: number;
  /** Milliseconds since epoch. */
  time: number;
}

const EARTH_RADIUS_M = 6_371_008.8;
const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance between two points, in metres. */
export function haversine(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export interface WalkTrackerOptions {
  /** Fixes less accurate than this are ignored. */
  maxAccuracyM?: number;
  /** Movement faster than this (a bike, car or GPS glitch) does not count as walking. */
  maxSpeedMps?: number;
  /** Movement shorter than this is treated as GPS jitter. */
  minStepM?: number;
}

/**
 * Turns a stream of GPS fixes into "distance walked", filtering out jitter,
 * inaccurate fixes and anything too fast to be on foot.
 */
export class WalkTracker {
  private anchor: Fix | null = null;
  private readonly maxAccuracyM: number;
  private readonly maxSpeedMps: number;
  private readonly minStepM: number;

  constructor(
    public totalMetres = 0,
    { maxAccuracyM = 40, maxSpeedMps = 7, minStepM = 8 }: WalkTrackerOptions = {},
  ) {
    this.maxAccuracyM = maxAccuracyM;
    this.maxSpeedMps = maxSpeedMps;
    this.minStepM = minStepM;
  }

  /** Feeds a fix and returns the metres it added to the total. */
  add(fix: Fix): number {
    if (fix.accuracy > this.maxAccuracyM) return 0;
    if (!this.anchor) {
      this.anchor = fix;
      return 0;
    }

    const metres = haversine(this.anchor, fix);
    if (metres < Math.max(this.minStepM, fix.accuracy / 2)) return 0;

    const seconds = (fix.time - this.anchor.time) / 1000;
    this.anchor = fix;
    if (seconds <= 0 || metres / seconds > this.maxSpeedMps) return 0;

    this.totalMetres += metres;
    return metres;
  }
}
