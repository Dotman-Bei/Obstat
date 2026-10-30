// Dataset IDs in any text become links that open the record drawer over the current screen.
import { html, raw, type Markup } from './html.ts';
import { withRecord } from '../router.ts';

export const ID_RE = /\b(R\d{4}|SYN-(?:PUB|PRJ|PAT)-\d{4,5}|C\d{3}-CH\d+|C\d{3})\b/g;

export interface RefContext { mark?: string; from?: string }

export const ref = (id: string, ctx: RefContext = {}) =>
  html`<a class="ref" href="${withRecord(id, { mark: ctx.mark, from: ctx.from })}">${id}</a>`;

/** Escape the text and turn each ID in it into a ref. `markFor` picks what to highlight in each record. */
export function linkIds(text: string, markFor: (id: string) => RefContext = () => ({})): Markup {
  let out = '', last = 0;
  for (const m of text.matchAll(ID_RE)) {
    out += html`${text.slice(last, m.index)}`.value + ref(m[0], markFor(m[0])).value;
    last = m.index! + m[0].length;
  }
  return raw(out + html`${text.slice(last)}`.value);
}
