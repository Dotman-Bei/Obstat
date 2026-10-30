// A tagged template that escapes every value unless it is already markup. Dataset text is text, never HTML.
export class Markup {
  constructor(readonly value: string) {}
  toString() { return this.value; }
}

export const esc = (v: unknown) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const part = (v: unknown): string =>
  v instanceof Markup ? v.value : Array.isArray(v) ? v.map(part).join('') : v == null || v === false ? '' : esc(v);

export function html(strings: TemplateStringsArray, ...values: unknown[]): Markup {
  let out = strings[0];
  values.forEach((v, i) => { out += part(v) + strings[i + 1]; });
  return new Markup(out);
}

export const raw = (v: string) => new Markup(v);

export function el<T extends HTMLElement = HTMLElement>(markup: Markup): T {
  const t = document.createElement('template');
  t.innerHTML = markup.value.trim();
  return t.content.firstElementChild as T;
}
