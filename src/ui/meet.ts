import { dismissFollower, followerWaitMs, followerWalkLeftM, HOURS_TO_BEFRIEND, startFollowing, walkNeeded } from '../creatures/befriend';
import { formatDistance, formatDuration } from '../hud/format';
import { markSeen, type OwnedPet } from '../creatures/collection';
import { keptOfLine, lineOf } from '../creatures/roost';
import { getSpecies } from '../creatures/species';
import { individualFromSeed, STAT_NAMES, type Encounter, type StatKey } from '../creatures/stats';
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
  const line = lineOf(species.id);
  const kept = line ? keptOfLine(ctx.collection, line.id) : null;
  const upgrade = kept && h('p', { class: 'hint' }, `You keep a level ${kept.level} ${getSpecies(kept.speciesId).name}. If this one stays, the two become one: yours ${level > kept.level ? `grows to level ${level} and ` : ''}gets stronger.`);
  if (following)
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
    upgrade || '',
    h('p', { class: 'lore' }, `${species.epithet[0].toUpperCase()}${species.epithet.slice(1)}. It watches you from the margin of the map. Keep it with you for about ${hours} h and it may choose to stay. Walking ${need} m together wins it over far sooner.`),
    action,
  );
}

/** The Wildling following you now: how far along its trust is, and how to win it over sooner. */
export function openFollower(ctx: GameContext): void {
  const f = ctx.collection.follower;
  if (!f) return;
  const species = getSpecies(f.speciesId);
  const individual = individualFromSeed(f.seed, species.kind);
  const trust = Math.floor((100 * f.walkedM) / f.needM);
  const sheet = openSheet(`${individual.gilded ? '✦ Gilded ' : ''}${species.name}`, { className: 'sheet-meet' });
  sheet.body.append(
    h('div', { class: 'stage stage-small' }, createCreatureSvg({ speciesId: f.speciesId, seed: f.seed, size: 180 })),
    h('p', { class: 'encounter-info' }, h('strong', {}, `Lv ${f.level}`), ' ', elementBadge(species), ' ', rarityBadge(species)),
    h(
      'div',
      { class: 'trust' },
      h('span', { class: 'trust-label' }, h('span', {}, 'Trust'), h('b', {}, `${trust}%`)),
      h('span', { class: 'building-bar' }, h('span', { style: { width: `${trust}%` } })),
    ),
    h(
      'ul',
      { class: 'trust-ways' },
      h('li', {}, 'Stays in ', h('b', {}, formatDuration(followerWaitMs(f))), ' at your side, even with the app closed.'),
      h('li', {}, 'Or sooner: walk ', h('b', {}, formatDistance(followerWalkLeftM(f))), ' together.'),
      h('li', {}, 'Driving off Blotspawn builds trust too.'),
    ),
    h(
      'div',
      { class: 'actions' },
      h(
        'button',
        {
          class: 'btn',
          type: 'button',
          onclick: () => {
            dismissFollower(ctx.collection);
            ctx.changed();
            sheet.close();
            toast(`${species.name} wanders back into the margins.`);
          },
        },
        'Let it go',
      ),
      h('button', { class: 'btn btn-primary', type: 'button', onclick: () => sheet.close() }, 'Keep going'),
    ),
  );
}

/** The moment a follower decides to stay. */
export function openJoined(ctx: GameContext, pet: OwnedPet, upgraded = false, fromLevel = pet.level, gained: { stat: StatKey; amount: number } | null = null): void {
  const species = getSpecies(pet.speciesId);
  const sheet = openSheet(upgraded ? `${species.name} grows` : `${species.name} stays`, { className: 'sheet-meet' });
  sound.play('achievement');
  sheet.body.append(
    h('div', { class: 'stage stage-small' }, createCreatureSvg({ speciesId: pet.speciesId, seed: pet.seed, size: 180 })),
    h(
      'p',
      { class: 'lore' },
      upgraded
        ? `Your ${species.name} and the newcomer have become one: ${pet.level > fromLevel ? `level ${fromLevel} → ${pet.level}` : `still level ${pet.level}`}. You keep one of each kind.`
        : `After your time together, ${species.name} has decided to stay. It joins you at level ${pet.level}.`,
    ),
    upgraded
      ? h(
          'p',
          { class: 'stat-gains' },
          gained ? `${STAT_NAMES[gained.stat]} +${gained.amount}` : 'Its bonuses are already at their best.',
        )
      : '',
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
