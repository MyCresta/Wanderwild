import { hashString } from '../../game/rng';
import type { Rival } from '../../game/rivals';

const INK = '#1c0f26';

/** Robe, sash and eye-glow colours; each rival wears one, picked from their name. */
const ROBES = [
  { robe: '#3b2a4a', sash: '#7a3b8f', glow: '#d58cff' },
  { robe: '#2f3a3f', sash: '#4f7d86', glow: '#8ff0ff' },
  { robe: '#4a2c26', sash: '#8e2b22', glow: '#ff9a6b' },
  { robe: '#2d3324', sash: '#5c6b2e', glow: '#d6ff7a' },
  { robe: '#3a3550', sash: '#5b4fa0', glow: '#b4a8ff' },
] as const;

/**
 * An Inkbinder as a small drawn figure: a hooded scribe in an ink-stained robe, eyes glowing
 * under the hood, a great quill raised and an ink pot at the hip, the hem dripping Blot.
 * Archbinders wear gold trim and keep an open grimoire floating beside them.
 * Returns trusted SVG markup.
 */
export function inkbinderSvg(rival: Pick<Rival, 'name' | 'grade'>, size = 64): string {
  const c = ROBES[hashString(rival.name) % ROBES.length];
  const arch = rival.grade === 'arch';
  const trim = arch ? '#e0b94a' : c.sash;
  const tome = arch
    ? `<g class="inkbinder-tome">
        <path d="M0 27l6-2 6 2v7l-6-2-6 2z" fill="#efe2c2" stroke="${INK}" stroke-width="1.2" stroke-linejoin="round"/>
        <path d="M6 25v7" stroke="${INK}" stroke-width=".9"/>
        <path d="M1.5 28.5h3M7.5 28.5h3M1.5 30.5h2.5M7.5 30.5h3" stroke="${c.sash}" stroke-width=".8"/>
        <ellipse cx="6" cy="37" rx="5" ry="1.2" fill="${c.glow}" opacity=".45"/>
      </g>`
    : '';
  return `<svg class="inkbinder inkbinder-${rival.grade}" viewBox="0 0 48 60" width="${size}" height="${(size * 60) / 48}" aria-hidden="true">
    <ellipse cx="24" cy="57" rx="15" ry="2.8" fill="${INK}" opacity=".35"/>
    <path d="M24 4c-8 0-13 7-13 14 0 4 1 7 2 9l-7 26c6 2 12 3 18 3s12-1 18-3l-7-26c1-2 2-5 2-9 0-7-5-14-13-14z"
      fill="${c.robe}" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>
    <path d="M9 52q2 4 3 0q2 5 4 0M33 54q1 4 3 0q2 3 3-1" fill="none" stroke="${INK}" stroke-width="2.2" stroke-linecap="round"/>
    <path d="M12 49c8 3 16 3 24 0" fill="none" stroke="${trim}" stroke-width="2.2" stroke-linecap="round"/>
    <path d="M15 30c6 3 12 3 18 0" fill="none" stroke="${trim}" stroke-width="2" stroke-linecap="round"/>
    <path d="M16 31c-1 4-3 8-6 11" fill="none" stroke="${INK}" stroke-width="1.2" opacity=".5"/>
    <path d="M14 19c2-8 18-8 20 0-1 6-5 9-10 9s-9-3-10-9z" fill="${INK}"/>
    <circle cx="20.5" cy="20" r="1.6" fill="${c.glow}"/><circle cx="27.5" cy="20" r="1.6" fill="${c.glow}"/>
    <circle cx="20.5" cy="20" r="3.2" fill="${c.glow}" opacity=".25"/><circle cx="27.5" cy="20" r="3.2" fill="${c.glow}" opacity=".25"/>
    <path d="M12 10l-3-4M36 10l3-4" stroke="${INK}" stroke-width="1.6" stroke-linecap="round" opacity=".6"/>
    <g class="inkbinder-quill">
      <path d="M38 40L46 4" stroke="${INK}" stroke-width="1.6" stroke-linecap="round"/>
      <path d="M46 4c-6 4-8 12-7 22 2-1 4-3 5-6-1-2 0-4 2-4 1-4 1-8 0-12z" fill="#efe2c2" stroke="${INK}" stroke-width="1.1" stroke-linejoin="round"/>
      <circle cx="38" cy="41" r="1.4" fill="${c.glow}"/>
    </g>
    <circle cx="35" cy="38" r="3.5" fill="${trim}" stroke="${INK}" stroke-width="1.4"/>
    <rect x="12" y="33" width="6" height="7" rx="1.5" fill="#20141c" stroke="${INK}" stroke-width="1.2"/>
    <rect x="13" y="31.5" width="4" height="2" fill="${trim}" stroke="${INK}" stroke-width=".8"/>
    <path d="M15 40q0 3 1 4" stroke="${INK}" stroke-width="1.4" stroke-linecap="round"/>
    ${tome}
  </svg>`;
}
