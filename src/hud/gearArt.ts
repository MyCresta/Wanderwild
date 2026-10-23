import { RARITIES, type GearItem, type Slot } from '../game/gear';

const SHAPES: Record<Slot, string> = {
  staff:
    '<path d="M30 10L14 54" stroke="#6b4a2a" stroke-width="4" stroke-linecap="round"/><circle cx="31" cy="10" r="6" fill="var(--g)" stroke="#2a1d10" stroke-width="1.5"/><path d="M25 6c-3 3-3 8 0 10M37 6c3 3 3 8 0 10" stroke="#2a1d10" stroke-width="1.4" fill="none"/>',
  cloak:
    '<path d="M32 8c-6 0-10 4-11 9L12 56h40L43 17c-1-5-5-9-11-9z" fill="var(--g)" stroke="#2a1d10" stroke-width="2" stroke-linejoin="round"/><path d="M24 18c4 4 12 4 16 0" stroke="#2a1d10" stroke-width="1.6" fill="none"/><circle cx="32" cy="22" r="2.5" fill="#f3d27a"/>',
  boots:
    '<path d="M18 10h14v30l16 6v8H14V44c0-4 4-6 4-10z" fill="var(--g)" stroke="#2a1d10" stroke-width="2" stroke-linejoin="round"/><path d="M18 18h14M14 50h34" stroke="#2a1d10" stroke-width="1.6"/>',
  lantern:
    '<path d="M26 10h12M32 4v6" stroke="#2a1d10" stroke-width="2.4" stroke-linecap="round"/><path d="M22 14h20l-2 34H24z" fill="#3b2a1a" stroke="#2a1d10" stroke-width="2"/><path d="M26 18h12l-1 26H27z" fill="#f3d27a"/><circle cx="32" cy="31" r="5" fill="var(--g)"/><path d="M20 50h24" stroke="#2a1d10" stroke-width="3" stroke-linecap="round"/>',
  charm:
    '<path d="M22 8q10 12 20 0" stroke="#6b4a2a" stroke-width="2" fill="none"/><path d="M32 18l12 14-12 22-12-22z" fill="var(--g)" stroke="#2a1d10" stroke-width="2" stroke-linejoin="round"/><path d="M32 18v36M20 32h24" stroke="#2a1d10" stroke-width="1" opacity=".5"/>',
};

/** A slot's item drawn in its rarity colour; +5 adds a gem, +10 a glowing aura. */
export function gearSvg(item: Pick<GearItem, 'slot' | 'rarity' | 'plus'> | { slot: Slot; rarity?: undefined; plus?: undefined }, size = 48): string {
  const color = item.rarity ? RARITIES[item.rarity].color : '#c9b79a';
  const plus = item.plus ?? 0;
  const aura = plus >= 10 ? `<circle cx="32" cy="32" r="29" fill="url(#aura-${item.rarity})" />` : '';
  const gem = plus >= 5 ? `<path d="M52 6l5 5-5 5-5-5z" fill="#9fe3d0" stroke="#2a1d10" stroke-width="1"/>` : '';
  return `<svg class="gear-svg${item.rarity ? '' : ' gear-empty'}" viewBox="0 0 64 64" width="${size}" height="${size}" aria-hidden="true" style="--g:${color}">
    <defs><radialGradient id="aura-${item.rarity ?? 'none'}"><stop offset="0.4" stop-color="${color}" stop-opacity="0.45"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient></defs>
    ${aura}${SHAPES[item.slot]}${gem}</svg>`;
}
