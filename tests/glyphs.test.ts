import { describe, expect, it } from 'vitest';
import { glyphSvg, simplify, Trace, TRACE_GAP_MS, type Glyph, type TracePoint } from '../src/game/glyphs';
import {
  baseRate,
  borderDistanceM,
  collectParcel,
  inkAt,
  INK_FADE_MS,
  leyNear,
  newParcel,
  overlaps,
  PARCEL_STORAGE_MS,
  realmShares,
  reink,
  samplePoints,
  tickParcel,
  waymarkSpawn,
} from '../src/game/demesne';
import { migrate, newSave } from '../src/game/save';
import { GameState } from '../src/game/state';

const HOME = { lat: 55.9533, lng: -3.1883 };
const KX = 111_320 * Math.cos((HOME.lat * Math.PI) / 180);
/** A point `x` metres east and `y` metres north of HOME. */
const at = (x: number, y: number, time: number): TracePoint => ({ lat: HOME.lat + y / 111_320, lng: HOME.lng + x / KX, time });

function walk(trace: Trace, xy: [number, number][], start = 0): Glyph[] {
  return xy.flatMap(([x, y], i) => trace.add(at(x, y, start + i * 8000)));
}

/** A circle of radius r walked in 10 m steps, ending back where it began. */
function circle(r: number, turns = 1): [number, number][] {
  const steps = Math.ceil((2 * Math.PI * r * turns) / 10);
  return Array.from({ length: steps + 1 }, (_, i) => {
    const a = (i / steps) * 2 * Math.PI * turns;
    return [r * Math.cos(a), r * Math.sin(a)] as [number, number];
  });
}

const line = (metres: number, dx = 1, dy = 0): [number, number][] =>
  Array.from({ length: Math.floor(metres / 10) + 1 }, (_, i) => [i * 10 * dx, i * 10 * dy]);

describe('glyph detection', () => {
  it('finds a Ring when a round loop closes', () => {
    const found = walk(new Trace(), circle(60));
    const rings = found.filter((g) => g.kind === 'ring');
    expect(rings).toHaveLength(1);
    expect(rings[0].areaM2).toBeGreaterThan(9000);
    expect(rings[0].areaM2).toBeLessThan(12_000);
    expect(rings[0].lengthM).toBeGreaterThanOrEqual(250);
    expect(rings[0].path.length).toBeGreaterThan(5);
  });

  it('does not count an out-and-back walk as a Ring', () => {
    const there = line(200);
    const back = there.slice().reverse().map(([x, y]) => [x, y + 15] as [number, number]);
    expect(walk(new Trace(), [...there, ...back]).some((g) => g.kind === 'ring')).toBe(false);
  });

  it('does not count a loop under 250 m', () => {
    expect(walk(new Trace(), circle(30)).some((g) => g.kind === 'ring')).toBe(false);
  });

  it('finds a Stroke after 300 m in a straight line, and again only after another 300 m', () => {
    const strokes = walk(new Trace(), line(650)).filter((g) => g.kind === 'stroke');
    expect(strokes).toHaveLength(2);
    expect(strokes[0].lengthM).toBeGreaterThanOrEqual(300);
  });

  it('does not count a zig-zag as a Stroke', () => {
    const zig = Array.from({ length: 60 }, (_, i) => [i * 6, i % 2 ? 25 : 0] as [number, number]);
    expect(walk(new Trace(), zig).some((g) => g.kind === 'stroke')).toBe(false);
  });

  it('finds a Knot after entering the same corner three times', () => {
    const trace = new Trace();
    const lap: [number, number][] = [[0, 0], [60, 0], [60, 60], [0, 60]];
    const found = walk(trace, [...lap, ...lap, [0, 0]]);
    const knots = found.filter((g) => g.kind === 'knot');
    expect(knots.length).toBeGreaterThanOrEqual(1);
  });

  it('forgets the trail after a long pause', () => {
    const trace = new Trace();
    walk(trace, circle(60).slice(0, 30));
    trace.add(at(0, 0, 30 * 8000 + TRACE_GAP_MS + 1));
    expect(trace.points).toHaveLength(1);
  });

  it('ignores GPS jitter', () => {
    const trace = new Trace();
    trace.add(at(0, 0, 0));
    trace.add(at(2, 1, 1000));
    trace.add(at(-1, 3, 2000));
    expect(trace.points).toHaveLength(1);
  });

  it('simplifies a straight run to its ends', () => {
    expect(simplify(line(100), 1)).toHaveLength(2);
  });

  it('draws each glyph as an svg', () => {
    const ring = walk(new Trace(), circle(60)).find((g) => g.kind === 'ring')!;
    expect(glyphSvg(ring)).toContain('<path d="M');
    expect(glyphSvg({ kind: 'knot', path: [] })).toContain('<svg');
  });
});

describe('the Inked Demesne', () => {
  const ring = walk(new Trace(), circle(60)).find((g) => g.kind === 'ring')!;

  it('turns realm samples into shares', () => {
    expect(realmShares(['wildwood', 'wildwood', 'tidemere', undefined], 'hearthfields')).toEqual({ wildwood: 2 / 3, tidemere: 1 / 3 });
    expect(realmShares([], 'stoneward')).toEqual({ stoneward: 1 });
  });

  it('samples points inside the parcel', () => {
    const pts = samplePoints(ring.path);
    expect(pts.length).toBeGreaterThan(8);
  });

  it('produces the materials of its realms and stops when full', () => {
    const p = newParcel(ring, { wildwood: 0.5, stoneward: 0.5 }, 0);
    tickParcel(p, [], 3_600_000);
    const hour = baseRate(p);
    expect(p.stored.ironbark).toBeCloseTo(hour / 2, 0);
    expect(p.stored.cobbleOre).toBeCloseTo(hour / 2, 0);
    tickParcel(p, [], 3 * 24 * 3_600_000);
    const total = (p.stored.ironbark ?? 0) + (p.stored.cobbleOre ?? 0);
    expect(total).toBeCloseTo(hour * (PARCEL_STORAGE_MS / 3_600_000), 0);
    const got = collectParcel(p);
    expect((got.ironbark ?? 0) + (got.cobbleOre ?? 0)).toBe(Math.floor(p.stored.ironbark! + got.ironbark!) + Math.floor(p.stored.cobbleOre! + got.cobbleOre!));
  });

  it('fades over a week and is re-inked by walking the border', () => {
    const p = newParcel(ring, { wildwood: 1 }, 0);
    expect(inkAt(p, INK_FADE_MS / 2)).toBeCloseTo(0.5);
    expect(inkAt(p, INK_FADE_MS * 2)).toBe(0);
    reink(p, p.perimeterM / 4, INK_FADE_MS / 2);
    expect(inkAt(p, INK_FADE_MS / 2)).toBeCloseTo(1);
    // Faded parcels make nothing.
    const q = newParcel(ring, { wildwood: 1 }, 0);
    q.lastTick = INK_FADE_MS * 2;
    tickParcel(q, [], INK_FADE_MS * 3);
    expect(q.stored.ironbark ?? 0).toBe(0);
  });

  it('knows how far a point is from the border', () => {
    const p = newParcel(ring, { wildwood: 1 }, 0);
    expect(borderDistanceM(p, at(60, 0, 0).lng, at(60, 0, 0).lat)).toBeLessThan(8);
    expect(borderDistanceM(p, HOME.lng, HOME.lat)).toBeGreaterThan(50);
  });

  it('boosts parcels near a live ley line', () => {
    const p = newParcel(ring, { wildwood: 1 }, 0);
    const near = { id: 'l', from: [HOME.lng, HOME.lat] as [number, number], to: [at(500, 0, 0).lng, HOME.lat] as [number, number], until: 10 * 3_600_000 };
    expect(leyNear(near, p.centroid)).toBe(true);
    tickParcel(p, [near], 3_600_000);
    expect(p.stored.ironbark).toBeCloseTo(baseRate(p) * 1.5, 0);
  });

  it('spots overlapping parcels', () => {
    const a = newParcel(ring, { wildwood: 1 }, 0);
    const other = walk(new Trace(), circle(60).map(([x, y]) => [x + 1000, y] as [number, number])).find((g) => g.kind === 'ring')!;
    expect(overlaps(a, newParcel(ring, {}, 1))).toBe(true);
    expect(overlaps(a, newParcel(other, {}, 1))).toBe(false);
  });

  it('puts the same creature on a Waymark for a whole window', () => {
    const w = { id: 'w1', lat: HOME.lat, lng: HOME.lng, setAt: 0 };
    expect(waymarkSpawn(w, 1000)).toEqual(waymarkSpawn(w, 2000));
    expect(waymarkSpawn(w, 1000).id).not.toBe(waymarkSpawn(w, 16 * 60_000).id);
  });
});

describe('casting glyphs', () => {
  const ring = walk(new Trace(), circle(60)).find((g) => g.kind === 'ring')!;

  it('claims a parcel from a Ring and redraws it from a second Ring', () => {
    const game = new GameState(newSave(0));
    const events: string[] = [];
    game.on((e) => e.kind === 'glyph' && events.push(e.text));
    game.castGlyph(ring, { wildwood: 1 }, 'wildwood', 0);
    expect(game.save.parcels).toHaveLength(1);
    expect(game.save.wayfarer.xp).toBe(100);
    expect(game.save.currencies.wanderlight).toBe(5);
    game.save.parcels[0].inkedAt = -INK_FADE_MS / 2;
    game.castGlyph(ring, { tidemere: 1 }, 'tidemere', 10);
    expect(game.save.parcels).toHaveLength(1);
    expect(game.save.parcels[0].inkedAt).toBe(10);
    expect(game.save.parcels[0].realms).toEqual({ tidemere: 1 });
    expect(events[1]).toContain('redrawn');
    expect(game.save.glyphsCast.ring).toBe(2);
  });

  it('caps the number of parcels by level', () => {
    const game = new GameState(newSave(0));
    for (let i = 0; i < 5; i++) {
      const r = walk(new Trace(), circle(60).map(([x, y]) => [x + i * 500, y] as [number, number])).find((g) => g.kind === 'ring')!;
      game.castGlyph(r, { wildwood: 1 }, 'wildwood', i);
    }
    expect(game.save.parcels).toHaveLength(3);
  });

  it('lays ley lines and Waymarks', () => {
    const game = new GameState(newSave(0));
    const [stroke] = walk(new Trace(), line(320)).filter((g) => g.kind === 'stroke');
    game.castGlyph(stroke, {}, undefined, 0);
    expect(game.save.leyLines).toHaveLength(1);
    game.castGlyph({ kind: 'knot', at: 0, path: [[HOME.lng, HOME.lat]], center: [HOME.lng, HOME.lat], lengthM: 0 }, {}, undefined, 0);
    expect(game.save.waymarks).toHaveLength(1);
  });

  it('re-inks a parcel when walking its border and collects its yield', () => {
    const game = new GameState(newSave(0));
    game.castGlyph(ring, { wildwood: 1 }, 'wildwood', 0);
    const p = game.save.parcels[0];
    p.inkedAt = -INK_FADE_MS / 2;
    const edge = at(60, 0, 0);
    game.walkBorders(edge.lat, edge.lng, p.perimeterM / 2, 0);
    expect(p.inkedAt).toBe(0);
    const got = game.collectParcel(p.id, 2 * 3_600_000);
    expect(got.ironbark).toBe(Math.floor(2 * baseRate(p)));
  });

  it('moves residents between parcels', () => {
    const game = new GameState(newSave(0));
    game.castGlyph(ring, { wildwood: 1 }, 'wildwood', 0);
    const other = walk(new Trace(), circle(60).map(([x, y]) => [x + 1000, y] as [number, number])).find((g) => g.kind === 'ring')!;
    game.castGlyph(other, { wildwood: 1 }, 'wildwood', 0);
    const [a, b] = game.save.parcels;
    game.toggleResident(a.id, 'pet1');
    game.toggleResident(b.id, 'pet1');
    expect(a.residents).toEqual([]);
    expect(b.residents).toEqual(['pet1']);
  });

  it('keeps the Demesne through a save round trip and upgrades v3 saves', () => {
    const game = new GameState(newSave(0));
    game.castGlyph(ring, { wildwood: 1 }, 'wildwood', 0);
    const back = migrate(JSON.parse(JSON.stringify(game.save)));
    expect(back.parcels[0].polygon).toEqual(game.save.parcels[0].polygon);
    expect(back.parcels[0].realms).toEqual({ wildwood: 1 });
    const old = migrate({ version: 3, distanceMetres: 10 });
    expect(old.version).toBe(4);
    expect(old.parcels).toEqual([]);
    expect(old.glyphsCast).toEqual({ ring: 0, stroke: 0, knot: 0 });
  });
});
