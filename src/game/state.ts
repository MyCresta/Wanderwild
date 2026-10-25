import { cellAt } from './cells';
import { curioReward, type Curio, type CurioReward } from './farsight';
import { pruneSave, storeSave, type SaveData } from './save';
import { MATERIALS, type MaterialId, type RealmId } from './realms';
import { BLESSING_MS, BLESSING_XP_BONUS, rollShrineReward, SHRINE_COOLDOWN_MS, type Shrine } from './shrines';
import { levelFromXp, unlocksBetween, type Unlock } from './wayfarer';
import {
  canPickSecond,
  heroPower,
  manaFromWalk,
  maxMana,
  spellCost,
  talentKey,
  talentRows,
  type HeroClass,
  type HeroPower,
  type HeroSpellId,
} from './hero';
import { EGG_SHRINE_CHANCE, EGG_SLOTS, rollEgg, walkEggs, type Hatchling } from './eggs';
import {
  BUILDINGS,
  collect,
  MAX_BUILDING_LEVEL,
  dayKey,
  strideBoost,
  tick,
  upgradeCost,
  type BuildingId,
} from './hearthstead';
import {
  FORGE_LEVEL,
  gearBonuses,
  isBetter,
  maxPlus,
  meltValue,
  RARITIES,
  rollGear,
  RUNE_IDS,
  RUNE_LEVEL,
  runeSockets,
  SLOT_DEFS,
  upgradeCost as gearUpgradeCost,
  type GearBonuses,
  type GearItem,
  type GearRarity,
  type GearSource,
  type RuneId,
  type Slot,
} from './gear';
import {
  EXPEDITION_LEVEL,
  EXPEDITION_SLOTS,
  expeditionDone,
  expeditionReward,
  type Expedition,
  type ExpeditionReward,
} from './expeditions';
import { hashString, seededRandom } from './rng';
import type { Glyph } from './glyphs';
import { MAX_WAYMARKS } from './waymarks';

/** Walking pays out per full 100 m: Wanderlight is only ever earned this way. */
export const WALK_REWARD_STEP_M = 100;
export const WALK_REWARD = { wanderlight: 1, coin: 2 };
/** A walking step, in metres: every one counted gives STEP_XP. */
export const STRIDE_M = 0.75;
export const STEP_XP = 1;
export const VISITED_CELL_M = 50;
export const EGG_UNLOCK_LEVEL = 8;
/** Chance a shrine gives a rune once runes are unlocked. */
export const RUNE_SHRINE_CHANCE = 0.06;

/** What came of a gear drop. */
export interface GearFind {
  slot: Slot;
  rarity: GearRarity;
  /** True when it was rarer and is now worn; false when it melted down. */
  kept: boolean;
  text: string;
}

const melt = (slot: Slot, rarity: GearRarity): Partial<Record<MaterialId, number>> => {
  const m = meltValue(slot, rarity);
  return { [m.material]: m.amount };
};

export type GameEvent =
  | { kind: 'change' }
  | { kind: 'levelUp'; level: number; unlocks: Unlock[] }
  | { kind: 'reward'; text: string }
  | { kind: 'stride'; skippedMs: number }
  | { kind: 'hatch'; hatchling: Hatchling }
  /** A walked glyph took effect. */
  | { kind: 'glyph'; glyph: Glyph; text: string; realm?: RealmId };

/** XP and Wanderlight for each glyph. */
export const GLYPH_REWARD = { ring: { xp: 100, wanderlight: 5 }, stroke: { xp: 60, wanderlight: 1 }, knot: { xp: 40, wanderlight: 0 } };

type Listener = (event: GameEvent) => void;

const SAVE_DELAY_MS = 1500;

/** The live game: the save plus the rules that change it. Persists itself shortly after each change. */
export class GameState {
  private listeners = new Set<Listener>();
  private saveTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(public save: SaveData) {}

  on(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: GameEvent): void {
    for (const l of this.listeners) l(event);
  }

  get level() {
    return levelFromXp(this.save.wayfarer.xp);
  }

  isBlessed(now = Date.now()): boolean {
    return this.save.blessingUntil > now;
  }

  /** Replaces the whole save (after an import) and writes it straight away. */
  replace(save: SaveData): Promise<void> {
    this.save = save;
    this.changed();
    return this.flush();
  }

  grantXp(amount: number): void {
    const before = this.level.level;
    this.save.wayfarer.xp += Math.round(amount);
    const after = this.level.level;
    if (after > before) this.emit({ kind: 'levelUp', level: after, unlocks: unlocksBetween(before, after) });
  }

  addMaterials(materials: Partial<Record<MaterialId, number>>): void {
    for (const [id, n] of Object.entries(materials) as [MaterialId, number][])
      this.save.materials[id] = (this.save.materials[id] ?? 0) + n;
  }

  /** Steps walked today, counted from distance. */
  stepsToday(now = Date.now()): number {
    return this.save.steps.day === dayKey(now) ? this.save.steps.count : 0;
  }

  /** Records metres walked: STEP_XP per step, and the rest every full 100 m. Returns the number of 100 m paid. */
  recordWalk(metres: number, now = Date.now()): number {
    const s = this.save;
    const footfalls = Math.floor((s.distanceMetres + metres) / STRIDE_M) - Math.floor(s.distanceMetres / STRIDE_M);
    s.distanceMetres += metres;
    if (footfalls > 0) {
      const today = dayKey(now);
      if (s.steps.day !== today) s.steps = { day: today, count: 0 };
      s.steps.count += footfalls;
      this.grantXp(footfalls * STEP_XP * (this.isBlessed(now) ? BLESSING_XP_BONUS : 1));
    }
    const steps = Math.floor((s.distanceMetres - s.rewardedMetres) / WALK_REWARD_STEP_M);
    if (steps > 0) {
      s.rewardedMetres += steps * WALK_REWARD_STEP_M;
      s.currencies.wanderlight += steps * WALK_REWARD.wanderlight;
      s.currencies.coin += steps * WALK_REWARD.coin;
      tick(s.hearthstead, now);
      const bonus = this.bonuses();
      const skippedMs = strideBoost(s.hearthstead, steps, now, bonus.stride);
      for (const e of s.expeditions) e.boostMs += skippedMs;
      if (skippedMs > 0) this.emit({ kind: 'stride', skippedMs });
      // Boots turn part of each 100 m into extra Wanderlight.
      const extra = Math.floor(steps * (bonus.stride - 1) + seededRandom(hashString(`wl:${s.rewardedMetres}`))());
      if (extra > 0) s.currencies.wanderlight += extra;
    }
    // After the walk's XP, so a level gained on the way already counts toward the cap.
    this.fillMana(manaFromWalk(s.hero, this.level.level, metres));
    for (const hatchling of walkEggs(s.eggs, metres * this.bonuses().eggSpeed, now)) {
      s.hatchlings.push(hatchling);
      this.emit({ kind: 'hatch', hatchling });
    }
    this.changed();
    return steps;
  }

  useTonic(): boolean {
    if (this.save.supplies.tonic < 1) return false;
    this.save.supplies.tonic -= 1;
    this.changed();
    return true;
  }

  /** Takes up to `max` Kennel Wildling XP from the bag. Returns how much was taken. */
  takeWildlingXp(max: number): number {
    const amount = Math.max(0, Math.min(Math.floor(max), this.save.supplies.petXp));
    if (!amount) return 0;
    this.save.supplies.petXp -= amount;
    this.changed();
    return amount;
  }

  // ---- The hero ----

  get maxMana(): number {
    return maxMana(this.save.hero, this.level.level);
  }

  /** Whole points of mana ready to spend. */
  get mana(): number {
    return Math.floor(Math.min(this.save.hero.mana, this.maxMana));
  }

  fillMana(amount: number): void {
    const hero = this.save.hero;
    hero.mana = Math.min(this.maxMana, hero.mana + amount);
  }

  heroPower(): HeroPower {
    return heroPower(this.save.hero, this.level.level);
  }

  spellCost(spell: HeroSpellId): number {
    return spellCost(this.save.hero, this.level.level, spell);
  }

  spendMana(spell: HeroSpellId): boolean {
    const cost = this.spellCost(spell);
    if (this.mana < cost) return false;
    this.save.hero.mana = Math.min(this.save.hero.mana, this.maxMana) - cost;
    this.changed();
    return true;
  }

  /** Picks the first class (once), or the second from level 20. */
  chooseClass(cls: HeroClass): boolean {
    const hero = this.save.hero;
    if (!hero.cls) hero.cls = cls;
    else if (canPickSecond(hero, this.level.level) && cls !== hero.cls) hero.second = cls;
    else return false;
    this.changed();
    return true;
  }

  pickTalent(cls: HeroClass, row: number, pick: 0 | 1): boolean {
    const open = talentRows(this.save.hero).some((r) => r.cls === cls && r.row === row && r.level <= this.level.level);
    if (!open) return false;
    this.save.hero.talents[talentKey(cls, row)] = pick;
    this.changed();
    return true;
  }

  /** Talents can be changed freely: clearing them all is the respec. */
  resetTalents(): void {
    this.save.hero.talents = {};
    this.changed();
  }

  setHeroLook(name: string, look: number): void {
    const hero = this.save.hero;
    hero.name = name.trim().slice(0, 24) || hero.name;
    hero.look = look;
    this.changed();
  }

  // ---- Gear and the Forge ----

  equippedItems(): GearItem[] {
    return Object.values(this.save.gear);
  }

  bonuses(): GearBonuses {
    return gearBonuses(this.equippedItems());
  }

  private canPay(cost: { coin: number; material: MaterialId; amount: number }): boolean {
    return this.save.currencies.coin >= cost.coin && (this.save.materials[cost.material] ?? 0) >= cost.amount;
  }

  private pay(cost: { coin: number; material: MaterialId; amount: number }): void {
    this.save.currencies.coin -= cost.coin;
    this.save.materials[cost.material] = (this.save.materials[cost.material] ?? 0) - cost.amount;
  }

  /**
   * Rolls for gear from a fight or a find. A rarer piece is put on straight away and
   * keeps the slot's upgrades and runes; anything else melts into its slot's material.
   * Returns a line saying what happened, or null when nothing dropped.
   */
  findGear(source: GearSource, rand: () => number = Math.random): GearFind | null {
    const roll = rollGear(source, this.level.level, this.save.gear, rand);
    return roll ? this.takeGear(roll.slot, roll.rarity) : null;
  }

  takeGear(slot: Slot, rarity: GearRarity): GearFind {
    const s = this.save;
    const current = s.gear[slot];
    const name = `${RARITIES[rarity].name} ${SLOT_DEFS[slot].name}`;
    let find: GearFind;
    if (isBetter(rarity, current)) {
      if (current) this.addMaterials(melt(current.slot, current.rarity));
      s.gear[slot] = { slot, rarity, plus: current?.plus ?? 0, runes: current?.runes ?? [] };
      find = { slot, rarity, kept: true, text: current?.plus ? `Found a ${name}! It keeps your +${current.plus}.` : `Found a ${name}!` };
    } else {
      const m = melt(slot, rarity);
      this.addMaterials(m);
      const [id, n] = Object.entries(m)[0] as [MaterialId, number];
      find = { slot, rarity, kept: false, text: `Found a ${name}, melted into ${n} ${MATERIALS[id].name}.` };
    }
    this.changed();
    return find;
  }

  canUpgradeGear(slot: Slot): boolean {
    const item = this.save.gear[slot];
    return !!item && this.level.level >= FORGE_LEVEL && item.plus < maxPlus(this.level.level) && this.canPay(gearUpgradeCost(item));
  }

  upgradeGear(slot: Slot): boolean {
    const item = this.save.gear[slot];
    if (!item || !this.canUpgradeGear(slot)) return false;
    this.pay(gearUpgradeCost(item));
    item.plus += 1;
    this.grantXp(20 + 10 * item.plus);
    this.changed();
    return true;
  }

  socketRune(slot: Slot, rune: RuneId): boolean {
    const s = this.save;
    const item = s.gear[slot];
    const r = s.runes.indexOf(rune);
    if (!item || r < 0 || this.level.level < RUNE_LEVEL || item.runes.length >= runeSockets(item)) return false;
    s.runes.splice(r, 1);
    item.runes.push(rune);
    this.changed();
    return true;
  }

  // ---- Realms and expeditions ----

  visitRealm(realm: RealmId): void {
    if (this.save.realmsVisited.includes(realm)) return;
    this.save.realmsVisited.push(realm);
    this.changed();
  }

  canSendExpedition(): boolean {
    return this.level.level >= EXPEDITION_LEVEL && this.save.expeditions.length < EXPEDITION_SLOTS;
  }

  sendExpedition(petUid: string, petLevel: number, realm: RealmId, durationMs: number, now = Date.now()): boolean {
    const s = this.save;
    if (!this.canSendExpedition() || !s.realmsVisited.includes(realm) || s.expeditions.some((e) => e.petUid === petUid)) return false;
    s.expeditions.push({ petUid, petLevel, realm, startedAt: now, durationMs, boostMs: 0 });
    this.changed();
    return true;
  }

  /** Brings a finished expedition home. The caller gives the pet its XP. */
  claimExpedition(petUid: string, now = Date.now()): { expedition: Expedition; reward: ExpeditionReward } | null {
    const s = this.save;
    const i = s.expeditions.findIndex((e) => e.petUid === petUid);
    if (i < 0 || !expeditionDone(s.expeditions[i], now)) return null;
    const [expedition] = s.expeditions.splice(i, 1);
    const reward = expeditionReward(expedition);
    this.addMaterials(reward.materials);
    s.currencies.coin += reward.coin;
    this.grantXp(30);
    this.changed();
    return { expedition, reward };
  }

  // ---- Glyphwalking ----

  /**
   * Applies a walked glyph. Each pays XP and Wanderlight; a Knot also sets a Waymark, and
   * a Ring in the companion's home realm counts toward its evolution (see main.ts).
   */
  castGlyph(glyph: Glyph, realm?: RealmId, now = Date.now()): void {
    const s = this.save;
    s.glyphsCast[glyph.kind] += 1;
    const reward = GLYPH_REWARD[glyph.kind];
    s.currencies.wanderlight += reward.wanderlight;
    this.grantXp(reward.xp);
    let text = `${glyph.kind === 'ring' ? 'Ring' : 'Stroke'} cast!`;
    if (glyph.kind === 'knot') {
      const [lng, lat] = glyph.center;
      if (!s.waymarks.some((w) => Math.abs(w.lng - lng) < 1e-5 && Math.abs(w.lat - lat) < 1e-5)) {
        s.waymarks.push({ id: `wm${now.toString(36)}`, lng, lat, setAt: now });
        if (s.waymarks.length > MAX_WAYMARKS) s.waymarks.splice(0, s.waymarks.length - MAX_WAYMARKS);
      }
      text = 'Knot cast! A Waymark now holds this corner; a Wildling or Blotspawn will always wait here.';
    }
    const extra = reward.wanderlight ? ` +${reward.xp} XP, +${reward.wanderlight} Wanderlight.` : ` +${reward.xp} XP.`;
    this.emit({ kind: 'glyph', glyph, text: text + extra, realm });
    this.changed();
  }

  /** Banks the real time that has passed into the Hearthstead. */
  tickHearthstead(now = Date.now()): void {
    tick(this.save.hearthstead, now);
    this.changed();
  }

  /** Builds a building at level 1 once the Wayfarer level allows it. */
  build(id: BuildingId, now = Date.now()): boolean {
    const h = this.save.hearthstead;
    if (h.buildings[id] || this.level.level < BUILDINGS[id].unlockLevel) return false;
    tick(h, now);
    h.buildings[id] = { level: 1, progressMs: 0 };
    this.changed();
    return true;
  }

  collect(id: BuildingId, now = Date.now()): number {
    const b = this.save.hearthstead.buildings[id];
    if (!b) return 0;
    tick(this.save.hearthstead, now);
    const def = BUILDINGS[id];
    const amount = collect(def, b);
    if (amount > 0) {
      if (def.product.kind === 'material') this.addMaterials({ [def.product.id]: amount });
      else this.save.supplies[def.product.id] += amount;
      this.grantXp(amount * (def.product.kind === 'supply' && def.product.id === 'petXp' ? 0.1 : 1));
    }
    this.changed();
    return amount;
  }

  canUpgrade(id: BuildingId): boolean {
    const b = this.save.hearthstead.buildings[id];
    if (!b || b.level >= MAX_BUILDING_LEVEL) return false;
    const cost = upgradeCost(BUILDINGS[id], b.level);
    return this.save.currencies.coin >= cost.coin && (this.save.materials[cost.material] ?? 0) >= cost.amount;
  }

  upgrade(id: BuildingId, now = Date.now()): boolean {
    if (!this.canUpgrade(id)) return false;
    const b = this.save.hearthstead.buildings[id]!;
    tick(this.save.hearthstead, now);
    const cost = upgradeCost(BUILDINGS[id], b.level);
    this.save.currencies.coin -= cost.coin;
    this.save.materials[cost.material] = (this.save.materials[cost.material] ?? 0) - cost.amount;
    b.level += 1;
    this.grantXp(25 * b.level);
    this.changed();
    return true;
  }

  /** Marks the ~50 m cell under the player as walked. */
  visit(lat: number, lng: number): void {
    const id = cellAt(lat, lng, VISITED_CELL_M).id;
    if (this.save.visitedCells.includes(id)) return;
    this.save.visitedCells.push(id);
    this.changed();
  }

  shrineReadyAt(shrine: Shrine): number {
    return this.save.shrineCooldowns[shrine.id] ?? 0;
  }

  /** Touches a shrine. Returns false while it is cooling down. */
  useShrine(shrine: Shrine, realm: RealmId, now = Date.now()): boolean {
    if (this.shrineReadyAt(shrine) > now) return false;
    const reward = rollShrineReward(shrine, realm, now);
    const s = this.save;
    s.shrineCooldowns[shrine.id] = now + SHRINE_COOLDOWN_MS;
    s.shrinesVisited += 1;
    s.blessingUntil = now + BLESSING_MS;
    s.currencies.coin += reward.coin;
    this.addMaterials(reward.materials);
    this.grantXp(reward.xp);
    let egg = '';
    if (this.level.level >= RUNE_LEVEL && Math.random() < RUNE_SHRINE_CHANCE) {
      const rune = RUNE_IDS[Math.floor(Math.random() * RUNE_IDS.length)];
      s.runes.push(rune);
      egg += ` A ${rune} rune glints in the stones!`;
    }
    if (this.level.level >= EGG_UNLOCK_LEVEL && s.eggs.length < EGG_SLOTS && Math.random() < EGG_SHRINE_CHANCE) {
      const found = rollEgg(shrine.id, now);
      s.eggs.push(found);
      egg += ` You found a ${found.km} km egg!`;
    }
    const gear = this.findGear({ kind: 'shrine' });
    if (gear) egg += ` ${gear.text}`;
    const mats = (Object.entries(reward.materials) as [MaterialId, number][])
      .map(([id, n]) => `${n} ${MATERIALS[id].name}`)
      .join(', ');
    this.emit({ kind: 'reward', text: `+${reward.coin} coin, ${mats}, +${reward.xp} XP. Blessed for 10 minutes.${egg}` });
    this.changed();
    return true;
  }

  /** Picks up a curio once and pays it out; returns what it held. */
  findCurio(curio: Curio, realm: RealmId, onFoot: boolean): (CurioReward & { gear: GearFind | null }) | null {
    if (curio.id in this.save.curiosFound) return null;
    const reward = curioReward(curio, realm, onFoot);
    this.save.curiosFound[curio.id] = curio.expiresAt;
    this.save.currencies.coin += reward.coin;
    this.save.currencies.wanderlight += reward.wanderlight;
    this.addMaterials(reward.materials);
    this.grantXp(reward.xp);
    const gear = this.findGear({ kind: 'curio', onFoot });
    this.changed();
    return { ...reward, gear };
  }

  changed(): void {
    this.emit({ kind: 'change' });
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => void this.flush(), SAVE_DELAY_MS);
  }

  flush(): Promise<void> {
    clearTimeout(this.saveTimer);
    pruneSave(this.save);
    return storeSave(this.save);
  }
}
