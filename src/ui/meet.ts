import { bandFull, bandSize, dismissFollower, HOURS_TO_BEFRIEND, startFollowing, walkNeeded } from '../creatures/befriend';
import { markSeen, type OwnedPet } from '../creatures/collection';
import { getSpecies } from '../creatures/species';
import { individualFromSeed, type Encounter } from '../creatures/stats';
import { createCreatureSvg } from '../creatures/view';
import { elementBadge, rarityBadge } from './badges';
import type { GameContext } from './context';
import { h, openSheet, toast } from './dom';
import { sound } from '../audio/sound';

/**
 * Meeting a wild Wildling, in person or by Farsight. There is nothing to throw and nothing to trace:
 * ask it along, and it decides to stay after a few hours at your side, or much sooner if you walk together.
 */
export function openMeeting(ctx: GameContext, spawnId: string, encounter: Encounter, onFollow: () => void): void {
  const { species, level, seed } = encounter;
  const individual = individualFromSeed(seed, species.kind);
  markSeen(ctx.collection, species.id);
  ctx.changed();
  const sheet = openSheet(`${individual.gilded ? '✦ Gilded ' : ''}${species.name}`, { className: 'sheet-meet' });
  const wayfarerLevel = ctx.wayfarer?.level() ?? 1;
  const following = ctx.collection.follower;
  const charm = ctx.wayfarer?.gear().catchBonus ?? 0;
  const need = walkNeeded(species.rarity, charm);
  const hours = Math.round(HOURS_TO_BEFRIEND[species.rarity] * (need / walkNeeded(species.rarity)));

  const follow = () => {
    if (following) dismissFollower(ctx.collection);
    if (!startFollowing(ctx.collection, spawnId, encounter, charm)) return;
    sound.play('discover');
    ctx.changed();
    sheet.close();
    toast(`${species.name} falls in beside you. It stays in about ${hours} h, or after ${need} m walked together.`);
    onFollow();
  };

  let action: Node;
  if (bandFull(ctx.collection, wayfarerLevel))
    action = h('p', { class: 'hint' }, `Your band is full (${ctx.collection.pets.length}/${bandSize(wayfarerLevel)}). Release a companion in the bestiary to make room, or grow as a Wayfarer.`);
  else if (following)
    action = h(
      'div',
      { class: 'actions' },
      h('p', { class: 'hint' }, `${getSpecies(following.speciesId).name} is already with you.`),
      h('button', { class: 'btn', type: 'button', onclick: follow }, `Take ${species.name} instead`),
    );
  else action = h('div', { class: 'actions' }, h('button', { class: 'btn btn-primary', type: 'button', onclick: follow }, 'Come with me'));

  sheet.body.append(
    h('div', { class: 'stage stage-small' }, createCreatureSvg({ speciesId: species.id, seed, size: 180 })),
    h('p', { class: 'encounter-info' }, h('strong', {}, `Lv ${level}`), ' ', elementBadge(species), ' ', rarityBadge(species)),
    h('p', { class: 'lore' }, `${species.epithet[0].toUpperCase()}${species.epithet.slice(1)}. It watches you from the margin of the map. Keep it with you for about ${hours} h and it may choose to stay. Walking ${need} m together wins it over far sooner.`),
    action,
  );
}

/** The moment a follower decides to stay. */
export function openJoined(ctx: GameContext, pet: OwnedPet): void {
  const species = getSpecies(pet.speciesId);
  const sheet = openSheet(`${species.name} stays`, { className: 'sheet-meet' });
  sound.play('achievement');
  sheet.body.append(
    h('div', { class: 'stage stage-small' }, createCreatureSvg({ speciesId: pet.speciesId, seed: pet.seed, size: 180 })),
    h('p', { class: 'lore' }, `After your time together, ${species.name} has decided to stay. It joins your band at level ${pet.level}.`),
    h(
      'div',
      { class: 'actions' },
      ctx.collection.companionUid === pet.uid
        ? ''
        : h(
            'button',
            {
              class: 'btn',
              type: 'button',
              onclick: () => {
                ctx.collection.companionUid = pet.uid;
                ctx.changed();
                sheet.close();
              },
            },
            'Make it my companion',
          ),
      h('button', { class: 'btn btn-primary', type: 'button', onclick: () => sheet.close() }, 'Welcome'),
    ),
  );
}
