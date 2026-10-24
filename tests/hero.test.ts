import { describe, expect, it } from 'vitest';
import {
  canPickSecond,
  heroMods,
  heroStats,
  knownSpells,
  maxMana,
  newHero,
  openTalentRows,
  SECOND_CLASS_LEVEL,
  spellCost,
  talentRows,
} from '../src/game/hero';
import { migrate, newSave } from '../src/game/save';
import { GameState } from '../src/game/state';

describe('the hero', () => {
  it('grows the stats its class favours', () => {
    const warden = heroStats({ ...newHero(), cls: 'warden' }, 20);
    const beast = heroStats({ ...newHero(), cls: 'beastcaller' }, 20);
    expect(warden.ward).toBeGreaterThan(beast.ward);
    expect(beast.might).toBeGreaterThan(warden.might);
  });

  it('learns spells by level, and a second class from level 20', () => {
    const hero = { ...newHero(), cls: 'arcanist' as const };
    expect(knownSpells(hero, 1)).toEqual(['wheelbolt']);
    expect(knownSpells(hero, 12)).toEqual(['wheelbolt', 'hex', 'starfall']);
    expect(canPickSecond(hero, SECOND_CLASS_LEVEL - 1)).toBe(false);
    expect(canPickSecond(hero, SECOND_CLASS_LEVEL)).toBe(true);
    const dual = { ...hero, second: 'warden' as const };
    expect(knownSpells(dual, 20)).toContain('mending');
    expect(talentRows(dual)).toHaveLength(6);
  });

  it('applies picked talents only once their row is open', () => {
    const hero = { ...newHero(), cls: 'arcanist' as const, talents: { arcanist0: 0 as const, arcanist1: 1 as const } };
    expect(heroMods(hero, 5).spellPower).toBeCloseTo(0.2);
    expect(heroMods(hero, 5).thrift).toBe(0);
    expect(spellCost(hero, 10, 'starfall')).toBeLessThan(spellCost(hero, 9, 'starfall'));
    expect(openTalentRows({ ...newHero(), cls: 'warden' }, 15)).toBe(3);
  });

  it('picks classes and talents through the game, and resets talents for free', () => {
    const game = new GameState(newSave(0));
    expect(game.pickTalent('warden', 0, 1)).toBe(false);
    expect(game.chooseClass('warden')).toBe(true);
    expect(game.chooseClass('arcanist')).toBe(false);
    game.save.wayfarer.xp = 1e6;
    expect(game.pickTalent('warden', 0, 1)).toBe(true);
    expect(game.chooseClass('warden')).toBe(false);
    expect(game.chooseClass('beastcaller')).toBe(true);
    expect(game.save.hero.second).toBe('beastcaller');
    game.resetTalents();
    expect(game.save.hero.talents).toEqual({});
  });

  it('turns old spell charge into mana and keeps the hero through a save', () => {
    const old = { ...newSave(0), spellChargeM: 500 } as Record<string, unknown>;
    delete old.hero;
    expect(migrate(old).hero.mana).toBe(20);
    const save = newSave(0);
    save.hero = { ...newHero(), name: 'Ysolde', cls: 'warden', second: 'warden', talents: { warden0: 1, bogus: 0 } };
    const back = migrate(JSON.parse(JSON.stringify(save)));
    expect(back.hero).toMatchObject({ name: 'Ysolde', cls: 'warden', second: null, talents: { warden0: 1 } });
    expect(maxMana(back.hero, 1)).toBeGreaterThan(0);
  });
});
