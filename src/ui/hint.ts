/**
 * The one "something waits here" mark, used everywhere: a small red dot on the corner of a
 * button or tab (or a short count). It is an overlay, so it never moves or resizes anything.
 */
export function hintText(on: boolean | string | number): string {
  return on === true ? '•' : on ? String(on) : '';
}

export function hint(el: HTMLElement, on: boolean | string | number): void {
  el.dataset.hint = hintText(on);
}

/** The same mark for panels drawn as HTML strings. */
export const hintAttr = (on: boolean | string | number) => (hintText(on) ? ` data-hint="${hintText(on)}"` : '');
