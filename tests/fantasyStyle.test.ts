import { describe, expect, it } from 'vitest';
import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec';
import { createFantasyStyle } from '../src/map/fantasyStyle';

describe('fantasy map style', () => {
  it('is a valid MapLibre style', () => {
    expect(validateStyleMin(createFantasyStyle()).map((e) => e.message)).toEqual([]);
  });

  it('uses only keyless OpenFreeMap endpoints', () => {
    const style = createFantasyStyle();
    const urls = [style.glyphs, ...Object.values(style.sources).map((s) => ('url' in s ? s.url : undefined))];
    for (const url of urls) expect(url).toMatch(/^https:\/\/tiles\.openfreemap\.org\//);
  });
});
