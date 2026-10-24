import { TONIC_HEAL } from '../creatures/battle';
import { companion, healPet, minutesToRested, partyPets, togglePartyMember, vigorNow, type OwnedPet } from '../creatures/collection';
import { getSpecies } from '../creatures/species';
import { createCreatureSvg } from '../creatures/view';
import type { GameContext } from '../ui/context';

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
    list.append(li);
  }
  host.replaceChildren(list);
  host.insertAdjacentHTML(
    'beforeend',
    '<p class="satchel-hint">Tap up to two more to fight beside your companion. Wounds last between fights: Wildlings rest back to full in about an hour.</p>',
  );
  // One tonic button for the most hurt party member, shown only when it can help.
  const way = ctx.wayfarer;
  const hurt = partyPets(c)
    .filter((p) => vigorNow(p) < 1)
    .sort((a, b) => vigorNow(a) - vigorNow(b))[0] as OwnedPet | undefined;
  if (way && hurt && way.tonics() > 0) {
    const heal = Math.round(TONIC_HEAL * (way.tonicPower?.() ?? 1));
    const tonic = document.createElement('button');
    tonic.type = 'button';
    tonic.className = 'btn btn-small party-tonic';
    tonic.textContent = `⚗ Tonic for ${getSpecies(hurt.speciesId).name} (+${heal}) · ×${way.tonics()}`;
    tonic.addEventListener('click', () => {
      if (!way.useTonic()) return;
      healPet(hurt, heal);
      ctx.changed();
      renderParty(host, ctx);
    });
    host.append(tonic);
  }
}
