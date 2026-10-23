import { describe, expect, it } from 'vitest';
import {
  ARRIVE_M,
  bearing,
  buyHint,
  chooseLandmark,
  compassPoint,
  finishHunt,
  HINT_WALK_M,
  huntClues,
  landmarkCategory,
  maskName,
  MAX_HINTS,
  metresToNextHint,
  newHuntLog,
  parseHuntLog,
  rollTreasure,
  searchArea,
  startHunt,
  walkHunt,
  warmth,
  type Landmark,
} from '../src/hunts/hunt';
import { haversine } from '../src/geo/distance';

const here = { lat: 55.9533, lng: -3.1883 };
const north = (m: number) => ({ lat: here.lat + m / 111_320, lng: here.lng });
const giles: Landmark = { id: 'landmark:giles', name: "St Giles' Cathedral", category: 'chapel', ...north(400) };

describe('treasure hunts', () => {
  it('maps OpenMapTiles POIs to landmark categories', () => {
    expect(landmarkCategory('place_of_worship')).toBe('chapel');
    expect(landmarkCategory('attraction', 'fountain')).toBe('fountain');
    expect(landmarkCategory('shop', 'bakery')).toBeUndefined();
  });

  it('prefers a landmark a good walk away and skips ones already found', () => {
    const near: Landmark = { ...giles, id: 'near', ...north(100) };
    const far: Landmark = { ...giles, id: 'far', ...north(2000) };
    expect(chooseLandmark(here, [near, giles, far], [], () => 0)?.id).toBe(giles.id);
    expect(chooseLandmark(here, [near, giles, far], [giles.id], () => 0)?.id).toBe('near');
    expect(chooseLandmark(here, [far], [])).toBeUndefined();
  });

  it('reveals clues by walking or by buying them, up to the last', () => {
    const hunt = startHunt(giles, here, 0);
    expect(huntClues(hunt)).toHaveLength(1);
    expect(walkHunt(hunt, HINT_WALK_M - 1)).toBe(0);
    expect(walkHunt(hunt, 1)).toBe(1);
    expect(huntClues(hunt)[1]).toContain('north');
    expect(buyHint(hunt)).toBe(true);
    expect(huntClues(hunt)[2]).toContain('begins with “S”');
    expect(metresToNextHint(hunt)).toBe(HINT_WALK_M);
    walkHunt(hunt, HINT_WALK_M * 10);
    expect(hunt.hints).toBe(MAX_HINTS);
    expect(huntClues(hunt)[3]).toContain("S_ G____' C________");
    expect(buyHint(hunt)).toBe(false);
  });

  it('masks names and points the compass', () => {
    expect(maskName('Old Town Hall')).toBe('O__ T___ H___');
    expect(compassPoint(bearing(here, north(300)))).toBe('north');
    expect(compassPoint(bearing(here, { lat: here.lat, lng: here.lng + 0.01 }))).toBe('east');
  });

  it('draws a search circle that always holds the landmark and shrinks', () => {
    const hunt = startHunt(giles, here, 0);
    let lastRadius = Infinity;
    for (let i = 0; i <= MAX_HINTS; i++) {
      hunt.hints = i;
      const area = searchArea(hunt);
      expect(haversine(area, giles)).toBeLessThan(area.radiusM);
      expect(area.radiusM).toBeLessThan(lastRadius);
      lastRadius = area.radiusM;
    }
  });

  it('tells warmer from colder and spots arrival', () => {
    const hunt = startHunt(giles, here, 0);
    expect(warmth(hunt, north(200)).warmth).toBe('warmer');
    expect(warmth(hunt, north(0)).warmth).toBe('colder');
    expect(warmth(hunt, north(400 - ARRIVE_M + 5)).warmth).toBe('found');
  });

  it('fills the chest richer when fewer clues were used', () => {
    const clean = startHunt(giles, here, 0);
    const helped = startHunt(giles, here, 0);
    helped.hints = MAX_HINTS;
    expect(rollTreasure(clean).xp).toBeGreaterThan(rollTreasure(helped).xp);
    expect(rollTreasure(clean).title).toBe('Gilded Chest');
  });

  it('logs a find and survives a save round trip', () => {
    const log = newHuntLog();
    log.active = startHunt(giles, here, 0);
    const restored = parseHuntLog(JSON.parse(JSON.stringify(log)));
    expect(restored.active?.landmark.name).toBe(giles.name);
    expect(finishHunt(restored, 5)).toBeDefined();
    expect(restored.active).toBeNull();
    expect(restored.found).toEqual([giles.id]);
    expect(restored.recent[0].name).toBe(giles.name);
    expect(parseHuntLog('junk')).toEqual(newHuntLog());
  });
});
