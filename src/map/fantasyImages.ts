import type { Map } from 'maplibre-gl';

/**
 * Hand-drawn-looking map art (tree stands, waves, reeds, castles) painted on a canvas at
 * runtime, so the style needs no sprite sheet. Patterns tile seamlessly; a seeded random
 * keeps them identical on every load.
 */

const PIXEL_RATIO = 2;
const INK = '#3b2a1a';

type Ctx = CanvasRenderingContext2D;
type Painter = (ctx: Ctx, rand: () => number) => void;

interface Art {
  width: number;
  height: number;
  paint: Painter;
}

/** Mulberry32: tiny deterministic PRNG. */
function seeded(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Scatters `count` items over a `size` tile on a jittered grid, repeating across the edges. */
function scatter(size: number, count: number, rand: () => number, draw: (x: number, y: number, i: number) => void): void {
  const cols = Math.ceil(Math.sqrt(count));
  const cell = size / cols;
  const points: [number, number][] = [];
  for (let i = 0; i < count; i++) {
    const cx = (i % cols) + 0.15 + rand() * 0.7;
    const cy = Math.floor(i / cols) + 0.15 + rand() * 0.7;
    // Offset odd rows like a brick wall so the stand doesn't read as a grid.
    points.push([((cx + (Math.floor(i / cols) % 2) * 0.5) * cell) % size, cy * cell]);
  }
  // Sort top to bottom so nearer trees overlap farther ones.
  points.sort((a, b) => a[1] - b[1]);
  points.forEach(([x, y], i) => {
    for (const dy of [-size, 0, size]) for (const dx of [-size, 0, size]) draw(x + dx, y + dy, i);
  });
}

function inkStroke(ctx: Ctx, width = 1, color = INK, alpha = 1): void {
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function deciduous(ctx: Ctx, x: number, y: number, r: number, rand: () => number): void {
  // Trunk.
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y + r * 0.9);
  inkStroke(ctx, 1.2);
  // Lumpy crown: three overlapping blobs.
  ctx.beginPath();
  const lumps: [number, number, number][] = [
    [x - r * 0.45, y - r * 0.05, r * 0.6],
    [x + r * 0.45, y - r * 0.05, r * 0.6],
    [x + (rand() - 0.5) * r * 0.3, y - r * 0.5, r * 0.68],
  ];
  for (const [lx, ly, lr] of lumps) {
    ctx.moveTo(lx + lr, ly);
    ctx.arc(lx, ly, lr, 0, Math.PI * 2);
  }
  ctx.fillStyle = rand() < 0.5 ? '#7d9460' : '#6e8752';
  ctx.fill();
  inkStroke(ctx, 1);
  // Shaded side.
  ctx.beginPath();
  ctx.arc(x + r * 0.25, y - r * 0.2, r * 0.55, -0.2, Math.PI * 0.7);
  inkStroke(ctx, 0.8, INK, 0.45);
}

function conifer(ctx: Ctx, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x, y - r * 1.4);
  ctx.lineTo(x + r * 0.55, y - r * 0.5);
  ctx.lineTo(x + r * 0.3, y - r * 0.5);
  ctx.lineTo(x + r * 0.75, y + r * 0.4);
  ctx.lineTo(x - r * 0.75, y + r * 0.4);
  ctx.lineTo(x - r * 0.3, y - r * 0.5);
  ctx.lineTo(x - r * 0.55, y - r * 0.5);
  ctx.closePath();
  ctx.fillStyle = '#5f7a4c';
  ctx.fill();
  inkStroke(ctx, 1);
  ctx.beginPath();
  ctx.moveTo(x, y + r * 0.4);
  ctx.lineTo(x, y + r * 0.85);
  inkStroke(ctx, 1.2);
}

function tuft(ctx: Ctx, x: number, y: number, s: number, color: string, alpha: number): void {
  ctx.beginPath();
  ctx.moveTo(x - s, y - s * 0.9);
  ctx.quadraticCurveTo(x - s * 0.4, y - s * 0.2, x - s * 0.2, y);
  ctx.moveTo(x, y - s * 1.3);
  ctx.lineTo(x, y);
  ctx.moveTo(x + s, y - s * 0.9);
  ctx.quadraticCurveTo(x + s * 0.4, y - s * 0.2, x + s * 0.2, y);
  inkStroke(ctx, 0.9, color, alpha);
}

function mountain(ctx: Ctx, x: number, y: number, w: number, h: number, fill: string): void {
  ctx.beginPath();
  ctx.moveTo(x - w / 2, y);
  ctx.lineTo(x - w * 0.08, y - h);
  ctx.lineTo(x + w * 0.05, y - h * 0.85);
  ctx.lineTo(x + w / 2, y);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  inkStroke(ctx, 1.1);
  // Hatching on the shadowed slope.
  ctx.beginPath();
  for (let i = 1; i <= 4; i++) {
    const t = i / 5;
    const sx = x - w * 0.08 + (w * 0.58) * t;
    const sy = y - h + h * t;
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx - w * 0.12, y);
  }
  inkStroke(ctx, 0.7, INK, 0.55);
}

/** A soft round blot that fades to nothing at its rim, for stains and mottling. */
function blot(ctx: Ctx, x: number, y: number, r: number, color: string, alpha: number): void {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color);
  g.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.globalAlpha = alpha;
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

const ART: Record<string, Art> = {
  // Aged paper for the whole map: mottled tea stains, darker age spots and stray fibres.
  'pattern-paper': {
    width: 160,
    height: 160,
    paint(ctx, rand) {
      ctx.fillStyle = '#e2cfa3';
      ctx.fillRect(0, 0, 160, 160);
      scatter(160, 9, rand, (x, y, i) => blot(ctx, x, y, 26 + (i % 3) * 10, i % 2 ? '#c9ab74' : '#f0e2bf', 0.35));
      scatter(160, 16, rand, (x, y, i) => blot(ctx, x, y, 2 + (i % 4), '#9a7344', 0.18));
      scatter(160, 14, rand, (x, y, i) => {
        const a = (i * 2.39) % Math.PI;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x + Math.cos(a) * 4, y + Math.sin(a) * 4 + 1.5, x + Math.cos(a) * 9, y + Math.sin(a) * 9);
        inkStroke(ctx, 0.4, '#8a6c47', 0.25);
      });
    },
  },
  // Engraver's hatching laid over buildings, like inked roofs on an old town plan.
  'pattern-hatch': {
    width: 8,
    height: 8,
    paint(ctx) {
      ctx.beginPath();
      for (let i = -8; i <= 8; i += 4) {
        ctx.moveTo(i, 8);
        ctx.lineTo(i + 8, 0);
      }
      inkStroke(ctx, 0.6, INK, 0.3);
    },
  },
  'pattern-forest': {
    width: 56,
    height: 56,
    paint(ctx, rand) {
      scatter(56, 9, rand, (x, y, i) => (i % 4 === 3 ? conifer(ctx, x, y, 5.5) : deciduous(ctx, x, y, 6, seeded(i + 1))));
    },
  },
  'pattern-meadow': {
    width: 48,
    height: 48,
    paint(ctx, rand) {
      scatter(48, 5, rand, (x, y) => tuft(ctx, x, y, 2.6, '#5c6b3a', 0.55));
    },
  },
  'pattern-marsh': {
    width: 48,
    height: 48,
    paint(ctx, rand) {
      scatter(48, 6, rand, (x, y, i) => {
        ctx.beginPath();
        ctx.moveTo(x - 6, y + 1.5);
        ctx.lineTo(x + 6, y + 1.5);
        ctx.moveTo(x - 3, y + 4);
        ctx.lineTo(x + 3, y + 4);
        inkStroke(ctx, 0.8, '#4f716c', 0.6);
        if (i % 2 === 0) tuft(ctx, x, y, 3, '#4d5a32', 0.7);
      });
    },
  },
  'pattern-farmland': {
    width: 24,
    height: 24,
    paint(ctx) {
      ctx.beginPath();
      for (let i = -24; i < 48; i += 6) {
        ctx.moveTo(i, 24);
        ctx.lineTo(i + 24, 0);
      }
      inkStroke(ctx, 0.6, '#8a6c47', 0.35);
    },
  },
  'pattern-sand': {
    width: 32,
    height: 32,
    paint(ctx, rand) {
      ctx.fillStyle = '#8a6c47';
      ctx.globalAlpha = 0.45;
      scatter(32, 16, rand, (x, y) => {
        ctx.beginPath();
        ctx.arc(x, y, 0.6, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;
    },
  },
  'pattern-rock': {
    width: 64,
    height: 64,
    paint(ctx, rand) {
      scatter(64, 6, rand, (x, y, i) => mountain(ctx, x, y + 6, 14 + (i % 3) * 3, 10 + (i % 2) * 4, '#d4c5a6'));
    },
  },
  'pattern-waves': {
    width: 72,
    height: 72,
    paint(ctx, rand) {
      scatter(72, 6, rand, (x, y) => {
        ctx.beginPath();
        ctx.moveTo(x - 6, y);
        ctx.quadraticCurveTo(x - 3, y - 3, x, y);
        ctx.quadraticCurveTo(x + 3, y - 3, x + 6, y);
        inkStroke(ctx, 0.9, '#4f716c', 0.5);
      });
    },
  },
  'pattern-graves': {
    width: 32,
    height: 32,
    paint(ctx, rand) {
      scatter(32, 4, rand, (x, y) => {
        ctx.beginPath();
        ctx.moveTo(x, y - 3);
        ctx.lineTo(x, y + 3);
        ctx.moveTo(x - 2, y - 1);
        ctx.lineTo(x + 2, y - 1);
        inkStroke(ctx, 0.9, INK, 0.6);
      });
    },
  },

  'icon-peak': {
    width: 26,
    height: 20,
    paint(ctx) {
      mountain(ctx, 13, 18, 22, 15, '#e3d5b4');
      // Snow cap.
      ctx.beginPath();
      ctx.moveTo(8.6, 7.5);
      ctx.lineTo(11.2, 3);
      ctx.lineTo(13.6, 5.2);
      ctx.lineTo(12, 6.5);
      ctx.lineTo(10.4, 6);
      ctx.closePath();
      ctx.fillStyle = '#fbf6ea';
      ctx.fill();
    },
  },
  'icon-village': {
    width: 18,
    height: 16,
    paint(ctx) {
      ctx.beginPath();
      ctx.rect(4, 7, 10, 7);
      ctx.fillStyle = '#e8d9b5';
      ctx.fill();
      inkStroke(ctx, 1.1);
      ctx.beginPath();
      ctx.moveTo(2, 8);
      ctx.lineTo(9, 2);
      ctx.lineTo(16, 8);
      ctx.closePath();
      ctx.fillStyle = '#9c4a32';
      ctx.fill();
      inkStroke(ctx, 1.1);
      ctx.beginPath();
      ctx.rect(8, 10, 2.4, 4);
      ctx.fillStyle = INK;
      ctx.fill();
    },
  },
  'icon-town': {
    width: 22,
    height: 26,
    paint(ctx) {
      tower(ctx, 11, 24, 10, 16);
      flag(ctx, 11, 4);
    },
  },
  'icon-city': {
    width: 34,
    height: 30,
    paint(ctx) {
      // Curtain wall between two towers, keep in the middle.
      ctx.beginPath();
      ctx.rect(6, 17, 22, 11);
      ctx.fillStyle = '#e3d3ad';
      ctx.fill();
      inkStroke(ctx, 1.1);
      tower(ctx, 6, 28, 8, 15);
      tower(ctx, 28, 28, 8, 15);
      tower(ctx, 17, 28, 10, 21);
      flag(ctx, 17, 3);
      ctx.beginPath();
      ctx.arc(17, 25, 2.5, Math.PI, 0);
      ctx.lineTo(19.5, 28);
      ctx.lineTo(14.5, 28);
      ctx.closePath();
      ctx.fillStyle = INK;
      ctx.fill();
    },
  },
};

function tower(ctx: Ctx, x: number, base: number, w: number, h: number): void {
  const top = base - h;
  ctx.beginPath();
  ctx.moveTo(x - w / 2, base);
  ctx.lineTo(x - w / 2, top);
  // Crenellations.
  const merlons = 3;
  const step = w / (merlons * 2 - 1);
  for (let i = 0; i < merlons * 2 - 1; i++) {
    const mx = x - w / 2 + step * i;
    if (i % 2 === 0) {
      ctx.lineTo(mx + step, top);
      if (i < merlons * 2 - 2) ctx.lineTo(mx + step, top + 2.5);
    } else {
      ctx.lineTo(mx + step, top + 2.5);
      ctx.lineTo(mx + step, top);
    }
  }
  ctx.lineTo(x + w / 2, base);
  ctx.closePath();
  ctx.fillStyle = '#eadcb8';
  ctx.fill();
  inkStroke(ctx, 1.1);
  ctx.beginPath();
  ctx.rect(x - 1, top + 5, 2, 3);
  ctx.fillStyle = INK;
  ctx.fill();
}

function flag(ctx: Ctx, x: number, top: number): void {
  ctx.beginPath();
  ctx.moveTo(x, top + 6);
  ctx.lineTo(x, top);
  inkStroke(ctx, 1);
  ctx.beginPath();
  ctx.moveTo(x, top);
  ctx.lineTo(x + 6, top + 1.5);
  ctx.lineTo(x, top + 3);
  ctx.closePath();
  ctx.fillStyle = '#9c2f2f';
  ctx.fill();
}

function render(art: Art, seed: number): ImageData {
  const canvas = document.createElement('canvas');
  canvas.width = art.width * PIXEL_RATIO;
  canvas.height = art.height * PIXEL_RATIO;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(PIXEL_RATIO, PIXEL_RATIO);
  art.paint(ctx, seeded(seed));
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

export const FANTASY_IMAGE_NAMES = Object.keys(ART);

/** Registers every map image now, and again whenever the style asks for a missing one. */
export function installFantasyImages(map: Map): void {
  const add = (name: string) => {
    const art = ART[name];
    if (!art || map.hasImage(name)) return;
    map.addImage(name, render(art, name.length * 7919), { pixelRatio: PIXEL_RATIO });
  };
  map.on('styleimagemissing', (e) => add(e.id));
  map.on('style.load', () => FANTASY_IMAGE_NAMES.forEach(add));
}
