import { sound } from '../audio/sound';

export type JournalTab = 'wayfarer' | 'bestiary' | 'hearth' | 'settings';

const TABS: JournalTab[] = ['wayfarer', 'bestiary', 'hearth', 'settings'];
const TITLES: Record<JournalTab, string> = {
  wayfarer: 'Hero',
  bestiary: 'Bestiary',
  hearth: 'The Hearthstead',
  settings: 'Settings',
};

/**
 * The one sheet behind the hero's portrait button: the hero, the Bestiary, the Hearthstead
 * and settings as tabs, so the map keeps only a handful of buttons. Each panel
 * renders into its pane when its tab is shown, and can light a dot on its tab and on
 * the map button when something waits there.
 */
class Journal {
  private readonly dialog = document.getElementById('journal') as HTMLDialogElement;
  private readonly button = document.getElementById('journal-open')!;
  private readonly renderers = new Map<JournalTab, (() => void)[]>();
  private readonly badges = new Map<JournalTab, string>();
  private tab: JournalTab = 'wayfarer';

  constructor() {
    this.button.addEventListener('click', () => this.open());
    document.getElementById('journal-close')?.addEventListener('click', () => this.close());
    this.dialog.addEventListener('click', (e) => {
      if (e.target === this.dialog) this.close(); // Tap on the backdrop.
    });
    for (const tab of TABS) this.tabButton(tab).addEventListener('click', () => this.show(tab));
  }

  /** Registers how a tab (or part of it) draws itself; called each time the tab is shown. */
  onShow(tab: JournalTab, render: () => void): void {
    this.renderers.set(tab, [...(this.renderers.get(tab) ?? []), render]);
  }

  pane(tab: JournalTab): HTMLElement {
    return document.getElementById(`journal-${tab}`)!;
  }

  /** True while the journal is open on this tab, so a panel knows to redraw. */
  showing(tab: JournalTab): boolean {
    return this.dialog.open && this.tab === tab;
  }

  open(tab: JournalTab = this.tab): void {
    if (this.tabButton(tab).hidden) tab = 'wayfarer';
    this.show(tab);
    if (!this.dialog.open) {
      this.dialog.showModal();
      sound.play('open');
    }
  }

  close(): void {
    this.dialog.close();
  }

  setTabHidden(tab: JournalTab, hidden: boolean): void {
    this.tabButton(tab).hidden = hidden;
    if (hidden && this.tab === tab) this.tab = 'wayfarer';
  }

  /** A dot (or a short count) on a tab, echoed on the map button. Empty clears it. */
  setBadge(tab: JournalTab, badge: string | boolean): void {
    const text = badge === true ? '•' : badge || '';
    if (text) this.badges.set(tab, text);
    else this.badges.delete(tab);
    this.tabButton(tab).dataset.badge = text;
    this.button.dataset.badge = this.badges.size ? '•' : '';
  }

  /** Changes the heading, e.g. to show the Wayfarer's level. */
  setTitle(text: string): void {
    document.getElementById('journal-title')!.textContent = text;
  }

  private show(tab: JournalTab): void {
    this.tab = tab;
    this.setTitle(TITLES[tab]);
    for (const t of TABS) {
      this.tabButton(t).setAttribute('aria-selected', String(t === tab));
      this.pane(t).hidden = t !== tab;
    }
    this.renderers.get(tab)?.forEach((render) => render());
    this.pane(tab).scrollTop = 0;
  }

  private tabButton(tab: JournalTab): HTMLButtonElement {
    return document.getElementById(`journal-tab-${tab}`) as HTMLButtonElement;
  }
}

export const journal = new Journal();
