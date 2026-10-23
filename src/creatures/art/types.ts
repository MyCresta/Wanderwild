import type { Rng } from '../rng';

export interface ArtContext {
  rng: Rng;
  defs: SVGDefsElement;
  /** Colour that follows this individual's hue shift (or turns gold for a gilded one). */
  c: (h: number, s: number, l: number) => string;
  /** Colour that stays fixed, for eyes and other details. */
  fixed: (h: number, s: number, l: number) => string;
}

/** A drawn creature in a 200×200 box standing on y≈172, and the function that animates it. */
export interface Art {
  root: SVGGElement;
  /** Poses the creature at `t` seconds. */
  tick(t: number): void;
}

export type Drawer = (ctx: ArtContext) => Art;
