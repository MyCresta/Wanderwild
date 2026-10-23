import { describe, expect, it } from 'vitest';
import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec';
import { createFantasyStyle } from '../src/map/fantasyStyle';
import { FANTASY_IMAGE_NAMES } from '../src/map/fantasyImages';
import { LOCAL_FONTS, resolveGlyphUrl } from '../src/map/glyphs';

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

// Built glyph files, keyed like '../public/fonts/IM Fell English Regular/0-255.pbf'.
const glyphFiles = Object.keys(import.meta.glob('../public/fonts/*/*.pbf'));

describe('fantasy map art and fonts', () => {
  const layers = createFantasyStyle().layers as unknown as Array<{ id: string; layout?: Record<string, unknown>; paint?: Record<string, unknown> }>;

  /** Every string literal inside a (possibly expression-valued) property. */
  const strings = (value: unknown): string[] =>
    typeof value === 'string' ? [value] : Array.isArray(value) ? value.flatMap(strings) : [];

  it('only uses images that fantasyImages.ts draws', () => {
    const used = layers.flatMap((l) => [...strings(l.paint?.['fill-pattern']), ...strings(l.layout?.['icon-image'])]);
    const images = used.filter((name) => /^(pattern|icon)-/.test(name));
    expect(images.length).toBeGreaterThan(5);
    for (const name of images) expect(FANTASY_IMAGE_NAMES).toContain(name);
  });

  it('only uses fonts that have built glyph files', () => {
    const fonts = new Set(layers.flatMap((l) => strings(l.layout?.['text-font'])));
    expect(fonts.size).toBeGreaterThan(0);
    for (const font of fonts) {
      expect(Object.keys(LOCAL_FONTS)).toContain(font);
      for (const range of ['0-255', '8192-8447']) expect(glyphFiles).toContain(`../public/fonts/${font}/${range}.pbf`);
    }
  });

  it('serves local glyph ranges from the app and the rest from Noto Sans', () => {
    const base = 'https://example.com/Wanderwild/';
    const url = (range: string) => `https://tiles.openfreemap.org/fonts/IM%20Fell%20English%20Italic/${range}.pbf`;
    expect(resolveGlyphUrl(url('0-255'), base)).toBe('https://example.com/Wanderwild/fonts/IM%20Fell%20English%20Italic/0-255.pbf');
    expect(resolveGlyphUrl(url('1024-1279'), base)).toBe('https://tiles.openfreemap.org/fonts/Noto%20Sans%20Italic/1024-1279.pbf');
    expect(resolveGlyphUrl('https://tiles.openfreemap.org/fonts/Noto%20Sans%20Bold/0-255.pbf', base)).toBeNull();
  });
});
