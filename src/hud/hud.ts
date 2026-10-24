import { exportSave, importSave } from '../game/save';
import { MATERIALS, REALMS, type MaterialId, type RealmId } from '../game/realms';
import type { GameState } from '../game/state';
import { UNLOCKS } from '../game/wayfarer';
import { sound } from '../audio/sound';
import { glyphSvg } from '../game/glyphs';
import { journal } from '../ui/journal';
import { formatCount, formatDistance, formatDuration } from './format';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

/** Top bar, realm banner, reward toasts, and the journal's Wayfarer and settings tabs. */
export class Hud {
  private readonly levelEl = $('level');
  private readonly xpBar = $('xp-bar');
  private readonly distanceEl = $('distance');
  private readonly coinEl = $('coin');
  private readonly realmEl = $('realm');
  private readonly toastEl = $('toast');
  private toastTimer: ReturnType<typeof setTimeout> | undefined;
  private realmTimer: ReturnType<typeof setTimeout> | undefined;
  private realm: RealmId | undefined;

  constructor(private readonly game: GameState) {
    journal.onShow('wayfarer', () => this.renderSatchel());
    this.setupSoundChoice();
    $('save-export').addEventListener('click', () => this.exportFile());
    const fileInput = $<HTMLInputElement>('save-file');
    $('save-import').addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => {
      const file = fileInput.files?.[0];
      fileInput.value = '';
      if (file) void this.importFile(file);
    });

    game.on((event) => {
      if (event.kind === 'change') this.render();
      else if (event.kind === 'reward') {
        sound.play('reward');
        this.toast(event.text);
      } else if (event.kind === 'stride') {
        sound.play('discover');
        this.stridePop(event.skippedMs);
      } else if (event.kind === 'hatch') {
        sound.play('hatch');
        this.toast(`Your ${event.hatchling.fromKm} km egg hatched! A ${event.hatchling.rarity} creature joins you.`, 6000, true);
      } else if (event.kind === 'glyph') {
        sound.play('spell');
        this.toast(event.text, 6000, true, glyphSvg(event.glyph, 44));
      } else if (event.kind === 'levelUp') {
        sound.play('levelUp', 0.3);
        const unlocked = event.unlocks.map((u) => u.what).join('; ');
        this.toast(`Wayfarer level ${event.level}!${unlocked ? ` Unlocked: ${unlocked}.` : ''}`, 6000, true);
      }
    });
    this.render();
  }

  render(): void {
    const s = this.game.save;
    const lvl = this.game.level;
    this.levelEl.textContent = String(lvl.level);
    const xp = lvl.needed ? `${(100 * lvl.into) / lvl.needed}%` : '100%';
    this.xpBar.style.width = xp;
    this.levelEl.style.setProperty('--xp', xp);
    this.xpBar.parentElement?.setAttribute('aria-label', `${formatCount(lvl.into)} of ${formatCount(lvl.needed)} XP`);
    this.distanceEl.textContent = formatDistance(s.distanceMetres);
    this.coinEl.textContent = formatCount(s.currencies.coin);
    document.body.classList.toggle('blessed', this.game.isBlessed());
    if (journal.showing('wayfarer')) this.renderSatchel();
  }

  /** Unfurls the realm's name for a few seconds when the Wayfarer walks into it. */
  setRealm(realm: RealmId | undefined): void {
    if (realm === this.realm) return;
    const first = this.realm === undefined;
    this.realm = realm;
    clearTimeout(this.realmTimer);
    this.realmEl.hidden = !realm;
    if (!realm) return;
    const r = REALMS[realm];
    this.realmEl.style.setProperty('--realm', r.color);
    this.realmEl.innerHTML = `<b>${r.name[0].toUpperCase()}${r.name.slice(1)}</b><span>${r.flavour}</span>`;
    if (!first) sound.play('realm');
    this.realmEl.classList.remove('arrive');
    void this.realmEl.offsetWidth; // Restart the arrival animation.
    this.realmEl.classList.add('arrive');
    this.realmTimer = setTimeout(() => (this.realmEl.hidden = true), 4500);
  }

  private stridePop(ms: number): void {
    const el = $('stride-pop');
    el.textContent = `Hearthstead +${formatDuration(ms)}`;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
  }

  /** Shows a message under the bar; `svg` is trusted markup drawn before the text. */
  toast(text: string, ms = 3800, grand = false, svg = ''): void {
    this.toastEl.textContent = text;
    if (svg) this.toastEl.insertAdjacentHTML('afterbegin', `<span class="toast-glyph">${svg}</span>`);
    this.toastEl.classList.toggle('grand', grand);
    this.toastEl.hidden = false;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => (this.toastEl.hidden = true), ms);
  }

  private renderSatchel(): void {
    const s = this.game.save;
    const lvl = this.game.level;
    $('satchel-unlocks').innerHTML = UNLOCKS.map(
      (u) =>
        `<li class="${u.level <= lvl.level ? 'open' : ''}"><span>${u.level}</span>${u.what}</li>`,
    ).join('');

    // Only what is actually in the satchel; the empty slots were noise.
    const mats = (Object.keys(MATERIALS) as MaterialId[])
      .filter((id) => (s.materials[id] ?? 0) > 0)
      .map((id) => `<li title="${MATERIALS[id].from}"><b>${formatCount(s.materials[id] ?? 0)}</b> ${MATERIALS[id].name}</li>`)
      .join('');
    $('satchel-materials').innerHTML = `
      <li><b>${formatCount(s.currencies.coin)}</b> Coin</li>
      <li title="Only from walking"><b>${formatCount(s.currencies.wanderlight)}</b> Wanderlight</li>
      ${mats}`;
    $('satchel-stats').innerHTML = `
      <li><b>${formatDistance(s.distanceMetres)}</b> wandered</li>
      <li><b>${formatCount(s.shrinesVisited)}</b> shrine visits</li>
      <li><b>${formatCount(s.visitedCells.length)}</b> map squares walked</li>`;
  }

  private setupSoundChoice(): void {
    const row = $('sound-choice');
    const render = (mode: string) => {
      for (const b of row.querySelectorAll<HTMLButtonElement>('button')) b.setAttribute('aria-checked', String(b.dataset.mode === mode));
    };
    row.addEventListener('click', (e) => {
      const mode = (e.target as HTMLElement).closest<HTMLButtonElement>('button')?.dataset.mode;
      if (mode) sound.setMode(mode as typeof sound.mode);
    });
    sound.onModeChange(render);
    render(sound.mode);
  }

  private exportFile(): void {
    const blob = new Blob([exportSave(this.game.save)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `wanderwild-save-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  private async importFile(file: File): Promise<void> {
    try {
      const save = importSave(await file.text());
      if (!confirm('Replace your current progress with this save? This cannot be undone.')) return;
      await this.game.replace(save);
      this.toast('Save loaded. Welcome back, Wayfarer.');
    } catch (err) {
      this.toast(err instanceof Error ? err.message : 'Could not read that save');
    }
  }
}
