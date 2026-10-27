/**
 * The Wayfarer as a hero, in the spirit of Heroes of Might and Magic: a class picked at the
 * start (a second at level 20), three stats that quietly strengthen every creature in the
 * party, spells cast from mana that fills by walking (and slowly on its own), and rows of two-way talent choices.
 * Pure rules only; the hero page and the battle screen read from here.
 */

export type HeroClass = 'warden' | 'arcanist' | 'beastcaller';
export type HeroSpellId = 'mending' | 'aegis' | 'secondWind' | 'wheelbolt' | 'hex' | 'starfall' | 'frenzy' | 'wildcall' | 'packHowl';
export type Stat = 'might' | 'ward' | 'lore';

export const HERO_CLASSES: HeroClass[] = ['warden', 'arcanist', 'beastcaller'];
export const SECOND_CLASS_LEVEL = 20;
/** Hero levels at which a class's three spells are learned; a second class learns its own from level 20. */
const SPELL_LEVELS = [1, 6, 12];
const SECOND_SPELL_LEVELS = [20, 25, 32];
/** Hero levels at which each talent row opens, for the first class and then the second. */
const TALENT_LEVELS = [5, 10, 15];
const SECOND_TALENT_LEVELS = [22, 28, 35];
/** Walking this far fills one point of mana. */
export const METRES_PER_MANA = 25;
/** Mana also comes back on its own, one point this often: walking is the quick way, never the only one. */
export const MS_PER_MANA = 6 * 60 * 1000;
export const BASE_MANA = 20;

export interface ClassDef {
  name: string;
  glyph: string;
  color: string;
  blurb: string;
  /** Stat points gained per hero level. */
  growth: Record<Stat, number>;
  spells: HeroSpellId[];
}

export const CLASSES: Record<HeroClass, ClassDef> = {
  warden: {
    name: 'Warden',
    glyph: '⛨',
    color: '#3f6f9a',
    blurb: 'Shields and heals your Wildlings.',
    growth: { might: 0.4, ward: 1.4, lore: 0.8 },
    spells: ['mending', 'aegis', 'secondWind'],
  },
  arcanist: {
    name: 'Arcanist',
    glyph: '✶',
    color: '#8a3fa0',
    blurb: 'Hurls elemental spells at foes.',
    growth: { might: 0.4, ward: 0.6, lore: 1.6 },
    spells: ['wheelbolt', 'hex', 'starfall'],
  },
  beastcaller: {
    name: 'Beastcaller',
    glyph: '❦',
    color: '#4b7a3c',
    blurb: 'Makes your Wildlings hit harder.',
    growth: { might: 1.4, ward: 0.6, lore: 0.6 },
    spells: ['frenzy', 'wildcall', 'packHowl'],
  },
};

export const STATS: Record<Stat, { name: string; glyph: string; blurb: string }> = {
  might: { name: 'Might', glyph: '⚔', blurb: '+1% creature damage per point' },
  ward: { name: 'Ward', glyph: '⛨', blurb: '+1% creature health per point' },
  lore: { name: 'Lore', glyph: '✦', blurb: '+2% spell power and +1 mana per point' },
};

export type SpellKind = 'heal' | 'damage' | 'buff' | 'curse';

export interface SpellDef {
  name: string;
  glyph: string;
  cost: number;
  kind: SpellKind;
  blurb: string;
}

export const HERO_SPELLS: Record<HeroSpellId, SpellDef> = {
  mending: { name: 'Mending', glyph: '✚', cost: 8, kind: 'heal', blurb: 'Heals the whole party a little.' },
  aegis: { name: 'Aegis', glyph: '⛨', cost: 6, kind: 'buff', blurb: 'The Wildling in front takes half damage for 2 turns.' },
  secondWind: { name: 'Second Wind', glyph: '❤', cost: 16, kind: 'heal', blurb: 'Fully heals the Wildling in front.' },
  wheelbolt: { name: 'Wheelbolt', glyph: '✶', cost: 6, kind: 'damage', blurb: 'Strikes with the element the foe is weak to.' },
  hex: { name: 'Hex', glyph: '☾', cost: 8, kind: 'curse', blurb: 'The foe hits 30% softer for 3 turns.' },
  starfall: { name: 'Starfall', glyph: '☄', cost: 14, kind: 'damage', blurb: 'A heavy blow that ignores wards.' },
  frenzy: { name: 'Frenzy', glyph: '✦', cost: 5, kind: 'buff', blurb: 'The next attack is critical.' },
  wildcall: { name: 'Wild Call', glyph: '❦', cost: 8, kind: 'buff', blurb: 'The Wildling in front can use all its moves again.' },
  packHowl: { name: 'Pack Howl', glyph: '☽', cost: 10, kind: 'buff', blurb: 'The party hits 30% harder for 3 turns.' },
};

/** Everything talents can change. Additive; a missing key means no change. */
export interface HeroMods {
  /** Creature damage, +0.1 = +10%. */
  damage: number;
  health: number;
  spellPower: number;
  healing: number;
  /** Share knocked off every spell's cost. */
  thrift: number;
  maxMana: number;
  /** Mana fills this much faster from walking. */
  manaWalk: number;
  /** Widens the crit mark: subtracted from the timing quality a crit needs. */
  critEase: number;
  /** Arts come back this many turns sooner. */
  artHaste: number;
  /** The pet in front starts each fight guarded. */
  openingGuard: number;
}

export const NO_MODS: HeroMods = { damage: 0, health: 0, spellPower: 0, healing: 0, thrift: 0, maxMana: 0, manaWalk: 0, critEase: 0, artHaste: 0, openingGuard: 0 };

export interface Talent {
  name: string;
  blurb: string;
  mods: Partial<HeroMods>;
}

/** Each class has three rows of two choices. */
export const TALENTS: Record<HeroClass, [Talent, Talent][]> = {
  warden: [
    [
      { name: 'Stalwart', blurb: '+10% creature health', mods: { health: 0.1 } },
      { name: 'Lifeward', blurb: 'Heals are 30% stronger', mods: { healing: 0.3 } },
    ],
    [
      { name: 'First Guard', blurb: 'Start each fight guarded', mods: { openingGuard: 1 } },
      { name: 'Deep Well', blurb: '+10 mana', mods: { maxMana: 10 } },
    ],
    [
      { name: 'Iron Hide', blurb: '+15% creature health', mods: { health: 0.15 } },
      { name: 'Thrift', blurb: 'Spells cost 25% less', mods: { thrift: 0.25 } },
    ],
  ],
  arcanist: [
    [
      { name: 'Spellfire', blurb: '+20% spell power', mods: { spellPower: 0.2 } },
      { name: 'Deep Well', blurb: '+10 mana', mods: { maxMana: 10 } },
    ],
    [
      { name: 'Leyrunner', blurb: 'Mana fills 30% faster', mods: { manaWalk: 0.3 } },
      { name: 'Thrift', blurb: 'Spells cost 25% less', mods: { thrift: 0.25 } },
    ],
    [
      { name: 'Overcharge', blurb: '+35% spell power', mods: { spellPower: 0.35 } },
      { name: 'Battle Sage', blurb: '+10% creature damage', mods: { damage: 0.1 } },
    ],
  ],
  beastcaller: [
    [
      { name: 'Ferocity', blurb: '+8% creature damage', mods: { damage: 0.08 } },
      { name: 'Keen Eye', blurb: 'Crits are easier to time', mods: { critEase: 0.1 } },
    ],
    [
      { name: 'Quick Arts', blurb: 'Slow moves ready a turn sooner', mods: { artHaste: 1 } },
      { name: 'Thick Hide', blurb: '+10% creature health', mods: { health: 0.1 } },
    ],
    [
      { name: 'Alpha', blurb: '+15% creature damage', mods: { damage: 0.15 } },
      { name: 'Killer Instinct', blurb: 'Crits are much easier to time', mods: { critEase: 0.18 } },
    ],
  ],
};

/** A few drawn looks per class: cloak, trim and skin. */
export const LOOKS: Record<HeroClass, { cloak: string; trim: string; skin: string }[]> = {
  warden: [
    { cloak: '#3f6f9a', trim: '#d8c48a', skin: '#e2b98f' },
    { cloak: '#5a5f6b', trim: '#b9c6d6', skin: '#9c6b46' },
    { cloak: '#7a3a2e', trim: '#e3c26b', skin: '#f0cfae' },
  ],
  arcanist: [
    { cloak: '#5b2f78', trim: '#f3d27a', skin: '#f0cfae' },
    { cloak: '#1f4e5a', trim: '#9fe0d0', skin: '#b5835a' },
    { cloak: '#2a2238', trim: '#e07a5f', skin: '#7a4f33' },
  ],
  beastcaller: [
    { cloak: '#4b6a3c', trim: '#c9a46a', skin: '#e2b98f' },
    { cloak: '#7a5a34', trim: '#e8d9b5', skin: '#8f5e3c' },
    { cloak: '#3d4a2a', trim: '#d98b4a', skin: '#f0cfae' },
  ],
};

export interface HeroState {
  name: string;
  cls: HeroClass | null;
  second: HeroClass | null;
  look: number;
  /** Row key (`warden0`, …) → which of the two talents is picked. */
  talents: Record<string, 0 | 1>;
  mana: number;
  /** When mana last caught up with what it regained on its own. */
  manaAt?: number;
}

export const newHero = (): HeroState => ({ name: 'Wayfarer', cls: null, second: null, look: 0, talents: {}, mana: 0 });

export const isHeroClass = (v: unknown): v is HeroClass => HERO_CLASSES.includes(v as HeroClass);

export const talentKey = (cls: HeroClass, row: number) => `${cls}${row}`;

/** The classes the hero has, first class first. */
export const heroClasses = (hero: HeroState): HeroClass[] => [hero.cls, hero.second].filter(isHeroClass);

export interface TalentRow {
  cls: HeroClass;
  row: number;
  level: number;
  options: [Talent, Talent];
  picked: 0 | 1 | undefined;
}

/** Every talent row the hero's classes offer, open or not yet, in the order they open. */
export function talentRows(hero: HeroState): TalentRow[] {
  return heroClasses(hero).flatMap((cls, i) =>
    TALENTS[cls].map((options, row) => ({
      cls,
      row,
      level: (i === 0 ? TALENT_LEVELS : SECOND_TALENT_LEVELS)[row],
      options,
      picked: hero.talents[talentKey(cls, row)],
    })),
  );
}

export interface KnownSpell {
  id: HeroSpellId;
  level: number;
}

/** Spells the hero's classes teach, each with the level it is learned at. */
export function classSpells(hero: HeroState): KnownSpell[] {
  return heroClasses(hero).flatMap((cls, i) =>
    CLASSES[cls].spells.map((id, n) => ({ id, level: (i === 0 ? SPELL_LEVELS : SECOND_SPELL_LEVELS)[n] })),
  );
}

export const knownSpells = (hero: HeroState, level: number): HeroSpellId[] =>
  classSpells(hero)
    .filter((s) => s.level <= level)
    .map((s) => s.id);

export function heroMods(hero: HeroState, level: number): HeroMods {
  const mods = { ...NO_MODS };
  for (const row of talentRows(hero)) {
    if (row.picked === undefined || row.level > level) continue;
    for (const [k, v] of Object.entries(row.options[row.picked].mods) as [keyof HeroMods, number][]) mods[k] += v;
  }
  return mods;
}

export function heroStats(hero: HeroState, level: number): Record<Stat, number> {
  const stats: Record<Stat, number> = { might: 2, ward: 2, lore: 2 };
  const [first, second] = heroClasses(hero);
  for (const stat of Object.keys(stats) as Stat[]) {
    if (first) stats[stat] += CLASSES[first].growth[stat] * (level - 1);
    if (second && level > SECOND_CLASS_LEVEL) stats[stat] += CLASSES[second].growth[stat] * 0.5 * (level - SECOND_CLASS_LEVEL);
    stats[stat] = Math.floor(stats[stat]);
  }
  return stats;
}

export const maxMana = (hero: HeroState, level: number) => BASE_MANA + heroStats(hero, level).lore + heroMods(hero, level).maxMana;

export const spellCost = (hero: HeroState, level: number, id: HeroSpellId) =>
  Math.max(1, Math.round(HERO_SPELLS[id].cost * (1 - heroMods(hero, level).thrift)));

/** How mana fills, in one line for the hero page. */
export const MANA_HELP = `+1 per ${METRES_PER_MANA} m walked, or +1 every ${MS_PER_MANA / 60_000} min on its own`;

/** Mana regained on its own over `ms`, before the cap. */
export const manaFromRest = (ms: number) => Math.max(0, ms) / MS_PER_MANA;

/** Mana gained from walking `metres`, before the cap. */
export const manaFromWalk = (hero: HeroState, level: number, metres: number) =>
  (metres / METRES_PER_MANA) * (1 + heroMods(hero, level).manaWalk);

/** What the battle needs from the hero: multipliers on the party and the spells to offer. */
export interface HeroPower {
  /** Multiplies creature damage and health. */
  damage: number;
  health: number;
  /** Multiplies spell damage and healing. */
  spellPower: number;
  healing: number;
  critEase: number;
  artHaste: number;
  openingGuard: boolean;
  spells: HeroSpellId[];
}

export function heroPower(hero: HeroState, level: number): HeroPower {
  const stats = heroStats(hero, level);
  const mods = heroMods(hero, level);
  return {
    damage: 1 + stats.might * 0.01 + mods.damage,
    health: 1 + stats.ward * 0.01 + mods.health,
    spellPower: 1 + stats.lore * 0.02 + mods.spellPower,
    healing: 1 + mods.healing,
    critEase: mods.critEase,
    artHaste: mods.artHaste,
    openingGuard: mods.openingGuard > 0,
    spells: knownSpells(hero, level),
  };
}

/** Talent points waiting to be spent: open rows with no pick. */
export const openTalentRows = (hero: HeroState, level: number) =>
  talentRows(hero).filter((r) => r.level <= level && r.picked === undefined).length;

export const canPickSecond = (hero: HeroState, level: number) => !!hero.cls && !hero.second && level >= SECOND_CLASS_LEVEL;
