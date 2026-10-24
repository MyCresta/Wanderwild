import { TONIC_HEAL } from '../creatures/battle';
import { healPet, minutesToRested, vigorNow, type OwnedPet } from '../creatures/collection';
import { getSpecies } from '../creatures/species';
import { createCreatureSvg } from '../creatures/view';
import { sound } from '../audio/sound';
import type { GameContext } from './context';
import { h } from './dom';

/** What one tonic heals now, with any upgrades. */
export const tonicHeal = (ctx: GameContext) => Math.round(TONIC_HEAL * (ctx.wayfarer?.tonicPower?.() ?? 1));

/** Gives one tonic to a pet outside battle. Returns false when there is none or it is unhurt. */
export function giveTonic(ctx: GameContext, pet: OwnedPet): boolean {
  if (vigorNow(pet) >= 1 || !ctx.wayfarer?.useTonic()) return false;
  healPet(pet, tonicHeal(ctx));
  sound.play('reward');
  ctx.changed();
  return true;
}

/** A small "⚗ +35" button that heals this pet, or nothing when it is unhurt or tonics are out. */
export function tonicButton(ctx: GameContext, pet: OwnedPet, onHealed: () => void): HTMLButtonElement | null {
  if (vigorNow(pet) >= 1 || !ctx.wayfarer?.tonics()) return null;
  return h(
    'button',
    {
      class: 'tonic-btn',
      type: 'button',
      'aria-label': `Give ${getSpecies(pet.speciesId).name} a tonic`,
      onclick: (e: Event) => {
        e.stopPropagation();
        if (giveTonic(ctx, pet)) onHealed();
      },
    },
    `⚗ +${tonicHeal(ctx)}`,
  );
}

/**
 * The party's health, one row per pet, each hurt pet with its own tonic button. Shown
 * after a fight and before a boss, where healing is on the player's mind.
 */
export function healList(ctx: GameContext, pets: OwnedPet[]): HTMLElement {
  const host = h('div', { class: 'heal-list' });
  const render = () => {
    const tonics = ctx.wayfarer?.tonics() ?? 0;
    const hurt = pets.some((p) => vigorNow(p) < 1);
    host.replaceChildren(
      h(
        'ul',
        {},
        ...pets.map((p) => {
          const v = vigorNow(p);
          return h(
            'li',
            {},
            createCreatureSvg({ speciesId: p.speciesId, seed: p.seed, size: 40, still: true }),
            h(
              'span',
              { class: 'heal-name' },
              `${getSpecies(p.speciesId).name} · Lv ${p.level}`,
              h('span', { class: 'bench-hp', title: `${Math.round(v * 100)}% health` }, h('span', { style: { width: `${v * 100}%` } })),
            ),
            tonicButton(ctx, p, render) ?? h('small', { class: 'pet-resting' }, v < 1 ? `${minutesToRested(p)} min` : ''),
          );
        }),
      ),
      hurt ? h('p', { class: 'hint' }, tonics ? `⚗ ×${tonics} tonics. Tap one to heal that Wildling.` : 'No tonics left. Wildlings rest back to full in about an hour.') : '',
    );
  };
  render();
  return host;
}
