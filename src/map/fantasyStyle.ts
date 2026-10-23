import type { StyleSpecification, LayerSpecification } from '@maplibre/maplibre-gl-style-spec';

/**
 * A hand-made MapLibre style that renders OpenStreetMap vector tiles (OpenMapTiles
 * schema, served free and keyless by OpenFreeMap) as an old parchment map.
 */

export const TILE_SOURCE_URL = 'https://tiles.openfreemap.org/planet';
export const GLYPHS_URL = 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf';

export const palette = {
  parchment: '#e8d9b5',
  parchmentDark: '#d9c59a',
  ink: '#3b2a1a',
  inkSoft: '#6b5236',
  water: '#9db7b0',
  waterDeep: '#7fa19b',
  waterInk: '#4f716c',
  forest: '#8fa070',
  forestDark: '#6f8455',
  meadow: '#c9c98f',
  farmland: '#d8cc98',
  sand: '#e3cf9a',
  wetland: '#a9b795',
  rock: '#c2b49a',
  ice: '#eef0ea',
  settlement: '#dcc79c',
  building: '#c7ad80',
  buildingEdge: '#9c8158',
  road: '#f3e8cc',
  roadCasing: '#8a6c47',
  path: '#7a5b3a',
  rail: '#5a4632',
  border: '#7b3f3f',
  halo: 'rgba(232, 217, 181, 0.85)',
} as const;

const SOURCE = 'openmaptiles';

// Layers are written loosely and checked against the style spec in tests/fantasyStyle.test.ts;
// the spec's TypeScript types are too strict for the shared expression helpers below.
type Layer = Record<string, unknown>;
const FONT_REGULAR = ['Noto Sans Regular'];
const FONT_BOLD = ['Noto Sans Bold'];
const FONT_ITALIC = ['Noto Sans Italic'];

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

const classIn = (...classes: string[]) => ['match', ['get', 'class'], classes, true, false];

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
  { id: 'background', type: 'background', paint: { 'background-color': palette.parchment } },

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

  // Settlements read as warm, slightly darker parchment.
  fill(
    'landuse-settlement',
    'landuse',
    classIn('residential', 'suburb', 'neighbourhood', 'quarter', 'commercial', 'retail', 'industrial'),
    palette.settlement,
    { 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 8, 0.4, 14, 0.7] },
  ),
  fill('landuse-cemetery', 'landuse', classIn('cemetery'), palette.wetland, { 'fill-opacity': 0.6 }),
  fill('park', 'park', true, palette.meadow, {
    'fill-opacity': 0.6,
    'fill-outline-color': palette.forestDark,
  }),

  // Water: lakes and seas with an inked shoreline.
  fill('water', 'water', ['!=', ['get', 'brunnel'], 'tunnel'], palette.water),
  {
    id: 'water-shore',
    type: 'line',
    source: SOURCE,
    'source-layer': 'water',
    paint: {
      'line-color': palette.waterInk,
      'line-width': widthByZoom([6, 0.4], [16, 1.6]),
      'line-opacity': 0.6,
    },
  },
  {
    // A faint second shoreline, offset into the water, like hand-drawn ripples.
    id: 'water-ripple',
    type: 'line',
    source: SOURCE,
    'source-layer': 'water',
    minzoom: 10,
    paint: {
      'line-color': palette.waterInk,
      'line-width': 0.6,
      'line-offset': widthByZoom([10, 1.5], [18, 6]),
      'line-opacity': 0.3,
    },
  },
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

  // Buildings as small inked blocks once you are close enough to see them.
  {
    id: 'building',
    type: 'fill',
    source: SOURCE,
    'source-layer': 'building',
    minzoom: 14,
    paint: {
      'fill-color': palette.building,
      'fill-outline-color': palette.buildingEdge,
      'fill-opacity': ['interpolate', ['linear'], ['zoom'], 14, 0, 15.5, 0.9],
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
      'line-opacity': ['interpolate', ['linear'], ['zoom'], 5, 0.4, 12, 0.9],
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
    paint: { 'text-color': palette.waterInk, 'text-halo-color': palette.halo, 'text-halo-width': 1 },
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
    paint: { 'text-color': palette.waterInk, 'text-halo-color': palette.halo, 'text-halo-width': 1 },
  },
  {
    id: 'road-name',
    type: 'symbol',
    source: SOURCE,
    'source-layer': 'transportation_name',
    minzoom: 14,
    layout: {
      'text-field': ['get', 'name'],
      'text-font': FONT_ITALIC,
      'text-size': widthByZoom([14, 10], [18, 14]),
      'symbol-placement': 'line',
    },
    paint: { 'text-color': palette.inkSoft, 'text-halo-color': palette.halo, 'text-halo-width': 1.2 },
  },
  {
    id: 'peak',
    type: 'symbol',
    source: SOURCE,
    'source-layer': 'mountain_peak',
    minzoom: 10,
    layout: {
      'text-field': ['concat', '▲ ', ['get', 'name']],
      'text-font': FONT_ITALIC,
      'text-size': 11,
    },
    paint: { 'text-color': palette.inkSoft, 'text-halo-color': palette.halo, 'text-halo-width': 1 },
  },
  {
    id: 'place-minor',
    type: 'symbol',
    source: SOURCE,
    'source-layer': 'place',
    filter: classIn('village', 'hamlet', 'suburb', 'neighbourhood', 'quarter', 'isolated_dwelling'),
    minzoom: 11,
    layout: {
      'text-field': ['get', 'name'],
      'text-font': FONT_REGULAR,
      'text-size': ['match', ['get', 'class'], 'village', 13, 11],
      'text-transform': 'uppercase',
      'text-letter-spacing': 0.2,
    },
    paint: { 'text-color': palette.inkSoft, 'text-halo-color': palette.halo, 'text-halo-width': 1.5 },
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
      'text-font': FONT_BOLD,
      'text-size': widthByZoom([8, 11], [14, 16]),
      'text-transform': 'uppercase',
      'text-letter-spacing': 0.25,
    },
    paint: { 'text-color': palette.ink, 'text-halo-color': palette.halo, 'text-halo-width': 1.5 },
  },
  {
    id: 'place-city',
    type: 'symbol',
    source: SOURCE,
    'source-layer': 'place',
    filter: classIn('city'),
    layout: {
      'text-field': ['get', 'name'],
      'text-font': FONT_BOLD,
      'text-size': widthByZoom([4, 12], [12, 22]),
      'text-transform': 'uppercase',
      'text-letter-spacing': 0.3,
    },
    paint: { 'text-color': palette.ink, 'text-halo-color': palette.halo, 'text-halo-width': 2 },
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
    paint: { 'text-color': palette.border, 'text-halo-color': palette.halo, 'text-halo-width': 1.5 },
  },
];

export function createFantasyStyle(): StyleSpecification {
  return {
    version: 8,
    name: 'Wanderwild Parchment',
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
