import { haversine } from '../geo/distance';
import type { WantedPost } from '../game/wanted';
import { LAIR_WEEK_MS } from '../game/lairs';
import { createCreatureSvg } from '../creatures/view';
import { journal } from '../ui/journal';
import { formatDistance, formatDuration } from './format';

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;

function compass(from: { lat: number; lng: number }, to: { lat: number; lng: number }): string {
  const dx = (to.lng - from.lng) * Math.cos((from.lat * Math.PI) / 180);
  const dy = to.lat - from.lat;
  const deg = ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
  return COMPASS[Math.round(deg / 45) % 8];
}

export interface WantedHooks {
  /** This week's posters, or null before the Wayfarer has been found. */
  posts(): WantedPost[] | null;
  claimed(id: string): boolean;
  /** Where the Wayfarer stands, to say how far each poster is. */
  here(): { lat: number; lng: number } | null;
  /** Closes the journal and looks at the poster on the map. */
  show(post: WantedPost): void;
}

/** The Wanted board at the top of the Hearth tab: three named Blotspawn a week, each with a bounty. */
export class WantedBoard {
  private readonly el = document.createElement('section');

  constructor(private readonly hooks: WantedHooks) {
    this.el.className = 'wanted';
    journal.pane('hearth').prepend(this.el);
    journal.onShow('hearth', () => this.render());
    this.el.addEventListener('click', (e) => {
      const button = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-i]');
      const post = button && this.hooks.posts()?.[Number(button.dataset.i)];
      if (post) this.hooks.show(post);
    });
  }

  render(): void {
    const posts = this.hooks.posts();
    if (!posts) {
      this.el.innerHTML = '<h3>Wanted</h3><p class="wanted-empty">Posters go up once you have a location.</p>';
      return;
    }
    const here = this.hooks.here();
    const left = posts[0].spawn.expiresAt - Date.now();
    this.el.innerHTML = `<h3>Wanted <small>new posters in ${formatDuration(Math.min(left, LAIR_WEEK_MS))}</small></h3><ul class="wanted-list"></ul>`;
    const list = this.el.querySelector('ul')!;
    posts.forEach((post, i) => {
      const { encounter: e, spawn } = post;
      const done = this.hooks.claimed(spawn.id);
      const where = here ? ` · ${formatDistance(haversine(here, spawn))} ${compass(here, spawn)}` : '';
      const li = document.createElement('li');
      li.innerHTML = `<button type="button" class="wanted-post${done ? ' claimed' : ''}" data-i="${i}" ${done ? 'disabled' : ''}
          aria-label="${e.bounty.name}, level ${e.level}${where}${done ? ', claimed' : `, bounty ${e.bounty.coin} coin`}">
        <span class="wanted-art"></span>
        <span class="wanted-text"><b>${e.bounty.name}</b><small>Lv ${e.level}${where}</small></span>
        <span class="wanted-reward">${done ? '✓' : `${e.bounty.coin}c${e.bounty.gear ? ' + gear' : ''}`}</span>
      </button>`;
      li.querySelector('.wanted-art')!.append(createCreatureSvg({ speciesId: e.species.id, seed: e.seed, size: 36 }));
      list.append(li);
    });
  }
}
