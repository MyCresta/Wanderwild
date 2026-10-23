import { cellAt } from './cells';
import { pruneSave, storeSave, type SaveData } from './save';
import { MATERIALS, type MaterialId, type RealmId } from './realms';
import { BLESSING_MS, BLESSING_XP_BONUS, rollShrineReward, SHRINE_COOLDOWN_MS, type Shrine } from './shrines';
import { levelFromXp, unlocksBetween, type Unlock } from './wayfarer';

/** Walking pays out per full 100 m: Wanderlight is only ever earned this way. */
export const WALK_REWARD_STEP_M = 100;
export const WALK_REWARD = { wanderlight: 1, xp: 30, coin: 2 };
export const VISITED_CELL_M = 50;

export type GameEvent =
  | { kind: 'change' }
  | { kind: 'levelUp'; level: number; unlocks: Unlock[] }
  | { kind: 'reward'; text: string };

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
    }
    this.changed();
    return steps;
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
    const mats = (Object.entries(reward.materials) as [MaterialId, number][])
      .map(([id, n]) => `${n} ${MATERIALS[id].name}`)
      .join(', ');
    this.emit({ kind: 'reward', text: `+${reward.coin} coin, ${mats}, +${reward.xp} XP. Blessed for 10 minutes.` });
    this.changed();
    return true;
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
