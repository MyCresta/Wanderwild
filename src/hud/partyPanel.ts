import { companion, partyPets, togglePartyMember } from '../creatures/collection';
import { getSpecies } from '../creatures/species';
import { createCreatureSvg } from '../creatures/view';
import type { GameContext } from '../ui/context';

/** The party picker in the satchel: the companion always leads, tap others to bring two along. */
export function renderParty(host: HTMLElement, ctx: GameContext): void {
  const c = ctx.collection;
  const lead = companion(c);
  if (!lead) {
    host.innerHTML = '<p class="satchel-hint">Bind a Wildling to start your party.</p>';
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
    btn.insertAdjacentHTML(
      'beforeend',
      `<b>${species.name}</b><small>Lv ${pet.level}${pet.uid === lead.uid ? ' · leader' : ''}</small>`,
    );
    btn.addEventListener('click', () => {
      togglePartyMember(c, pet.uid);
      ctx.changed();
      renderParty(host, ctx);
    });
    li.append(btn);
    list.append(li);
  }
  host.replaceChildren(list);
  host.insertAdjacentHTML('beforeend', '<p class="satchel-hint">Tap up to two more to fight beside your companion.</p>');
}
