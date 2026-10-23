import type { StyleSpecification, LayerSpecification } from '@maplibre/maplibre-gl-style-spec';

/**
 * A hand-made MapLibre style that renders OpenStreetMap vector tiles (OpenMapTiles
 * schema, served free and keyless by OpenFreeMap) as an old parchment map.
 */

export const TILE_SOURCE_URL = 'https://tiles.openfreemap.org/planet';
export const GLYPHS_URL = 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf';

// Faded, tea-stained inks: every colour is pulled toward sepia so the map reads as an old,
// much-handled chart rather than a fresh print.
export const palette = {
  parchment: '#e2cfa3',
  parchmentDark: '#d3bb8a',
  ink: '#3d2914',
  inkSoft: '#62482b',
  water: '#a9b49a',
  waterDeep: '#8b9a82',
  waterInk: '#4e5f52',
  forest: '#a3a172',
  forestDark: '#6e6c43',
  meadow: '#cdc48e',
  farmland: '#d9c793',
  sand: '#e0c992',
  wetland: '#afaf8a',
  rock: '#c4b190',
  ice: '#ebe5d2',
  settlement: '#d4bb88',
  building: '#cdaa76',
  buildingEdge: '#7d5c38',
  road: '#ecdcb3',
  roadCasing: '#6e5032',
  path: '#6e5032',
  rail: '#55412b',
  border: '#7a3a2c',
  halo: 'rgba(226, 207, 163, 0.75)',
} as const;

const SOURCE = 'openmaptiles';

// Layers are written loosely and checked against the style spec in tests/fantasyStyle.test.ts;
// the spec's TypeScript types are too strict for the shared expression helpers below.
type Layer = Record<string, unknown>;
// Storybook fonts, served from public/fonts with a Noto Sans fallback (see glyphs.ts).
const FONT_REGULAR = ['IM Fell English Regular'];
const FONT_ITALIC = ['IM Fell English Italic'];
const FONT_CAPS = ['IM Fell English SC Regular'];

const fill = (
  id: string,
  sourceLayer: string,
  filter: unknown,
  color: string,
  extra: Record<string, unknown> = {},
): Layer => ({
  id,
  type: 'fill',
  source: SOURCE,
  'source-layer': sourceLayer,
  filter,
  paint: { 'fill-color': color, ...extra },
});

/** A patterned fill that fades in from `minzoom`, drawn over the flat colour below it. */
const pattern = (id: string, sourceLayer: string, filter: unknown, image: string, minzoom: number): Layer => ({
  ...fill(id, sourceLayer, filter, ''),
  minzoom,
  paint: {
    'fill-pattern': image,
    'fill-opacity': ['interpolate', ['linear'], ['zoom'], minzoom, 0, minzoom + 1.5, 1],
  },
});

const classIn =(...classes: string[]) => ['match', ['get', 'class'], classes, true, false];

/** Line width that scales smoothly with zoom: [zoom, width] stops. */
const widthByZoom = (...stops: [number, number][]) => [
  'interpolate',
  ['exponential', 1.5],
  ['zoom'],
  ...stops.flat(),
];


/**
 * Road width by class and zoom. Zoom must be the outermost expression, so each zoom stop
 * holds a `match` over road classes: [zoom, [major, arterial, tertiary, minor]].
 */
const roadWidth = (...stops: [number, [number, number, number, number]][]) => [
  'interpolate',
  ['exponential', 1.5],
  ['zoom'],
  ...stops.flatMap(([zoom, [major, arterial, tertiary, minor]]) => [
    zoom,
    [
      'match',
      ['get', 'class'],
      ['motorway', 'trunk'],
      major,
      ['primary', 'secondary'],
      arterial,
      'tertiary',
      tertiary,
      minor,
    ],
  ]),
];

const layers: Layer[] = [
  { id: 'background', type: 'background', paint: { 'background-pattern': 'pattern-paper' } },

  // Land cover: forests, meadows, farmland and wilderness.
  fill('landcover-farmland', 'landcover', classIn('farmland'), palette.farmland, { 'fill-opacity': 0.7 }),
  fill('landcover-grass', 'landcover', classIn('grass'), palette.meadow, { 'fill-opacity': 0.75 }),
  fill('landcover-wetland', 'landcover', classIn('wetland'), palette.wetland, { 'fill-opacity': 0.8 }),
  fill('landcover-sand', 'landcover', classIn('sand'), palette.sand),
  fill('landcover-rock', 'landcover', classIn('rock'), palette.rock, { 'fill-opacity': 0.8 }),
  fill('landcover-ice', 'landcover', classIn('ice'), palette.ice),
  fill('landcover-wood', 'landcover', classIn('wood'), palette.forest, {
    'fill-opacity': ['interpolate', ['linear'], ['zoom'], 6, 0.6, 13, 0.85],
    'fill-outline-color': palette.forestDark,
  }),

  // Hand-drawn texture over the flat colours: tree stands, grass tufts, reeds, furrows, stipple
  // and little hatched mountains. Faded in so far-out views stay calm.
  pattern('texture-farmland', 'landcover', classIn('farmland'), 'pattern-farmland', 12),
  pattern('texture-grass', 'landcover', classIn('grass'), 'pattern-meadow', 12),
  pattern('texture-wetland', 'landcover', classIn('wetland'), 'pattern-marsh', 11),
  pattern('texture-sand', 'landcover', classIn('sand'), 'pattern-sand', 11),
  pattern('texture-rock', 'landcover', classIn('rock'), 'pattern-rock', 9),
  pattern('texture-wood', 'landcover', classIn('wood'), 'pattern-forest', 9),
  {
    // An inked edge around woodland, like the outline of a drawn forest.
    id: 'wood-edge',
    type: 'line',
    source: SOURCE,
    'source-layer': 'landcover',
    filter: classIn('wood'),
    minzoom: 11,
    paint: { 'line-color': palette.forestDark, 'line-width': widthByZoom([11, 0.5], [17, 1.6]), 'line-opacity': 0.7 },
  },

  // Settlements read as warm, slightly darker parchment.
  fill(
    'landuse-settlement',
    'landuse',
    classIn('residential', 'suburb', 'neighbourhood', 'quarter', 'commercial', 'retail', 'industrial'),
    palette.settlement,
    { 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 8, 0.25, 14, 0.45] },
  ),
  fill('landuse-cemetery', 'landuse', classIn('cemetery'), palette.wetland, { 'fill-opacity': 0.6 }),
  pattern('texture-cemetery', 'landuse', classIn('cemetery'), 'pattern-graves', 14),
  fill('park', 'park', true, palette.meadow, {
    'fill-opacity': 0.6,
    'fill-outline-color': palette.forestDark,
  }),
  pattern('texture-park', 'park', true, 'pattern-meadow', 13),

  // Water: lakes and seas with an inked shoreline.
  fill('water', 'water', ['!=', ['get', 'brunnel'], 'tunnel'], palette.water),
  {
    id: 'water-shore',
    type: 'line',
    source: SOURCE,
    'source-layer': 'water',
    paint: {
      'line-color': palette.waterInk,
      'line-width': widthByZoom([6, 0.6], [16, 2.2]),
      'line-opacity': 0.75,
      'line-blur': 0.5,
    },
  },
  pattern('texture-water', 'water', ['!=', ['get', 'brunnel'], 'tunnel'], 'pattern-waves', 10),
  // Fading ripple lines echoing the shore out into the water, the classic drawn-coast look.
  ...[
    [1.5, 4, 0.4],
    [3.5, 10, 0.25],
    [6, 17, 0.14],
  ].map(([near, far, opacity], i) => ({
    id: `water-ripple-${i + 1}`,
    type: 'line',
    source: SOURCE,
    'source-layer': 'water',
    minzoom: 10,
    paint: {
      'line-color': palette.waterInk,
      'line-width': 0.7,
      'line-offset': widthByZoom([10, near], [18, far]),
      'line-opacity': opacity,
    },
  })),
  {
    id: 'waterway',
    type: 'line',
    source: SOURCE,
    'source-layer': 'waterway',
    filter: ['!=', ['get', 'brunnel'], 'tunnel'],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': palette.waterDeep,
      'line-width': [
        'interpolate',
        ['exponential', 1.5],
        ['zoom'],
        8,
        ['match', ['get', 'class'], 'river', 1, 0],
        12,
        ['match', ['get', 'class'], 'river', 2.5, 0.5],
        18,
        ['match', ['get', 'class'], 'river', 10, 3],
      ],
    },
  },

  // Buildings as small inked blocks once you are close enough to see them: a dark offset
  // copy underneath fakes the drop shadow of a hand-drawn roof.
  {
    id: 'building-shadow',
    type: 'fill',
    source: SOURCE,
    'source-layer': 'building',
    minzoom: 14,
    paint: {
      'fill-color': palette.buildingEdge,
      'fill-translate': [1.5, 1.5],
      'fill-opacity': ['interpolate', ['linear'], ['zoom'], 14, 0, 15.5, 0.8],
    },
  },
  {
    id: 'building',
    type: 'fill',
    source: SOURCE,
    'source-layer': 'building',
    minzoom: 14,
    paint: {
      'fill-color': palette.building,
      'fill-opacity': ['interpolate', ['linear'], ['zoom'], 14, 0, 15.5, 1],
    },
  },
  {
    id: 'building-hatch',
    type: 'fill',
    source: SOURCE,
    'source-layer': 'building',
    minzoom: 15,
    paint: {
      'fill-pattern': 'pattern-hatch',
      'fill-opacity': ['interpolate', ['linear'], ['zoom'], 15, 0, 16, 0.9],
    },
  },
  {
    id: 'building-ink',
    type: 'line',
    source: SOURCE,
    'source-layer': 'building',
    minzoom: 15,
    paint: {
      'line-color': palette.ink,
      'line-width': widthByZoom([15, 0.5], [18, 1.2]),
      'line-opacity': ['interpolate', ['linear'], ['zoom'], 15, 0, 16, 0.75],
    },
  },

  // Roads: pale lanes with brown ink casings. Footpaths become dashed trails.
  {
    id: 'road-casing',
    type: 'line',
    source: SOURCE,
    'source-layer': 'transportation',
    filter: classIn('motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor', 'service'),
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': palette.roadCasing,
      'line-opacity': ['interpolate', ['linear'], ['zoom'], 5, 0.35, 12, 0.8],
      // A touch of blur reads as ink that has bled into the paper.
      'line-blur': 0.6,
      'line-width': roadWidth([5, [1, 0, 0, 0]], [10, [3, 2, 1.2, 0]], [14, [8, 6, 5, 2.5]], [18, [22, 18, 14, 10]]),
    },
  },
  {
    id: 'road',
    type: 'line',
    source: SOURCE,
    'source-layer': 'transportation',
    filter: classIn('motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor', 'service'),
    minzoom: 9,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': palette.road,
      'line-width': roadWidth([9, [0.5, 0, 0, 0]], [10, [1.5, 1, 0.4, 0]], [14, [6, 4.5, 3.5, 1.5]], [18, [18, 14, 11, 7]]),
    },
  },
  {
    id: 'trail',
    type: 'line',
    source: SOURCE,
    'source-layer': 'transportation',
    filter: classIn('path', 'track'),
    minzoom: 13,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': palette.path,
      'line-width': widthByZoom([13, 0.8], [18, 2.5]),
      'line-dasharray': [2, 1.5],
    },
  },
  {
    id: 'rail',
    type: 'line',
    source: SOURCE,
    'source-layer': 'transportation',
    filter: classIn('rail', 'transit'),
    minzoom: 10,
    paint: {
      'line-color': palette.rail,
      'line-width': widthByZoom([10, 0.6], [18, 2]),
      'line-dasharray': [4, 2],
    },
  },

  // Realm borders.
  {
    id: 'border',
    type: 'line',
    source: SOURCE,
    'source-layer': 'boundary',
    filter: ['all', ['<=', ['get', 'admin_level'], 4], ['!=', ['get', 'maritime'], 1]],
    paint: {
      'line-color': palette.border,
      'line-width': ['match', ['get', 'admin_level'], 2, 1.6, 0.8],
      'line-dasharray': [3, 1, 1, 1],
      'line-opacity': 0.7,
    },
  },

  // Labels.
  ...(['point', 'line'] as const).map((placement) => ({
    id: `water-name-${placement}`,
    type: 'symbol',
    source: SOURCE,
    'source-layer': 'water_name',
    filter: ['match', ['geometry-type'], ['LineString', 'MultiLineString'], placement === 'line', placement === 'point'],
    layout: {
      'text-field': ['coalesce', ['get', 'name:en'], ['get', 'name']],
      'text-font': FONT_ITALIC,
      'text-size': 13,
      'text-letter-spacing': 0.15,
      'symbol-placement': placement,
    },
    paint: { 'text-color': palette.waterInk, 'text-halo-color': palette.halo, 'text-halo-width': 1, 'text-halo-blur': 0.8 },
  })),
  {
    id: 'waterway-name',
    type: 'symbol',
    source: SOURCE,
    'source-layer': 'waterway',
    minzoom: 12,
    layout: {
      'text-field': ['get', 'name'],
      'text-font': FONT_ITALIC,
      'text-size': 12,
      'symbol-placement': 'line',
      'text-letter-spacing': 0.1,
    },
    paint: { 'text-color': palette.waterInk, 'text-halo-color': palette.halo, 'text-halo-width': 1, 'text-halo-blur': 0.8 },
  },
  {
    id: 'road-name',
    type: 'symbol',
    source: SOURCE,
    'source-layer': 'transportation_name',
    minzoom: 14,
    layout: {
      'text-field': ['get', 'name'],
      'text-font': FONT_REGULAR,
      'text-size': widthByZoom([14, 10], [18, 14]),
      'symbol-placement': 'line',
    },
    paint: { 'text-color': palette.inkSoft, 'text-halo-color': palette.halo, 'text-halo-width': 1.2, 'text-halo-blur': 0.8 },
  },
  {
    // Named parks and woods, lettered in italics like the forests on an old map.
    id: 'park-name',
    type: 'symbol',
    source: SOURCE,
    'source-layer': 'park',
    // The park layer carries a label point per park alongside its polygons.
    filter: ['all', ['has', 'name'], ['==', ['geometry-type'], 'Point']],
    minzoom: 13,
    layout: {
      'text-field': ['get', 'name'],
      'text-font': FONT_ITALIC,
      'text-size': 13,
      'text-letter-spacing': 0.05,
      'text-max-width': 7,
    },
    paint: { 'text-color': palette.forestDark, 'text-halo-color': palette.halo, 'text-halo-width': 1.2, 'text-halo-blur': 0.8 },
  },
  {
    id: 'peak',
    type: 'symbol',
    source: SOURCE,
    'source-layer': 'mountain_peak',
    minzoom: 10,
    layout: {
      'icon-image': 'icon-peak',
      'text-field': ['get', 'name'],
      'text-font': FONT_ITALIC,
      'text-size': 12,
      'text-anchor': 'top',
      'text-offset': [0, 0.9],
      'text-optional': true,
    },
    paint: { 'text-color': palette.inkSoft, 'text-halo-color': palette.halo, 'text-halo-width': 1, 'text-halo-blur': 0.8 },
  },
  {
    id: 'place-minor',
    type: 'symbol',
    source: SOURCE,
    'source-layer': 'place',
    filter: classIn('village', 'hamlet', 'suburb', 'neighbourhood', 'quarter', 'isolated_dwelling'),
    minzoom: 11,
    layout: {
      'icon-image': ['match', ['get', 'class'], ['village', 'hamlet'], 'icon-village', ''],
      'text-field': ['get', 'name'],
      'text-font': FONT_CAPS,
      'text-size': ['match', ['get', 'class'], 'village', 15, 13],
      'text-letter-spacing': 0.08,
      'text-anchor': ['match', ['get', 'class'], ['village', 'hamlet'], 'top', 'center'],
      'text-offset': ['match', ['get', 'class'], ['village', 'hamlet'], ['literal', [0, 0.7]], ['literal', [0, 0]]],
      'text-max-width': 8,
    },
    paint: { 'text-color': palette.inkSoft, 'text-halo-color': palette.halo, 'text-halo-width': 1.5, 'text-halo-blur': 0.8 },
  },
  {
    id: 'place-town',
    type: 'symbol',
    source: SOURCE,
    'source-layer': 'place',
    filter: classIn('town'),
    minzoom: 8,
    layout: {
      'text-field': ['get', 'name'],
      'text-font': FONT_CAPS,
      'icon-image': 'icon-town',
      'icon-anchor': 'bottom',
      'text-size': widthByZoom([8, 13], [14, 19]),
      'text-letter-spacing': 0.12,
      'text-anchor': 'top',
      'text-offset': [0, 0.2],
      'text-max-width': 8,
    },
    paint: { 'text-color': palette.ink, 'text-halo-color': palette.halo, 'text-halo-width': 1.5, 'text-halo-blur': 0.8 },
  },
  {
    id: 'place-city',
    type: 'symbol',
    source: SOURCE,
    'source-layer': 'place',
    filter: classIn('city'),
    layout: {
      'text-field': ['get', 'name'],
      'text-font': FONT_CAPS,
      'icon-image': 'icon-city',
      'icon-anchor': 'bottom',
      'icon-size': widthByZoom([4, 0.8], [12, 1.3]),
      'text-size': widthByZoom([4, 14], [12, 26]),
      'text-letter-spacing': 0.15,
      'text-anchor': 'top',
      'text-offset': [0, 0.2],
      'text-max-width': 8,
    },
    paint: { 'text-color': palette.ink, 'text-halo-color': palette.halo, 'text-halo-width': 2, 'text-halo-blur': 0.8 },
  },
  {
    id: 'place-realm',
    type: 'symbol',
    source: SOURCE,
    'source-layer': 'place',
    filter: classIn('country', 'state'),
    maxzoom: 8,
    layout: {
      'text-field': ['coalesce', ['get', 'name:en'], ['get', 'name']],
      'text-font': FONT_ITALIC,
      'text-size': ['match', ['get', 'class'], 'country', 16, 12],
      'text-transform': 'uppercase',
      'text-letter-spacing': 0.4,
    },
    paint: { 'text-color': palette.border, 'text-halo-color': palette.halo, 'text-halo-width': 1.5, 'text-halo-blur': 0.8 },
  },
];

export function createFantasyStyle(): StyleSpecification {
  return {
    version: 8,
    name: 'Wanderwild Old Parchment',
    glyphs: GLYPHS_URL,
    sources: {
      [SOURCE]: {
        type: 'vector',
        url: TILE_SOURCE_URL,
        attribution:
          '<a href="https://openfreemap.org" target="_blank">OpenFreeMap</a> © <a href="https://www.openmaptiles.org/" target="_blank">OpenMapTiles</a> Data from <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>',
      },
    },
    layers: layers as LayerSpecification[],
  };
}
