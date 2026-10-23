import { hashString } from '../creatures/rng';
import type { Parcel } from '../game/demesne';
import { pointInPolygon } from '../game/realms';

/** Where in its parcel a resident settles: part way from the middle toward one of the corners. */
export function residentSpot(parcel: Pick<Parcel, 'polygon' | 'centroid'>, uid: string, index: number): [number, number] {
  const [cx, cy] = parcel.centroid;
  const ring = parcel.polygon;
  if (ring.length < 3) return [cx, cy];
  const h = hashString(uid);
  const geometry = { type: 'Polygon' as const, coordinates: [[...ring, ring[0]]] };
  // Try a few corners and depths; a concave border can put the first guess outside.
  for (let attempt = 0; attempt < 6; attempt++) {
    const [vx, vy] = ring[(h + index * 7 + attempt * 3) % ring.length];
    const t = 0.35 + ((h >>> 8) % 20) / 100 - attempt * 0.05;
    const spot: [number, number] = [cx + (vx - cx) * t, cy + (vy - cy) * t];
    if (pointInPolygon(spot[0], spot[1], geometry)) return spot;
  }
  return [cx, cy];
}
