import { CLASSES, LOOKS, type HeroClass } from '../game/hero';

const INK = '#2a1d10';

/** What each class carries, drawn over the cloaked figure. */
function prop(cls: HeroClass | null, trim: string): string {
  switch (cls) {
    case 'warden':
      return `<path d="M5 30q0-4 8-6 8 2 8 6 0 9-8 14-8-5-8-14z" fill="${trim}" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/>
        <path d="M13 26v16M8 32h10" stroke="${CLASSES.warden.color}" stroke-width="2" stroke-linecap="round"/>`;
    case 'arcanist':
      return `<path d="M39 14l-2 38" stroke="#6b4a2a" stroke-width="2.4" stroke-linecap="round"/>
        <circle cx="39" cy="11" r="4.5" fill="${trim}" stroke="${INK}" stroke-width="1.3"/>
        <circle class="hero-orb" cx="39" cy="11" r="7.5" fill="${trim}" opacity=".3"/>`;
    case 'beastcaller':
      return `<path d="M16 9q-5-6-3-10M16 9q-8-2-10-6M32 9q5-6 3-10M32 9q8-2 10-6" fill="none" stroke="#6b4a2a" stroke-width="2" stroke-linecap="round"/>
        <path d="M38 22q6 10 0 22" fill="none" stroke="#6b4a2a" stroke-width="2.2" stroke-linecap="round"/>
        <path d="M38 22l0 22" stroke="${trim}" stroke-width=".9"/>`;
    default:
      return `<path d="M38 14l-2 38" stroke="#6b4a2a" stroke-width="2.4" stroke-linecap="round"/>
        <circle cx="38" cy="12" r="3" fill="#f3d27a" stroke="${INK}" stroke-width="1.1"/>`;
  }
}

/**
 * The hero as a small drawn figure: a hooded wayfarer in the look's colours, holding the
 * class's shield, staff or bow. Returns trusted SVG markup.
 */
export function heroSvg(cls: HeroClass | null, look: number, size = 48): string {
  const l = LOOKS[cls ?? 'beastcaller'][look] ?? LOOKS.beastcaller[0];
  return `<svg class="hero-art hero-${cls ?? 'none'}" viewBox="0 0 48 56" width="${size}" height="${(size * 56) / 48}" aria-hidden="true">
    <ellipse cx="24" cy="53" rx="13" ry="2.5" fill="${INK}" opacity=".18"/>
    <path d="M24 5c-8 0-12 6-12 13 0 4 1 6 2 8l-6 25c5 2 10 3 16 3s11-1 16-3l-6-25c1-2 2-4 2-8 0-7-4-13-12-13z"
      fill="${l.cloak}" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>
    <path d="M14 46c6 2 14 2 20 0" fill="none" stroke="${l.trim}" stroke-width="2" stroke-linecap="round"/>
    <path d="M24 26v20" stroke="${l.trim}" stroke-width="1.4" opacity=".8"/>
    <path d="M16 18c2-6 14-6 16 0-1 6-4 9-8 9s-7-3-8-9z" fill="${l.skin}" stroke="${INK}" stroke-width="1.4"/>
    <path d="M15 17c3-3 15-3 18 0l-1-4c-3-3-13-3-16 0z" fill="${INK}" opacity=".55"/>
    <circle cx="21" cy="20" r="1.2" fill="${INK}"/><circle cx="27" cy="20" r="1.2" fill="${INK}"/>
    ${prop(cls, l.trim)}
  </svg>`;
}
