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
  strideBoost,
  tick,
  upgradeCost,
  type BuildingId,
} from './hearthstead';
import {
  craftCost,
  craftItem,
  FORGE_LEVEL,
  gearBonuses,
  maxPlus,
  newGearSeed,
  RUNE_IDS,
  RUNE_LEVEL,
  runeSockets,
  upgradeCost as gearUpgradeCost,
  type GearBonuses,
  type GearItem,
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
import {
  borderDistanceM,
  BORDER_REACH_M,
  collectParcel,
  LEY_MS,
  maxParcels,
  MAX_LEY_LINES,
  MAX_RESIDENTS,
  MAX_WAYMARKS,
  MIN_PARCEL_M2,
  newParcel,
  overlaps,
  reink,
  tickParcel,
  type Parcel,
} from './demesne';

/** Walking pays out per full 100 m: Wanderlight is only ever earned this way. */
export const WALK_REWARD_STEP_M = 100;
export const WALK_REWARD = { wanderlight: 1, xp: 30, coin: 2 };
export const VISITED_CELL_M = 50;
export const EGG_UNLOCK_LEVEL = 8;
/** Chance a shrine gives a rune once runes are unlocked. */
export const RUNE_SHRINE_CHANCE = 0.06;

export type GameEvent =
  | { kind: 'change' }
  | { kind: 'levelUp'; level: number; unlocks: Unlock[] }
  | { kind: 'reward'; text: string }
  | { kind: 'stride'; skippedMs: number }
  | { kind: 'hatch'; hatchling: Hatchling }
  /** A walked glyph took effect. `parcel` is the claimed or redrawn parcel for a Ring. */
  | { kind: 'glyph'; glyph: Glyph; text: string; parcel?: Parcel; realm?: RealmId };

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

  /** Records metres walked and pays out every full 100 m. Returns the number of steps paid. */
  recordWalk(metres: number, now = Date.now()): number {
    const s = this.save;
    s.distanceMetres += metres;
    const steps = Math.floor((s.distanceMetres - s.rewardedMetres) / WALK_REWARD_STEP_M);
    if (steps > 0) {
      s.rewardedMetres += steps * WALK_REWARD_STEP_M;
      s.currencies.wanderlight += steps * WALK_REWARD.wanderlight;
      s.currencies.coin += steps * WALK_REWARD.coin;
      this.grantXp(steps * WALK_REWARD.xp * (this.isBlessed(now) ? BLESSING_XP_BONUS : 1));
      tick(s.hearthstead, now);
      const bonus = this.bonuses();
      const skippedMs = strideBoost(s.hearthstead, steps, now, bonus.stride);
      for (const e of s.expeditions) e.boostMs += skippedMs;
      for (const p of s.parcels) tickParcel(p, s.leyLines, now, skippedMs);
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
    const s = this.save;
    return Object.values(s.equipped)
      .map((id) => s.gear.find((g) => g.id === id))
      .filter((g): g is GearItem => !!g);
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

  canCraft(slot: Slot): boolean {
    return this.level.level >= FORGE_LEVEL && this.canPay(craftCost(slot));
  }

  /** Forges a new item and equips it if the slot is empty. */
  craft(slot: Slot, seed = newGearSeed(slot)): GearItem | null {
    if (!this.canCraft(slot)) return null;
    this.pay(craftCost(slot));
    const item = craftItem(slot, this.level.level, seed);
    this.save.gear.push(item);
    if (!this.save.equipped[slot]) this.save.equipped[slot] = item.id;
    this.grantXp(40);
    this.changed();
    return item;
  }

  canUpgradeGear(item: GearItem): boolean {
    return this.level.level >= FORGE_LEVEL && item.plus < maxPlus(this.level.level) && this.canPay(gearUpgradeCost(item));
  }

  upgradeGear(id: string): boolean {
    const item = this.save.gear.find((g) => g.id === id);
    if (!item || !this.canUpgradeGear(item)) return false;
    this.pay(gearUpgradeCost(item));
    item.plus += 1;
    this.grantXp(20 + 10 * item.plus);
    this.changed();
    return true;
  }

  equip(id: string): void {
    const item = this.save.gear.find((g) => g.id === id);
    if (!item) return;
    this.save.equipped[item.slot] = item.id;
    this.changed();
  }

  /** Melts an unequipped item back into half its slot's crafting material. */
  salvage(id: string): boolean {
    const s = this.save;
    const i = s.gear.findIndex((g) => g.id === id);
    if (i < 0 || s.equipped[s.gear[i].slot] === id) return false;
    const [item] = s.gear.splice(i, 1);
    const cost = craftCost(item.slot);
    this.addMaterials({ [cost.material]: Math.max(1, Math.floor(cost.amount / 2) + item.plus) });
    s.runes.push(...item.runes);
    this.changed();
    return true;
  }

  socketRune(id: string, rune: RuneId): boolean {
    const s = this.save;
    const item = s.gear.find((g) => g.id === id);
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

  // ---- Glyphwalking and the Inked Demesne ----

  /**
   * Applies a walked glyph. A Ring claims (or redraws) a parcel using the realm shares the
   * map found inside it, a Stroke lays a ley line and a Knot sets a Waymark.
   */
  castGlyph(glyph: Glyph, realms: Partial<Record<RealmId, number>> = {}, realm?: RealmId, now = Date.now()): void {
    const s = this.save;
    s.glyphsCast[glyph.kind] += 1;
    const reward = GLYPH_REWARD[glyph.kind];
    s.currencies.wanderlight += reward.wanderlight;
    this.grantXp(reward.xp);
    let text = '';
    let parcel: Parcel | undefined;
    if (glyph.kind === 'ring') {
      const fresh = newParcel(glyph, realms, now);
      const old = s.parcels.find((p) => overlaps(p, fresh));
      if ((glyph.areaM2 ?? 0) < MIN_PARCEL_M2) {
        text = 'Ring cast! The loop was too tight to hold any land; walk a wider one to claim a parcel.';
      } else if (old) {
        // Walking a new Ring over a parcel redraws its border and fills the ink.
        tickParcel(old, s.leyLines, now);
        Object.assign(old, { polygon: fresh.polygon, centroid: fresh.centroid, areaM2: fresh.areaM2, perimeterM: fresh.perimeterM, realms: fresh.realms, inkedAt: now });
        parcel = old;
        text = `Ring cast! ${old.name} is redrawn and freshly inked.`;
      } else if (s.parcels.length >= maxParcels(this.level.level)) {
        text = `Ring cast, but your Demesne holds ${s.parcels.length} parcels already. Release one, or level up for more room.`;
      } else {
        s.parcels.push(fresh);
        parcel = fresh;
        text = `Ring cast! You claimed ${fresh.name}.`;
      }
    } else if (glyph.kind === 'stroke') {
      s.leyLines.push({ id: `ley${now.toString(36)}`, from: glyph.path[0], to: glyph.path[1], until: now + LEY_MS });
      if (s.leyLines.length > MAX_LEY_LINES) s.leyLines.splice(0, s.leyLines.length - MAX_LEY_LINES);
      for (const p of s.parcels) tickParcel(p, s.leyLines, now);
      text = `Stroke cast! A ${glyph.lengthM} m ley line hums for a day.`;
    } else {
      const [lng, lat] = glyph.center;
      if (!s.waymarks.some((w) => Math.abs(w.lng - lng) < 1e-5 && Math.abs(w.lat - lat) < 1e-5)) {
        s.waymarks.push({ id: `wm${now.toString(36)}`, lng, lat, setAt: now });
        if (s.waymarks.length > MAX_WAYMARKS) s.waymarks.splice(0, s.waymarks.length - MAX_WAYMARKS);
      }
      text = 'Knot cast! A Waymark now holds this corner; a creature will always wait here.';
    }
    const extra = reward.wanderlight ? ` +${reward.xp} XP, +${reward.wanderlight} Wanderlight.` : ` +${reward.xp} XP.`;
    this.emit({ kind: 'glyph', glyph, text: text + extra, parcel, realm });
    this.changed();
  }

  /** Banks parcel production up to now. */
  tickDemesne(now = Date.now()): void {
    for (const p of this.save.parcels) tickParcel(p, this.save.leyLines, now);
  }

  /** Walking near a border re-inks it. Call with each position and the metres since the last. */
  walkBorders(lat: number, lng: number, metres: number, now = Date.now()): void {
    if (metres <= 0) return;
    let changed = false;
    for (const p of this.save.parcels) {
      if (borderDistanceM(p, lng, lat) > BORDER_REACH_M) continue;
      tickParcel(p, this.save.leyLines, now);
      changed = reink(p, metres, now) || changed;
    }
    if (changed) this.changed();
  }

  collectParcel(id: string, now = Date.now()): Partial<Record<MaterialId, number>> {
    const p = this.save.parcels.find((x) => x.id === id);
    if (!p) return {};
    tickParcel(p, this.save.leyLines, now);
    const got = collectParcel(p);
    const total = Object.values(got).reduce((a, b) => a + (b ?? 0), 0);
    if (total > 0) {
      this.addMaterials(got);
      this.grantXp(total);
    }
    this.changed();
    return got;
  }

  releaseParcel(id: string): boolean {
    const i = this.save.parcels.findIndex((p) => p.id === id);
    if (i < 0) return false;
    this.save.parcels.splice(i, 1);
    this.changed();
    return true;
  }

  /** Moves a pet into a parcel (out of any other one), or out of its parcel when already there. */
  toggleResident(parcelId: string, petUid: string, now = Date.now()): boolean {
    const target = this.save.parcels.find((p) => p.id === parcelId);
    if (!target) return false;
    this.tickDemesne(now);
    if (target.residents.includes(petUid)) {
      target.residents = target.residents.filter((u) => u !== petUid);
    } else {
      if (target.residents.length >= MAX_RESIDENTS) return false;
      for (const p of this.save.parcels) p.residents = p.residents.filter((u) => u !== petUid);
      target.residents.push(petUid);
    }
    this.changed();
    return true;
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
    const mats = (Object.entries(reward.materials) as [MaterialId, number][])
      .map(([id, n]) => `${n} ${MATERIALS[id].name}`)
      .join(', ');
    this.emit({ kind: 'reward', text: `+${reward.coin} coin, ${mats}, +${reward.xp} XP. Blessed for 10 minutes.${egg}` });
    this.changed();
    return true;
  }

  /** Picks up a curio once and pays it out; returns what it held. */
  findCurio(curio: Curio, realm: RealmId, onFoot: boolean): CurioReward | null {
    if (curio.id in this.save.curiosFound) return null;
    const reward = curioReward(curio, realm, onFoot);
    this.save.curiosFound[curio.id] = curio.expiresAt;
    this.save.currencies.coin += reward.coin;
    this.save.currencies.wanderlight += reward.wanderlight;
    this.addMaterials(reward.materials);
    this.grantXp(reward.xp);
    this.changed();
    return reward;
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
