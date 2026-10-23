// Builds MapLibre glyph files (signed distance fields in PBF) for the map's storybook fonts.
// OpenFreeMap only serves Noto Sans, so the IM Fell English labels are rendered here once
// and shipped in public/fonts. Re-run with `npm run glyphs` after changing fonts or ranges.
//
// Rendering happens in headless Chromium with TinySDF, using the same settings as MapLibre's
// own glyph server tooling (24px, 3px buffer, radius 8), so the output drops straight in.
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PbfWriter } from 'pbf';
import { chromium } from 'playwright-core';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public', 'fonts');

const FONTS = [
  { stack: 'IM Fell English Regular', file: '@fontsource/im-fell-english/files/im-fell-english-latin-400-normal.woff2', style: 'normal' },
  { stack: 'IM Fell English Italic', file: '@fontsource/im-fell-english/files/im-fell-english-latin-400-italic.woff2', style: 'italic' },
  { stack: 'IM Fell English SC Regular', file: '@fontsource/im-fell-english-sc/files/im-fell-english-sc-latin-400-normal.woff2', style: 'normal' },
];

// Only the ranges the fonts actually cover. Other ranges fall back to Noto Sans (see glyphs.ts).
const range = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => from + i);
const RANGES = {
  '0-255': range(32, 126).concat(range(160, 255)),
  '8192-8447': range(0x2000, 0x206f).concat([0x20ac, 0x2122, 0x2191, 0x2193, 0x2212, 0x2215]),
};

// MapLibre places SDF glyphs relative to this baseline offset (see its glyph_manager).
const TOP_ADJUSTMENT = 27;

const tinySdfSource = readFileSync(require.resolve('@mapbox/tiny-sdf'), 'utf8').replace(
  'export default class TinySDF',
  'window.TinySDF = class TinySDF',
);

const executablePath = process.env.CHROMIUM_PATH;
const browser = await chromium.launch(executablePath ? { executablePath } : {});
const page = await browser.newPage();
await page.addScriptTag({ content: tinySdfSource });

for (const font of FONTS) {
  const data = readFileSync(require.resolve(font.file)).toString('base64');
  const family = `Glyphs ${font.stack}`;
  for (const [name, codes] of Object.entries(RANGES)) {
    const glyphs = await page.evaluate(
      async ({ family, data, style, codes }) => {
        const face = new FontFace(family, `url(data:font/woff2;base64,${data})`, { style });
        document.fonts.add(await face.load());
        const sdf = new window.TinySDF({ fontSize: 24, buffer: 3, radius: 8, cutoff: 0.25, fontFamily: `"${family}"`, fontStyle: style });
        return codes.map((id) => {
          const g = sdf.draw(String.fromCodePoint(id));
          return {
            id,
            bitmap: g.glyphWidth > 0 ? Array.from(g.data) : [],
            width: g.glyphWidth,
            height: g.glyphHeight,
            left: g.glyphLeft,
            top: g.glyphTop,
            advance: Math.round(g.glyphAdvance),
          };
        });
      },
      { family, data, style: font.style, codes },
    );

    const pbf = new PbfWriter();
    pbf.writeMessage(1, (_, p) => {
      p.writeStringField(1, font.stack);
      p.writeStringField(2, name);
      for (const g of glyphs) {
        p.writeMessage(3, (_, q) => {
          q.writeVarintField(1, g.id);
          if (g.bitmap.length) q.writeBytesField(2, Uint8Array.from(g.bitmap));
          q.writeVarintField(3, g.width);
          q.writeVarintField(4, g.height);
          q.writeSVarintField(5, g.left);
          q.writeSVarintField(6, g.top - TOP_ADJUSTMENT);
          q.writeVarintField(7, g.advance);
        });
      }
    });

    const dir = join(outDir, font.stack);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `${name}.pbf`), pbf.finish());
    console.log(`${font.stack} ${name}: ${glyphs.length} glyphs`);
  }
}

await browser.close();
