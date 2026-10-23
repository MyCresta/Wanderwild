/**
 * Keeps the screen layout clear of the top bar. The rails of round buttons start
 * below it (or beside it, on a wide screen where it leaves the corners free), and
 * banners stack under the whole header, however tall the title, realm and
 * notices make it. See the layout block at the top of style.css.
 */

/** Room a rail needs beside a centred top bar: two columns of buttons and their gaps. */
const RAIL_ROOM_PX = 16 + 56 + 12 + 56 + 12;

export function railButtons(side: 'left' | 'right'): HTMLElement {
  return document.getElementById(`rail-${side}`)!;
}

/** Where short-lived banners go, so they stack instead of covering each other. */
export function bannerStack(): HTMLElement {
  return document.getElementById('banners') ?? document.body;
}

export function watchLayout(): void {
  const hud = document.querySelector<HTMLElement>('.hud');
  const bar = document.querySelector<HTMLElement>('.hud-bar');
  if (!hud || !bar) return;
  const root = document.documentElement.style;
  const update = () => {
    const b = bar.getBoundingClientRect();
    const besideBar = b.left >= RAIL_ROOM_PX;
    root.setProperty('--rail-top', `${Math.round(besideBar ? b.top : b.bottom + 12)}px`);
    root.setProperty('--hud-bottom', `${Math.round(hud.getBoundingClientRect().bottom)}px`);
  };
  new ResizeObserver(update).observe(hud);
  addEventListener('resize', update);
  update();
}
