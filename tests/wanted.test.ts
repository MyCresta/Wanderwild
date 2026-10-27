import { describe, expect, it } from 'vitest';
import { haversine } from '../src/geo/distance';
import { lairWeek } from '../src/game/lairs';
import { WANTED_COUNT, wantedAnchor, wantedPosts } from '../src/game/wanted';

const NOW = 1_800_000_000_000;

function memory(): Pick<Storage, 'getItem' | 'setItem'> {
  const data = new Map<string, string>();
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
}

describe('wanted board', () => {
  it('pins the board once a week where the Wayfarer first was', () => {
    const store = memory();
    const a = wantedAnchor(55.95, -3.19, NOW, store);
    expect(wantedAnchor(56.5, -3.5, NOW + 60_000, store)).toEqual(a);
    const next = wantedAnchor(56.5, -3.5, NOW + 7 * 24 * 3600_000, store);
    expect(next.week).toBe(lairWeek(NOW) + 1);
    expect(next.lat).toBe(56.5);
  });

  it('posts three different named Blotspawn, each further and tougher', () => {
    const anchor = { week: lairWeek(NOW), lat: 55.95, lng: -3.19 };
    const posts = wantedPosts(anchor, 8);
    expect(posts).toHaveLength(WANTED_COUNT);
    expect(new Set(posts.map((p) => p.encounter.species.id)).size).toBe(WANTED_COUNT);
    expect(new Set(posts.map((p) => p.encounter.bounty.name)).size).toBe(WANTED_COUNT);
    const dist = posts.map((p) => haversine(anchor, p.spawn));
    for (let i = 1; i < posts.length; i++) {
      expect(dist[i]).toBeGreaterThan(dist[i - 1]);
      expect(posts[i].encounter.level).toBeGreaterThan(posts[i - 1].encounter.level);
      expect(posts[i].encounter.bounty.coin).toBeGreaterThan(posts[i - 1].encounter.bounty.coin);
    }
    expect(dist[0]).toBeCloseTo(350, -1);
    expect(posts[2].encounter.rank).toBe('elite');
    expect(posts[2].encounter.bounty.gear).toBe(true);
    expect(posts.every((p) => p.encounter.species.name === p.encounter.bounty.name)).toBe(true);
  });

  it('is the same board for the same week, and a new one next week', () => {
    const anchor = { week: lairWeek(NOW), lat: 55.95, lng: -3.19 };
    expect(wantedPosts(anchor, 8)).toEqual(wantedPosts(anchor, 8));
    expect(wantedPosts({ ...anchor, week: anchor.week + 1 }, 8)[0].spawn.id).not.toBe(wantedPosts(anchor, 8)[0].spawn.id);
  });
});
