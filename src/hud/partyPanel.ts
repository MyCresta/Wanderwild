import { minutesToRested, PARTY_SIZE, partyPets, setLeader, togglePartyMember, vigorNow, type OwnedPet } from '../creatures/collection';
import { getSpecies } from '../creatures/species';
import { createCreatureSvg } from '../creatures/view';
import type { GameContext } from '../ui/context';
import { tonicButton } from '../ui/tonics';

/** Name, level and health for a pet card, the same shape in the slots and the band. */
function petCard(btn: HTMLElement, pet: OwnedPet, tag: string): void {
  const vigor = vigorNow(pet);
  btn.append(createCreatureSvg({ speciesId: pet.speciesId, seed: pet.seed, size: 56 }));
  btn.insertAdjacentHTML(
    'beforeend',
    `<b>${getSpecies(pet.speciesId).name}</b><small>Lv ${pet.level}${tag}</small>` +
      `<span class="bench-hp" title="${Math.round(vigor * 100)}% health"><span style="width:${vigor * 100}%"></span></span>` +
      `<small class="pet-resting">${vigor < 1 ? `Rested in ${minutesToRested(pet)} min` : ''}</small>`,
  );
}

/**
 * The party picker on the Hero page: three slots, the first leads each fight. Any Wildlings
 * can fight, the companion or not. Tap a slot to lead with it, tap the band to add or remove.
 */
export function renderParty(host: HTMLElement, ctx: GameContext): void {
  const c = ctx.collection;
  const party = partyPets(c);
  if (!party.length) {
    host.innerHTML = '<p class="satchel-hint">Befriend a Wildling to start your party.</p>';
    return;
  }
  const rerender = () => {
    ctx.changed();
    renderParty(host, ctx);
  };

  const slots = document.createElement('ol');
  slots.className = 'party-list party-slots';
  for (let i = 0; i < PARTY_SIZE; i++) {
    const pet = party[i];
    const li = document.createElement('li');
    if (!pet) {
      li.className = 'party-slot-empty';
      li.textContent = 'Empty';
    } else {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = i === 0 ? 'party-slot-lead' : '';
      btn.setAttribute('aria-label', `${getSpecies(pet.speciesId).name}, ${i === 0 ? 'leads' : 'tap to lead'}`);
      petCard(btn, pet, i === 0 ? ' · leads' : '');
      if (i > 0)
        btn.addEventListener('click', () => {
          setLeader(c, pet.uid);
          rerender();
        });
      li.append(btn);
      const tonic = tonicButton(ctx, pet, () => renderParty(host, ctx));
      if (tonic) li.append(tonic);
    }
    slots.append(li);
  }

  const inParty = new Set(party.map((p) => p.uid));
  const full = party.length >= PARTY_SIZE;
  const list = document.createElement('ul');
  list.className = 'party-list';
  for (const pet of [...c.pets].sort((a, b) => b.level - a.level)) {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    const picked = inParty.has(pet.uid);
    btn.setAttribute('aria-pressed', String(picked));
    // A full party takes no more until one steps out; the last one cannot.
    btn.disabled = picked ? party.length === 1 : full;
    petCard(btn, pet, '');
    btn.addEventListener('click', () => {
      togglePartyMember(c, pet.uid);
      rerender();
    });
    li.append(btn);
    if (!picked) {
      const tonic = tonicButton(ctx, pet, () => renderParty(host, ctx));
      if (tonic) li.append(tonic);
    }
    list.append(li);
  }

  host.replaceChildren(slots);
  host.insertAdjacentHTML(
    'beforeend',
    `<p class="satchel-hint">The first slot leads each fight; tap another to lead with it. In battle you can still pick who opens, free.</p>` +
      `<h4 class="party-band-title">Band · tap to add or remove</h4>`,
  );
  host.append(list);
  host.insertAdjacentHTML(
    'beforeend',
    `<p class="satchel-hint">Wounds last between fights: Wildlings rest back to full in about an hour, or tap ⚗ to give one a tonic${ctx.wayfarer ? ` (×${ctx.wayfarer.tonics()})` : ''}.</p>`,
  );
}
