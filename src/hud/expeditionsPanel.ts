import { EXPEDITION_LENGTHS, EXPEDITION_LEVEL, EXPEDITION_SLOTS, expeditionDone, expeditionProgress, expeditionReward, msLeft, trailSpot } from '../game/expeditions';
import { MATERIALS, REALMS, type MaterialId, type RealmId } from '../game/realms';
import type { GameState } from '../game/state';
import { companion, grantPetXp, partyPets, type OwnedPet } from '../creatures/collection';
import { getSpecies } from '../creatures/species';
import { createCreatureSvg } from '../creatures/view';
import type { GameContext } from '../ui/context';
import { h } from '../ui/dom';
import { hint } from '../ui/hint';
import { journal } from '../ui/journal';
import { formatCount, formatDuration } from './format';

const HOUR = 3_600_000;
const PLAN_KEY = 'wanderwild.expeditionPlan';
const realmName = (r: RealmId) => REALMS[r].name.replace(/^the /, '');
const petName = (pet: OwnedPet | undefined) => (pet ? getSpecies(pet.speciesId).name : 'A Wildling');

/**
 * The journal's Trips tab: three trails from the Hearthstead out to a realm and back. Each
 * Wildling walks its trail as the trip runs. One button does what is needed next: welcome
 * everyone home, then send them all out again, so a whole round takes two taps.
 */
export class ExpeditionsPanel {
  private readonly body = journal.pane('trips');
  /** Who waits at the head of each empty trail; tap one to swap in another free Wildling. */
  private picks: string[] = [];
  private plan: { realm: RealmId | null; hours: number } = { realm: null, hours: 1 };

  constructor(
    private readonly game: GameState,
    private readonly creatures: GameContext,
    private readonly toast: (text: string) => void,
  ) {
    try {
      const saved = JSON.parse(localStorage.getItem(PLAN_KEY) ?? '{}');
      if (saved.realm in REALMS) this.plan.realm = saved.realm;
      if (EXPEDITION_LENGTHS.includes(saved.hours * HOUR)) this.plan.hours = saved.hours;
    } catch {
      // A private window or blocked storage: start with the defaults.
    }
    journal.onShow('trips', () => this.render());
    game.on((event) => {
      if (event.kind !== 'change') return;
      if (journal.showing('trips')) this.render();
      else this.markReady();
    });
    // Trails creep forward and trips finish while the journal is open or shut.
    setInterval(() => (journal.showing('trips') ? this.render() : this.markReady()), 20_000);
    this.markReady();
  }

  private savePlan(): void {
    try {
      localStorage.setItem(PLAN_KEY, JSON.stringify(this.plan));
    } catch {
      // Not remembered on this device; the choice still holds for now.
    }
  }

  /** Wildlings that can go: not away, not in the fighting party, not the companion. */
  private free(): OwnedPet[] {
    const c = this.creatures.collection;
    const away = new Set(this.game.save.expeditions.map((e) => e.petUid));
    const party = new Set(partyPets(c).map((p) => p.uid));
    const walking = companion(c)?.uid;
    return c.pets.filter((p) => !away.has(p.uid) && !party.has(p.uid) && p.uid !== walking).sort((a, b) => b.level - a.level);
  }

  /** Keeps each empty trail's pick free and distinct, filling gaps with the strongest left. */
  private fillPicks(slots: number): string[] {
    const free = this.free();
    const freeIds = new Set(free.map((p) => p.uid));
    const picks = this.picks.filter((uid, i, all) => freeIds.has(uid) && all.indexOf(uid) === i).slice(0, slots);
    for (const p of free) if (picks.length < slots && !picks.includes(p.uid)) picks.push(p.uid);
    this.picks = picks;
    return picks;
  }

  private swap(i: number): void {
    const free = this.free().map((p) => p.uid);
    const others = this.picks.filter((_, j) => j !== i);
    const start = free.indexOf(this.picks[i]);
    for (let k = 1; k <= free.length; k++) {
      const next = free[(start + k) % free.length];
      if (!others.includes(next)) {
        this.picks[i] = next;
        break;
      }
    }
    this.render();
  }

  private realm(): RealmId | null {
    const visited = this.game.save.realmsVisited;
    return this.plan.realm && visited.includes(this.plan.realm) ? this.plan.realm : (visited[0] ?? null);
  }

  private welcomeHome(): void {
    const c = this.creatures.collection;
    const now = Date.now();
    const materials: Partial<Record<MaterialId, number>> = {};
    let coin = 0;
    const home: string[] = [];
    const grew: string[] = [];
    for (const e of this.game.save.expeditions.filter((x) => expeditionDone(x, now))) {
      const done = this.game.claimExpedition(e.petUid, now);
      if (!done) continue;
      for (const [m, n] of Object.entries(done.reward.materials) as [MaterialId, number][]) materials[m] = (materials[m] ?? 0) + n;
      coin += done.reward.coin;
      const pet = c.pets.find((p) => p.uid === e.petUid);
      home.push(petName(pet));
      if (pet && grantPetXp(pet, done.reward.petXp)) grew.push(`${petName(pet)} grew to level ${pet.level}`);
      // Line the ones just home up for the same trip again.
      if (pet) this.picks.unshift(pet.uid);
    }
    if (!home.length) return;
    this.creatures.changed();
    const haul = Object.entries(materials).map(([m, n]) => `${n} ${MATERIALS[m as MaterialId].name}`);
    const who = home.length === 1 ? `${home[0]} is` : `${home.length} Wildlings are`;
    this.toast(`${who} home with ${[...haul, `${coin} coin`].join(', ')}!${grew.length ? ` ${grew.join('; ')}.` : ''}`);
  }

  private sendOut(): void {
    const realm = this.realm();
    if (!realm) return;
    const c = this.creatures.collection;
    const slots = EXPEDITION_SLOTS - this.game.save.expeditions.length;
    const sent = this.fillPicks(slots).filter((uid) => {
      const pet = c.pets.find((p) => p.uid === uid);
      return pet && this.game.sendExpedition(uid, pet.level, realm, this.plan.hours * HOUR);
    });
    if (!sent.length) return;
    this.picks = [];
    this.creatures.changed();
    const who = sent.length === 1 ? `${petName(c.pets.find((p) => p.uid === sent[0]))} sets` : `${sent.length} Wildlings set`;
    this.toast(`${who} off for ${REALMS[realm].name}.`);
  }

  /** Dots the tab once someone is home from a trip, and hides it until expeditions open. */
  private markReady(): void {
    const now = Date.now();
    journal.setTabHidden('trips', this.game.level.level < EXPEDITION_LEVEL);
    journal.setBadge('trips', this.game.save.expeditions.some((e) => expeditionDone(e, now)));
  }

  render(): void {
    this.markReady();
    const s = this.game.save;
    if (this.game.level.level < EXPEDITION_LEVEL) {
      this.body.replaceChildren(h('p', { class: 'satchel-hint' }, `Expeditions open at level ${EXPEDITION_LEVEL}.`));
      return;
    }
    const now = Date.now();
    const c = this.creatures.collection;
    const realm = this.realm();
    const doneCount = s.expeditions.filter((e) => expeditionDone(e, now)).length;
    const picks = this.fillPicks(EXPEDITION_SLOTS - s.expeditions.length);
    const canSwap = this.free().length > picks.length;

    // Where to and how long: chosen once, kept for every send after.
    const where = realm
      ? h(
          'div',
          { class: 'trip-chips', role: 'radiogroup', 'aria-label': 'Realm' },
          ...s.realmsVisited.map((r) =>
            h(
              'button',
              {
                type: 'button',
                role: 'radio',
                'aria-checked': String(r === realm),
                style: `--realm:${REALMS[r].color}`,
                title: `Brings back ${MATERIALS[REALMS[r].material].name}`,
                onclick: () => {
                  this.plan.realm = r;
                  this.savePlan();
                  this.render();
                },
              },
              realmName(r),
            ),
          ),
        )
      : h('p', { class: 'trip-chips satchel-hint' }, 'Walk into a realm first; Wildlings only go where you have been.');
    const howLong = h(
      'div',
      { class: 'trip-chips trip-lengths', role: 'radiogroup', 'aria-label': 'Length' },
      ...EXPEDITION_LENGTHS.map((ms) =>
        h(
          'button',
          {
            type: 'button',
            role: 'radio',
            'aria-checked': String(ms === this.plan.hours * HOUR),
            onclick: () => {
              this.plan.hours = ms / HOUR;
              this.savePlan();
              this.render();
            },
          },
          formatDuration(ms),
        ),
      ),
    );

    // The trails: busy ones first, then the empty ones with who would go next.
    const trails: HTMLElement[] = s.expeditions.map((e) => {
      const pet = c.pets.find((p) => p.uid === e.petUid);
      const p = expeditionProgress(e, now);
      const done = p >= 1;
      const spot = trailSpot(p);
      return this.trail({
        realm: e.realm,
        pet,
        at: spot.at,
        facing: spot.back ? -1 : 1,
        label: petName(pet),
        note: done ? 'Home!' : `${spot.back ? 'Heading home' : 'Exploring'} · ${formatDuration(msLeft(e, now))}`,
        done,
      });
    });
    for (let i = trails.length, k = 0; i < EXPEDITION_SLOTS; i++, k++) {
      const pet = c.pets.find((p) => p.uid === picks[k]);
      const slot = k;
      trails.push(
        this.trail({
          realm,
          pet,
          at: 0,
          facing: 1,
          label: pet ? petName(pet) : 'No one free',
          note: pet ? (canSwap ? 'Ready · tap to swap' : 'Ready to go') : 'Your party stays with you',
          waiting: true,
          onclick: pet && canSwap ? () => this.swap(slot) : undefined,
        }),
      );
    }

    // One button: whatever is next.
    const canSend = !!realm && picks.length > 0 && s.expeditions.length < EXPEDITION_SLOTS;
    const next = s.expeditions.filter((e) => !expeditionDone(e, now)).reduce((m, e) => Math.min(m, msLeft(e, now)), Infinity);
    const action = h(
      'button',
      {
        type: 'button',
        class: 'trip-go',
        disabled: !doneCount && !canSend,
        onclick: () => {
          if (doneCount) this.welcomeHome();
          else this.sendOut();
          this.render();
        },
      },
      doneCount
        ? `Welcome home${doneCount > 1 ? ` (${doneCount})` : ''}`
        : canSend
          ? `Send out${picks.length > 1 ? ` (${picks.length})` : ''}`
          : Number.isFinite(next)
            ? `Next back in ${formatDuration(next)}`
            : 'No one free to go',
    );
    hint(action, doneCount > 0);
    const haul =
      realm && picks.length
        ? (() => {
            const pet = c.pets.find((p) => p.uid === picks[0])!;
            const r = expeditionReward({ petUid: '', petLevel: pet.level, realm, startedAt: 0, durationMs: this.plan.hours * HOUR, boostMs: 0 });
            return `Each brings about ${formatCount(Object.values(r.materials)[0] ?? 0)} ${MATERIALS[REALMS[realm].material].name} and ${r.coin} coin`;
          })()
        : 'Walking makes every trip faster';

    this.body.replaceChildren(
      where,
      howLong,
      h('ol', { class: 'trip-board', 'aria-label': 'Expeditions' }, ...trails),
      action,
      h('p', { class: 'trip-haul' }, haul),
    );
  }

  private trail(t: {
    realm: RealmId | null;
    pet: OwnedPet | undefined;
    at: number;
    facing: 1 | -1;
    label: string;
    note: string;
    done?: boolean;
    waiting?: boolean;
    onclick?: () => void;
  }): HTMLElement {
    const color = t.realm ? REALMS[t.realm].color : '#8a7a62';
    const walker = h('span', { class: 'trip-walker', style: { left: `${t.at * 100}%` } });
    if (t.pet) walker.append(createCreatureSvg({ speciesId: t.pet.speciesId, seed: t.pet.seed, size: 40, facing: t.facing, still: !!t.waiting }));
    const row = h(
      t.onclick ? 'button' : 'div',
      { class: 'trip-trail', type: t.onclick ? 'button' : undefined, onclick: t.onclick },
      h('span', { class: 'trip-home', 'aria-hidden': 'true' }),
      h('span', { class: 'trip-path', 'aria-hidden': 'true' }, h('span', { class: 'trip-path-done', style: { width: `${t.at * 100}%` } }), walker),
      h('span', { class: 'trip-realm', style: `--realm:${color}`, title: t.realm ? REALMS[t.realm].name : '' }, t.realm ? realmName(t.realm) : '?'),
      h('span', { class: 'trip-label' }, h('b', {}, t.label), h('small', {}, t.note)),
    );
    const li = h('li', { class: `trip${t.done ? ' trip-done' : ''}${t.waiting ? ' trip-waiting' : ''}` }, row);
    hint(row, !!t.done);
    return li;
  }
}
