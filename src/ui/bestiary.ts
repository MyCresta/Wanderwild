import { addPet, companion, STARTERS, type OwnedPet } from '../creatures/collection';
import { hashString, mulberry32 } from '../creatures/rng';
import { ALL_SPECIES, ELEMENTS, getSpecies } from '../creatures/species';
import { individualFromSeed, MAX_LEVEL, statsAt, xpToNext } from '../creatures/stats';
import { createCreatureSvg } from '../creatures/view';
import { elementBadge, rarityBadge } from './badges';
import type { GameContext } from './context';
import { evolutionStatus } from '../creatures/evolution';
import { bandSize, releasePet } from '../creatures/befriend';
import { REALMS } from '../game/realms';
import { openEvolution } from './evolution';
import { h, openSheet, type Sheet } from './dom';
import { hint } from './hint';

/** Where the bestiary draws: a journal pane, with a title and a way to step aside for a scene. */
export type Page = Pick<Sheet, 'body' | 'setTitle' | 'close'>;

function petCard(pet: OwnedPet, isCompanion: boolean, onClick: () => void) {
  const species = getSpecies(pet.speciesId);
  const { gilded } = individualFromSeed(pet.seed, species.kind);
  const card = h(
    'button',
    { class: `pet-card${isCompanion ? ' pet-card-companion' : ''}`, type: 'button', onclick: onClick },
    createCreatureSvg({ speciesId: pet.speciesId, seed: pet.seed, size: 92 }),
    h('span', { class: 'pet-card-name' }, `${gilded ? '✦ ' : ''}${species.name}`),
    h('span', { class: 'pet-card-level' }, `Lv ${pet.level}`),
    isCompanion && h('span', { class: 'pet-card-tag' }, 'Companion'),
  );
  hint(card, !!evolutionStatus(pet)?.ready);
  return card;
}

function petDetail(ctx: GameContext, sheet: Page, pet: OwnedPet, back: () => void) {
  const species = getSpecies(pet.speciesId);
  const individual = individualFromSeed(pet.seed, species.kind);
  const stats = statsAt(species.base, pet.level, individual.trait);
  const isCompanion = companion(ctx.collection)?.uid === pet.uid;
  const maxed = pet.level >= MAX_LEVEL;
  const need = xpToNext(pet.level);
  sheet.setTitle(species.name);
  sheet.body.replaceChildren(
    h('button', { class: 'link-back', type: 'button', onclick: back }, '‹ All companions'),
    h('p', { class: 'epithet' }, species.epithet),
    h('div', { class: 'stage stage-small' }, createCreatureSvg({ speciesId: pet.speciesId, seed: pet.seed, size: 200 })),
    h(
      'p',
      { class: 'encounter-info' },
      h('strong', {}, `Lv ${pet.level}`),
      ' ',
      elementBadge(species),
      ' ',
      rarityBadge(species),
      individual.gilded && h('span', { class: 'badge badge-gilded' }, '✦ Gilded'),
      ' ',
      h('em', {}, individual.trait.name),
    ),
    h(
      'div',
      { class: 'xp' },
      h('span', { class: 'xp-track' }, h('span', { class: 'xp-fill', style: { width: maxed ? '100%' : `${(pet.xp / need) * 100}%` } })),
      h('small', {}, maxed ? 'Fully grown' : `${pet.xp} / ${need} XP to level ${pet.level + 1}`),
    ),
    h(
      'dl',
      { class: 'stats' },
      h('dt', {}, 'Vigour'),
      h('dd', {}, String(stats.hp)),
      h('dt', {}, 'Might'),
      h('dd', {}, String(stats.atk)),
      h('dt', {}, 'Guard'),
      h('dd', {}, String(stats.def)),
      h('dt', {}, 'Move'),
      h('dd', {}, `${ELEMENTS[species.element].glyph} ${species.move}`),
    ),
    h('p', { class: 'lore' }, species.lore),
    evolutionPanel(ctx, sheet, pet),
    h('p', { class: 'hint' }, 'Your companion walks beside you, earns experience as you walk (1 XP per 25 m) and fights Blotspawn.'),
    h(
      'div',
      { class: 'actions' },
      ctx.collection.pets.length > 1 &&
        h(
          'button',
          {
            class: 'btn',
            type: 'button',
            onclick: (e: Event) => {
              const btn = e.currentTarget as HTMLButtonElement;
              // Ask twice: it cannot be undone.
              if (!btn.dataset.sure) {
                btn.dataset.sure = '1';
                btn.textContent = `Really let ${species.name} go?`;
                return;
              }
              if (releasePet(ctx.collection, pet.uid)) {
                ctx.changed();
                back();
              }
            },
          },
          'Release to the wild',
        ),
      isCompanion
        ? h('span', { class: 'badge badge-companion' }, 'Walking with you')
        : h(
            'button',
            {
              class: 'btn btn-primary',
              type: 'button',
              onclick: () => {
                ctx.collection.companionUid = pet.uid;
                ctx.changed();
                petDetail(ctx, sheet, pet, back);
              },
            },
            'Walk together',
          ),
    ),
  );
}

function evolutionPanel(ctx: GameContext, sheet: Page, pet: OwnedPet) {
  const status = evolutionStatus(pet);
  if (!status) {
    const species = getSpecies(pet.speciesId);
    return species.kind === 'pet' && species.stage === 2 ? h('p', { class: 'hint' }, '✦ Fully evolved.') : '';
  }
  const { evolution, walked, ringed, ready } = status;
  const km = (m: number) => (m / 1000).toFixed(m < 1000 ? 2 : 1);
  return h(
    'div',
    { class: `evo-panel${ready ? ' evo-panel-ready' : ''}` },
    h('h3', {}, ready ? `Ready to evolve into ${status.into.name}!` : 'Evolution'),
    h(
      'p',
      {},
      `Reach level ${evolution.level} `,
      pet.level >= evolution.level ? '✓' : `(now ${pet.level})`,
      `, walk ${km(evolution.metres)} km in ${REALMS[evolution.realm].name} as your companion, and walk a Ring there together `,
      ringed ? '✓' : '(not yet)',
      '.',
    ),
    h('div', { class: 'xp' }, h('span', { class: 'xp-track' }, h('span', { class: 'xp-fill evo-fill', style: { width: `${(walked / evolution.metres) * 100}%` } })), h('small', {}, `${km(walked)} / ${km(evolution.metres)} km walked there`)),
    ready &&
      h(
        'button',
        {
          class: 'btn btn-primary evo-button',
          type: 'button',
          onclick: () => {
            sheet.close();
            openEvolution(ctx, pet);
          },
        },
        '✦ Evolve',
      ),
  );
}

/** Companions you have bound, and the bestiary of every species, drawn into `sheet`. */
export function renderBestiary(ctx: GameContext, sheet: Page): void {
  let tab: 'pets' | 'dex' = ctx.collection.pets.length ? 'pets' : 'dex';

  const render = () => {
    sheet.setTitle('Bestiary');
    const tabs = h(
      'div',
      { class: 'tabs', role: 'tablist' },
      h('button', { class: 'tab', type: 'button', role: 'tab', 'aria-selected': String(tab === 'pets'), onclick: () => ((tab = 'pets'), render()) }, `Band (${ctx.collection.pets.length}/${bandSize(ctx.wayfarer?.level() ?? 1)})`),
      h('button', { class: 'tab', type: 'button', role: 'tab', 'aria-selected': String(tab === 'dex'), onclick: () => ((tab = 'dex'), render()) }, `Bestiary (${ctx.collection.seen.length}/${ALL_SPECIES.length})`),
    );
    sheet.body.replaceChildren(tabs, tab === 'pets' ? petsTab() : dexTab());
  };

  const petsTab = () => {
    if (!ctx.collection.pets.length) return h('p', { class: 'hint' }, 'No companions yet. Meet a Wildling on the map and ask it to walk with you.');
    const current = companion(ctx.collection);
    const pets = [...ctx.collection.pets].sort((a, b) => Number(b.uid === current?.uid) - Number(a.uid === current?.uid) || b.level - a.level);
    return h('div', { class: 'pet-grid' }, ...pets.map((pet) => petCard(pet, pet.uid === current?.uid, () => petDetail(ctx, sheet, pet, render))));
  };

  const dexTab = () =>
    h(
      'div',
      { class: 'dex' },
      h('p', { class: 'hint' }, 'Wildlings join you after a long walk together. Blotspawn are spilled ink gone sour: send your companion to drive them off.'),
      ...ALL_SPECIES.map((species) => {
        const seen = ctx.collection.seen.includes(species.id);
        const owned = ctx.collection.pets.filter((p) => p.speciesId === species.id).length;
        return h(
          'article',
          { class: `dex-entry dex-${species.kind}` },
          createCreatureSvg({ speciesId: species.id, seed: 1, size: 84, silhouette: !seen, still: !seen }),
          h(
            'div',
            {},
            h('h3', {}, seen ? species.name : '???'),
            h('p', { class: 'dex-meta' }, species.kind === 'monster' ? 'Blotspawn' : species.stage === 2 ? 'Evolved Wildling' : 'Wildling', ' ', elementBadge(species), ' ', rarityBadge(species), owned > 0 && h('span', { class: 'badge badge-companion' }, `×${owned}`)),
            h('p', { class: 'lore' }, seen ? species.lore : 'Not yet met. Walk further.'),
          ),
        );
      }),
    );

  render();
}

/** First launch: pick one of three starter Wildlings. */
export function openStarterChoice(ctx: GameContext): void {
  const sheet = openSheet('Choose a first companion', { closable: false, className: 'sheet-starter' });
  sheet.body.append(
    h('p', { class: 'lore' }, 'The old maps are waking, and their margins are spilling into the streets. Three Wildlings have crept out of yours. Which will walk with you?'),
    h(
      'div',
      { class: 'starters' },
      ...STARTERS.map((id) => {
        const species = getSpecies(id);
        const seed = Math.floor(mulberry32(Date.now() ^ hashString(id))() * 2 ** 32);
        return h(
          'button',
          {
            class: 'starter',
            type: 'button',
            onclick: () => {
              addPet(ctx.collection, { species, level: 3, seed });
              ctx.changed();
              sheet.close();
            },
          },
          createCreatureSvg({ speciesId: id, seed, size: 110 }),
          h('strong', {}, species.name),
          elementBadge(species),
          h('small', {}, species.epithet),
        );
      }),
    ),
  );
}
