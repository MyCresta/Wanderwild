import { describe, expect, it } from 'vitest';
import { pointInPolygon } from '../src/game/realms';
import { residentSpot } from '../src/map/residentSpot';

const inside = (polygon: [number, number][], p: [number, number]) =>
  pointInPolygon(p[0], p[1], { type: 'Polygon', coordinates: [[...polygon, polygon[0]]] });

describe('where residents settle', () => {
  const square: [number, number][] = [
    [0, 0],
    [0.002, 0],
    [0.002, 0.002],
    [0, 0.002],
  ];

  it('stays inside the parcel and spreads residents apart', () => {
    const parcel = { polygon: square, centroid: [0.001, 0.001] as [number, number] };
    const spots = ['a', 'b', 'c'].map((uid, i) => residentSpot(parcel, uid, i));
    for (const s of spots) expect(inside(square, s)).toBe(true);
    expect(new Set(spots.map((s) => s.join())).size).toBeGreaterThan(1);
  });

  it('is the same every time for the same pet', () => {
    const parcel = { polygon: square, centroid: [0.001, 0.001] as [number, number] };
    expect(residentSpot(parcel, 'pet-1', 0)).toEqual(residentSpot(parcel, 'pet-1', 0));
  });

  it('keeps inside a concave parcel', () => {
    const ell: [number, number][] = [
      [0, 0],
      [0.003, 0],
      [0.003, 0.001],
      [0.001, 0.001],
      [0.001, 0.003],
      [0, 0.003],
    ];
    const parcel = { polygon: ell, centroid: [0.0008, 0.0008] as [number, number] };
    for (let i = 0; i < 20; i++) {
      const s = residentSpot(parcel, `uid${i}`, i % 3);
      expect(inside(ell, s) || s.join() === parcel.centroid.join()).toBe(true);
    }
  });
});
