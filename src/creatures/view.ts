import { EVOLVED_ART } from './art/evolved';
import { MONSTER_ART } from './art/monsters';
import { PET_ART } from './art/pets';
import type { Art } from './art/types';
import { mulberry32 } from './rng';
import { getSpecies } from './species';
import { individualFromSeed } from './stats';
import { el, SVG_NS } from './svg';

export interface CreatureOptions {
  speciesId: string;
  seed: number;
  /** Pixel size of the square drawing. */
  size?: number;
  /** -1 mirrors the creature to face left. */
  facing?: 1 | -1;
  /** Draw as a dark shape, for species not yet met. */
  silhouette?: boolean;
  /** Freeze on one pose instead of animating. */
  still?: boolean;
}

const hsl = (h: number, s: number, l: number) =>
  `hsl(${(((h % 360) + 360) % 360).toFixed(1)} ${Math.min(100, Math.max(0, s)).toFixed(0)}% ${Math.min(100, Math.max(0, l)).toFixed(0)}%)`;

interface Live {
  svg: SVGSVGElement;
  art: Art;
  start: number;
  attached: boolean;
  /** Whether it stands on the map, under any sheet or scene that opens. */
  onMap: boolean;
  /** Whether any of it is on screen; nothing is redrawn for creatures nobody can see. */
  visible: boolean;
}

const live = new Set<Live>();
const bySvg = new WeakMap<Element, Live>();
let frame = 0;
const reducedMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

const seen =
  typeof IntersectionObserver === 'function'
    ? new IntersectionObserver((entries) => {
        for (const entry of entries) {
          const item = bySvg.get(entry.target);
          if (item) item.visible = entry.isIntersecting;
        }
      })
    : null;

/** A sheet or scene over the map: map creatures underneath can rest until it closes. */
const mapCovered = () => !!document.body?.querySelector(':scope > .sheet-backdrop, :scope > .catch-scene');

let beat = 0;

function loop(now: number): void {
  const covered = mapCovered();
  // Small map creatures idle at half rate, which reads the same and halves the redraws on the busiest screen.
  const mapBeat = (beat++ & 1) === 0;
  for (const item of live) {
    if (item.svg.isConnected) {
      if (!item.attached) {
        item.attached = true;
        item.onMap = !!item.svg.closest('#map');
        seen?.observe(item.svg);
      }
    } else if (item.attached) {
      live.delete(item);
      seen?.unobserve(item.svg);
      continue;
    }
    if (item.attached && item.visible && !(item.onMap && (covered || !mapBeat))) item.art.tick((now - item.start) / 1000);
  }
  frame = live.size ? requestAnimationFrame(loop) : 0;
}

/** Draws a creature as a self-animating SVG. It stops animating once removed from the page. */
export function createCreatureSvg(options: CreatureOptions): SVGSVGElement {
  const { speciesId, seed, size = 160, facing = 1, silhouette = false, still = false } = options;
  const species = getSpecies(speciesId);
  const individual = individualFromSeed(seed, species.kind);
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 200 200');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('class', `creature creature-${species.kind}${silhouette ? ' creature-silhouette' : ''}${individual.gilded && !silhouette ? ' creature-gilded' : ''}`);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', silhouette ? 'Unknown creature' : `${individual.gilded ? 'Gilded ' : ''}${species.name}`);
  const defs = el('defs');
  svg.appendChild(defs);

  const draw = species.kind === 'pet' ? (PET_ART[species.id] ?? EVOLVED_ART[species.id]) : MONSTER_ART[species.id];
  const shift = individual.hueShift;
  const art = draw({
    rng: mulberry32(seed),
    defs,
    c: individual.gilded
      ? (_h, s, l) => hsl(44 + (l - 50) * 0.1, Math.max(55, s * 0.9), l * 0.95 + 4)
      : (h, s, l) => hsl(h + shift, s, l),
    fixed: hsl,
  });
  const holder = el('g', facing < 0 ? { transform: 'translate(200 0) scale(-1 1)' } : {});
  holder.appendChild(art.root);
  svg.appendChild(holder);

  art.tick(0.6);
  if (!still && !reducedMotion) {
    const item: Live = { svg, art, start: performance.now() - Math.random() * 4000, attached: false, onMap: false, visible: true };
    live.add(item);
    bySvg.set(svg, item);
    if (!frame) frame = requestAnimationFrame(loop);
  }
  return svg;
}
