import { exportSave, importSave } from '../game/save';
import { MATERIALS, REALMS, type MaterialId, type RealmId } from '../game/realms';
import type { GameState } from '../game/state';
import { nextUnlock, UNLOCKS } from '../game/wayfarer';
import { sound } from '../audio/sound';
import { formatCount, formatDistance } from './format';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

/** Top bar, realm banner, reward toasts and the satchel panel. */
export class Hud {
  private readonly levelEl = $('level');
  private readonly xpBar = $('xp-bar');
  private readonly distanceEl = $('distance');
  private readonly coinEl = $('coin');
  private readonly lightEl = $('wanderlight');
  private readonly realmEl = $('realm');
  private readonly toastEl = $('toast');
  private readonly satchel = $<HTMLDialogElement>('satchel');
  private toastTimer: ReturnType<typeof setTimeout> | undefined;
  private realm: RealmId | undefined;

  constructor(private readonly game: GameState) {
    $('satchel-open').addEventListener('click', () => {
      this.renderSatchel();
      this.satchel.showModal();
      sound.play('open');
    });
    $('satchel-close').addEventListener('click', () => this.satchel.close());
    this.satchel.addEventListener('click', (e) => {
      if (e.target === this.satchel) this.satchel.close(); // Tap on the backdrop.
    });
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
    this.xpBar.style.width = lvl.needed ? `${(100 * lvl.into) / lvl.needed}%` : '100%';
    this.xpBar.parentElement?.setAttribute('aria-label', `${formatCount(lvl.into)} of ${formatCount(lvl.needed)} XP`);
    this.distanceEl.textContent = formatDistance(s.distanceMetres);
    this.coinEl.textContent = formatCount(s.currencies.coin);
    this.lightEl.textContent = formatCount(s.currencies.wanderlight);
    document.body.classList.toggle('blessed', this.game.isBlessed());
    if (this.satchel.open) this.renderSatchel();
  }

  setRealm(realm: RealmId | undefined): void {
    if (realm === this.realm) return;
    const first = this.realm === undefined;
    this.realm = realm;
    this.realmEl.hidden = !realm;
    if (!realm) return;
    const r = REALMS[realm];
    this.realmEl.style.setProperty('--realm', r.color);
    this.realmEl.innerHTML = `<b>${r.name[0].toUpperCase()}${r.name.slice(1)}</b><span>${r.flavour}</span>`;
    if (!first) {
      sound.play('realm');
      this.realmEl.classList.remove('arrive');
      void this.realmEl.offsetWidth; // Restart the arrival animation.
      this.realmEl.classList.add('arrive');
    }
  }

  toast(text: string, ms = 3800, grand = false): void {
    this.toastEl.textContent = text;
    this.toastEl.classList.toggle('grand', grand);
    this.toastEl.hidden = false;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => (this.toastEl.hidden = true), ms);
  }

  private renderSatchel(): void {
    const s = this.game.save;
    const lvl = this.game.level;
    const next = nextUnlock(lvl.level);
    $('satchel-level').textContent = `Wayfarer level ${lvl.level}`;
    $('satchel-xp').textContent = lvl.needed
      ? `${formatCount(lvl.into)} / ${formatCount(lvl.needed)} XP to level ${lvl.level + 1}`
      : 'Highest level reached';
    $('satchel-next').textContent = next ? `Next: ${next.what} at level ${next.level}` : 'Everything unlocked';
    $('satchel-unlocks').innerHTML = UNLOCKS.map(
      (u) =>
        `<li class="${u.level <= lvl.level ? 'open' : ''}"><span>${u.level}</span>${u.what}</li>`,
    ).join('');

    const mats = (Object.keys(MATERIALS) as MaterialId[])
      .map((id) => `<li><b>${formatCount(s.materials[id] ?? 0)}</b> ${MATERIALS[id].name}<small>${MATERIALS[id].from}</small></li>`)
      .join('');
    $('satchel-materials').innerHTML = `
      <li><b>${formatCount(s.currencies.coin)}</b> Coin<small>from everything</small></li>
      <li><b>${formatCount(s.currencies.wanderlight)}</b> Wanderlight<small>only from walking</small></li>
      ${mats}`;
    $('satchel-stats').innerHTML = `
      <li><b>${formatDistance(s.distanceMetres)}</b> wandered</li>
      <li><b>${formatCount(s.shrinesVisited)}</b> shrine visits</li>
      <li><b>${formatCount(s.visitedCells.length)}</b> map squares walked</li>`;
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
