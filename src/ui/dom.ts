import { sound } from '../audio/sound';
import { bannerStack } from './layout';

type Child = Node | string | null | undefined | false;

/** Tiny element builder: h('button', { class: 'x', onclick }, 'Label'). */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, unknown> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2), value as EventListener);
    else if (key === 'style' && typeof value === 'object') Object.assign(node.style, value);
    else node.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of children) if (child) node.append(child);
  return node;
}

export const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export interface Sheet {
  root: HTMLElement;
  body: HTMLElement;
  setTitle(text: string): void;
  close(): void;
  onClose(fn: () => void): void;
}

/** A parchment card over a dimmed map. Only one is open at a time. */
let current: Sheet | null = null;

export function openSheet(title: string, opts: { closable?: boolean; className?: string } = {}): Sheet {
  current?.close();
  const closers: (() => void)[] = [];
  const heading = h('h2', { class: 'sheet-title' }, title);
  const body = h('div', { class: 'sheet-body' });
  const card = h('section', { class: `sheet ${opts.className ?? ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': title });
  const root = h('div', { class: 'sheet-backdrop' }, card);
  const sheet: Sheet = {
    root,
    body,
    setTitle: (text) => {
      heading.textContent = text;
      card.setAttribute('aria-label', text);
    },
    close() {
      if (!root.isConnected) return;
      root.remove();
      if (current === sheet) current = null;
      closers.forEach((fn) => fn());
    },
    onClose: (fn) => closers.push(fn),
  };
  const header = h('header', { class: 'sheet-header' }, heading);
  if (opts.closable !== false) {
    header.append(h('button', { class: 'sheet-close', type: 'button', 'aria-label': 'Close', onclick: () => sheet.close() }, '✕'));
    root.addEventListener('click', (e) => e.target === root && sheet.close());
  }
  card.append(header, body);
  document.body.appendChild(root);
  sound.play('open');
  current = sheet;
  return sheet;
}

/** A short-lived banner, e.g. "Bramblet grew to level 4!". */
export function toast(text: string): void {
  const node = h('div', { class: 'toast', role: 'status' }, text);
  bannerStack().appendChild(node);
  setTimeout(() => node.classList.add('toast-out'), 2600);
  setTimeout(() => node.remove(), 3200);
}
