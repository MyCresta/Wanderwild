import { describe, expect, it } from 'vitest';
import { craftItem, gearBonuses, maxPlus, power, runeSockets, type GearItem } from '../src/game/gear';
import { expeditionProgress, expeditionReward } from '../src/game/expeditions';
import { migrate, newSave } from '../src/game/save';
import { GameState } from '../src/game/state';
import { xpForLevel } from '../src/game/wayfarer';

const xpTo = (level: number) => Array.from({ length: level - 1 }, (_, i) => xpForLevel(i + 2)).reduce((a, b) => a + b, 0);
const item = (over: Partial<GearItem> = {}): GearItem => ({ id: 'g', slot: 'staff', rarity: 'worn', plus: 0, runes: [], ...over });

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

  it('never crafts Mythic gear before level 30', () => {
    const rarities = new Set(Array.from({ length: 500 }, (_, i) => craftItem('cloak', 29, i).rarity));
    expect(rarities.has('mythic')).toBe(false);
    expect(rarities.has('rare')).toBe(true);
  });

  it('adds up bonuses per slot and rune', () => {
    const b = gearBonuses([
      item({ slot: 'staff' }),
      item({ id: 'b', slot: 'boots', runes: ['swiftsole'] }),
      item({ id: 'l', slot: 'lantern', runes: ['seer'] }),
    ]);
    expect(b.petDamage).toBeCloseTo(1.04);
    expect(b.stride).toBeCloseTo(1.15);
    expect(b.reachM).toBeCloseTo(18);
    expect(b.catchBonus).toBe(0);
  });
});

describe('the Forge', () => {
  it('needs level 5, crafts, auto-equips and upgrades', () => {
    const game = new GameState(newSave(0));
    game.save.currencies.coin = 5000;
    game.save.materials.ironbark = 100;
    expect(game.craft('staff', 1)).toBeNull();
    game.grantXp(xpTo(5));
    const staff = game.craft('staff', 1)!;
    expect(game.save.equipped.staff).toBe(staff.id);
    expect(game.bonuses().petDamage).toBeGreaterThan(1);
    for (let i = 0; i < 7; i++) game.upgradeGear(staff.id);
    expect(staff.plus).toBe(5); // Capped until level 15.
  });

  it('salvages spare gear and sockets runes', () => {
    const game = new GameState(newSave(0));
    game.grantXp(xpTo(15));
    game.save.currencies.coin = 1000;
    game.save.materials.mistwool = 50;
    const a = game.craft('cloak', 1)!;
    const b = game.craft('cloak', 2)!;
    expect(game.salvage(a.id)).toBe(false); // Equipped.
    expect(game.salvage(b.id)).toBe(true);
    game.save.runes.push('warding');
    expect(game.socketRune(a.id, 'warding')).toBe(false); // No socket at +0.
    a.plus = 5;
    expect(game.socketRune(a.id, 'warding')).toBe(true);
    expect(game.save.runes).toEqual([]);
  });

  it('boots strengthen the stride boost', () => {
    const game = new GameState(newSave(0));
    game.grantXp(xpTo(5));
    game.build('mine', 0);
    game.save.gear.push(item({ id: 'boots', slot: 'boots', rarity: 'relic' }));
    game.save.equipped.boots = 'boots';
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

describe('save version 3', () => {
  it('keeps valid gear and drops broken entries', () => {
    const save = migrate({
      version: 2,
      gear: [item({ plus: 3, runes: ['seer', 'bogus' as never] }), { id: 'x', slot: 'hat', rarity: 'worn' }],
      equipped: { staff: 'g', hat: 'x' },
      realmsVisited: ['wildwood', 'narnia'],
    });
    expect(save.gear).toEqual([item({ plus: 3, runes: ['seer'] })]);
    expect(save.equipped).toEqual({ staff: 'g' });
    expect(save.realmsVisited).toEqual(['wildwood']);
  });
});
