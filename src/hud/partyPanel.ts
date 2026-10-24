import { companion, minutesToRested, partyPets, togglePartyMember, vigorNow } from '../creatures/collection';
import { getSpecies } from '../creatures/species';
import { createCreatureSvg } from '../creatures/view';
import type { GameContext } from '../ui/context';
import { tonicButton } from '../ui/tonics';

/** The party picker in the satchel: the companion always leads, tap others to bring two along. */
export function renderParty(host: HTMLElement, ctx: GameContext): void {
  const c = ctx.collection;
  const lead = companion(c);
  if (!lead) {
    host.innerHTML = '<p class="satchel-hint">Befriend a Wildling to start your party.</p>';
    return;
  }
  const inParty = new Set(partyPets(c).map((p) => p.uid));
  const list = document.createElement('ul');
  list.className = 'party-list';
  for (const pet of [...c.pets].sort((a, b) => b.level - a.level)) {
    const species = getSpecies(pet.speciesId);
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute('aria-pressed', String(inParty.has(pet.uid)));
    btn.append(createCreatureSvg({ speciesId: pet.speciesId, seed: pet.seed, size: 56 }));
    const vigor = vigorNow(pet);
    btn.insertAdjacentHTML(
      'beforeend',
      `<b>${species.name}</b><small>Lv ${pet.level}${pet.uid === lead.uid ? ' · leader' : ''}</small>` +
        `<span class="bench-hp" title="${Math.round(vigor * 100)}% health"><span style="width:${vigor * 100}%"></span></span>` +
        `<small class="pet-resting">${vigor < 1 ? `Rested in ${minutesToRested(pet)} min` : ''}</small>`,
    );
    btn.addEventListener('click', () => {
      togglePartyMember(c, pet.uid);
      ctx.changed();
      renderParty(host, ctx);
    });
    li.append(btn);
    const tonic = tonicButton(ctx, pet, () => renderParty(host, ctx));
    if (tonic) li.append(tonic);
    list.append(li);
  }
  host.replaceChildren(list);
  host.insertAdjacentHTML(
    'beforeend',
    `<p class="satchel-hint">Tap up to two more to fight beside your companion. Wounds last between fights: pets rest back to full in about an hour, or tap ⚗ under a hurt pet to give it a tonic${ctx.wayfarer ? ` (×${ctx.wayfarer.tonics()})` : ''}.</p>`,
  );
}
