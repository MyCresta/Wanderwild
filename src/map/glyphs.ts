import type { RequestParameters, ResourceType } from 'maplibre-gl';

/**
 * The storybook label fonts are not on OpenFreeMap, so their glyphs are built into public/fonts
 * by scripts/build-glyphs.mjs. Characters outside those files (Greek, Cyrillic, most accented
 * letters beyond Latin-1) fall back to the matching Noto Sans face from OpenFreeMap.
 */
export const LOCAL_FONTS: Record<string, string> = {
  'IM Fell English Regular': 'Noto Sans Regular',
  'IM Fell English Italic': 'Noto Sans Italic',
  'IM Fell English SC Regular': 'Noto Sans Bold',
};

const LOCAL_RANGES = new Set(['0-255', '8192-8447']);
const GLYPH_URL = /\/fonts\/([^/]+)\/(\d+-\d+)\.pbf$/;

/** Rewrites a glyph request for one of the local fonts; returns null to leave it untouched. */
export function resolveGlyphUrl(url: string, baseUrl: string): string | null {
  const match = GLYPH_URL.exec(url);
  if (!match) return null;
  const stack = decodeURIComponent(match[1]);
  const fallback = LOCAL_FONTS[stack];
  if (!fallback) return null;
  const range = match[2];
  if (LOCAL_RANGES.has(range)) return new URL(`fonts/${encodeURIComponent(stack)}/${range}.pbf`, baseUrl).href;
  return url.replace(match[1], encodeURIComponent(fallback));
}

/** MapLibre `transformRequest` hook that serves the local glyphs. */
export function transformGlyphRequest(url: string, resourceType?: ResourceType): RequestParameters {
  if (resourceType === 'Glyphs') {
    const local = resolveGlyphUrl(url, document.baseURI);
    if (local) return { url: local };
  }
  return { url };
}
