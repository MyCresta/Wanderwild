import { describe, expect, it } from 'vitest';
import { capRarity, gearBonuses, maxPlus, power, rollGear, runeSockets, SLOTS, type GearItem, type GearSource } from '../src/game/gear';
import { seededRandom } from '../src/game/rng';
import { expeditionProgress, expeditionReward } from '../src/game/expeditions';
import { migrate, newSave } from '../src/game/save';
import { GameState } from '../src/game/state';
import { xpForLevel } from '../src/game/wayfarer';

const xpTo = (level: number) => Array.from({ length: level - 1 }, (_, i) => xpForLevel(i + 2)).reduce((a, b) => a + b, 0);
const item = (over: Partial<GearItem> = {}): GearItem => ({ slot: 'staff', rarity: 'worn', plus: 0, runes: [], ...over });

describe('gear', () => {
  it('gets stronger with rarity and upgrades', () => {
    expect(power(item({ rarity: 'rare' }))).toBeGreaterThan(power(item()));
    expect(power(item({ plus: 10 }))).toBeCloseTo(2.5);
  });

  it('opens rune sockets at +5 and +10, and caps upgrades at +5 until level 15', () => {
    expect([0, 5, 10].map((plus) => runeSockets(item({ plus })))).toEqual([0, 1, 2]);
    expect(maxPlus(14)).toBe(5);
    expect(maxPlus(15)).toBe(10);
  });

  it('adds up bonuses per slot and rune', () => {
    const b = gearBonuses([item({ slot: 'staff' }), item({ slot: 'boots', runes: ['swiftsole'] }), item({ slot: 'lantern', runes: ['seer'] })]);
    expect(b.petDamage).toBeCloseTo(1.04);
    expect(b.stride).toBeCloseTo(1.15);
    expect(b.reachM).toBeCloseTo(18);
    expect(b.catchBonus).toBe(0);
  });
});

describe('gear drops', () => {
  const full = Object.fromEntries(SLOTS.map((slot) => [slot, item({ slot })]));
  const rolls = (source: GearSource, level: number, n = 4000) =>
    Array.from({ length: n }, (_, i) => rollGear(source, level, full, seededRandom(i)));

  it('are rare from common Blotspawn and certain from bosses', () => {
    const normal = rolls({ kind: 'foe', rank: 'normal' }, 10).filter(Boolean).length / 4000;
    expect(normal).toBeGreaterThan(0.05);
    expect(normal).toBeLessThan(0.12);
    expect(rolls({ kind: 'foe', rank: 'boss', tier: 1 }, 10, 200).every(Boolean)).toBe(true);
  });

  it('roll rarer gear from tougher foes', () => {
    const rareShare = (source: GearSource) => {
      const found = rolls(source, 40).filter((r) => r !== null);
      return found.filter((r) => r!.rarity !== 'worn' && r!.rarity !== 'fine').length / found.length;
    };
    expect(rareShare({ kind: 'foe', rank: 'elite', tier: 3 })).toBeGreaterThan(rareShare({ kind: 'foe', rank: 'rare' }));
    expect(rareShare({ kind: 'foe', rank: 'boss' })).toBeGreaterThan(rareShare({ kind: 'foe', rank: 'elite', tier: 1 }));
  });

  it('hold back Mythic until level 20 and Relic until level 30', () => {
    const seen = (level: number) => new Set(rolls({ kind: 'foe', rank: 'boss', tier: 5 }, level, 500).map((r) => r!.rarity));
    expect(capRarity('relic', 19)).toBe('rare');
    expect(seen(19).has('mythic')).toBe(false);
    expect(seen(25).has('mythic')).toBe(true);
    expect(seen(25).has('relic')).toBe(false);
    expect(seen(30).has('relic')).toBe(true);
  });

  it('always reward the very first win', () => {
    expect(rollGear({ kind: 'foe', rank: 'normal' }, 1, {}, () => 0.99)).not.toBeNull();
  });
});

describe('found gear and the Forge', () => {
  it('a rarer find keeps the upgrades and runes already in the slot', () => {
    const game = new GameState(newSave(0));
    game.grantXp(xpTo(15));
    game.save.currencies.coin = 50_000;
    game.save.materials.ironbark = 500;
    expect(game.upgradeGear('staff')).toBe(false); // Nothing found yet.
    expect(game.takeGear('staff', 'fine').kept).toBe(true);
    for (let i = 0; i < 5; i++) expect(game.upgradeGear('staff')).toBe(true);
    game.save.runes.push('nightfang');
    expect(game.socketRune('staff', 'nightfang')).toBe(true);
    const before = game.bonuses().petDamage;

    const find = game.takeGear('staff', 'rare');
    expect(find.text).toContain('+5');
    expect(game.save.gear.staff).toEqual({ slot: 'staff', rarity: 'rare', plus: 5, runes: ['nightfang'] });
    expect(game.bonuses().petDamage).toBeGreaterThan(before);
  });

  it('melts a find that is not rarer into its material', () => {
    const game = new GameState(newSave(0));
    game.takeGear('cloak', 'rare');
    const find = game.takeGear('cloak', 'fine');
    expect(find.kept).toBe(false);
    expect(game.save.gear.cloak!.rarity).toBe('rare');
    expect(game.save.materials.mistwool).toBe(3);
  });

  it('upgrades from level 5, to +5 until level 15', () => {
    const game = new GameState(newSave(0));
    game.save.currencies.coin = 5000;
    game.save.materials.ironbark = 100;
    game.takeGear('staff', 'worn');
    expect(game.upgradeGear('staff')).toBe(false);
    game.grantXp(xpTo(5));
    for (let i = 0; i < 7; i++) game.upgradeGear('staff');
    expect(game.save.gear.staff!.plus).toBe(5);
  });

  it('boots strengthen the stride boost', () => {
    const game = new GameState(newSave(0));
    game.grantXp(xpTo(5));
    game.build('mine', 0);
    game.save.gear.boots = item({ slot: 'boots', rarity: 'relic' });
    game.recordWalk(100, 0);
    expect(game.save.hearthstead.buildings.mine!.progressMs).toBe(Math.round(10 * 60_000 * (1 + 4.5 * 0.05)));
  });
});

describe('expeditions', () => {
  it('only go to visited realms, finish faster with walking, and pay out', () => {
    const game = new GameState(newSave(0));
    game.grantXp(xpTo(8));
    expect(game.sendExpedition('p1', 5, 'tidemere', 3_600_000, 0)).toBe(false);
    game.visitRealm('tidemere');
    expect(game.sendExpedition('p1', 5, 'tidemere', 3_600_000, 0)).toBe(true);
    expect(game.sendExpedition('p1', 5, 'tidemere', 3_600_000, 0)).toBe(false);
    expect(game.claimExpedition('p1', 1000)).toBeNull();
    game.build('mine', 0);
    game.recordWalk(300, 0); // 30 minutes skipped.
    expect(expeditionProgress(game.save.expeditions[0], 30 * 60_000)).toBe(1);
    const done = game.claimExpedition('p1', 30 * 60_000)!;
    expect(done.reward.materials.mistwool).toBeGreaterThan(0);
    expect(game.save.materials.mistwool).toBe(done.reward.materials.mistwool);
  });

  it('pay more for longer trips', () => {
    const e = { petUid: 'p', petLevel: 10, realm: 'wildwood' as const, startedAt: 0, durationMs: 3_600_000, boostMs: 0 };
    expect(expeditionReward({ ...e, durationMs: 4 * 3_600_000 }).materials.ironbark).toBeGreaterThan(expeditionReward(e).materials.ironbark! * 3);
  });
});

describe('save version 5', () => {
  it('folds crafted gear into one piece per slot, keeping the best upgrade', () => {
    const save = migrate({
      version: 4,
      gear: [
        { id: 'a', slot: 'staff', rarity: 'fine', plus: 2, runes: [] },
        { id: 'b', slot: 'staff', rarity: 'worn', plus: 6, runes: ['seer', 'warding', 'bogus'] },
        { id: 'c', slot: 'cloak', rarity: 'rare', plus: 0, runes: [] },
        { id: 'x', slot: 'hat', rarity: 'worn' },
      ],
      equipped: { staff: 'a', hat: 'x' },
      materials: { ironbark: 1 },
      realmsVisited: ['wildwood', 'narnia'],
    });
    expect(save.gear).toEqual({
      staff: { slot: 'staff', rarity: 'fine', plus: 6, runes: [] },
      cloak: { slot: 'cloak', rarity: 'rare', plus: 0, runes: [] },
    });
    expect(save.runes).toEqual(['seer', 'warding']);
    expect(save.materials.ironbark).toBe(1 + 2); // The spare Worn Staff melted.
    expect(save.realmsVisited).toEqual(['wildwood']);
  });

  it('reads the new shape back and returns runes beyond open sockets', () => {
    const save = migrate({ version: 5, gear: { boots: { rarity: 'mythic', plus: 5, runes: ['seer', 'warding'] }, hat: { rarity: 'worn' } } });
    expect(save.gear).toEqual({ boots: { slot: 'boots', rarity: 'mythic', plus: 5, runes: ['seer'] } });
    expect(save.runes).toEqual(['warding']);
  });
});
