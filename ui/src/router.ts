// Hash routes, so the console works from a static build: #/run, #/holds/rv_01, #/proposals/pair-2, #/summary.
// `?record=ID` on any route opens the record drawer over it.
export interface Route { path: string[]; query: URLSearchParams }

export function current(): Route {
  const h = location.hash.replace(/^#\/?/, '');
  const [p, q = ''] = h.split('?');
  return { path: p.split('/').filter(Boolean).map(decodeURIComponent), query: new URLSearchParams(q) };
}

export function href(path: string[], query?: Record<string, string | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(query ?? {})) if (v) q.set(k, v);
  const qs = q.toString();
  return `#/${path.map(encodeURIComponent).join('/')}${qs ? `?${qs}` : ''}`;
}

const DRAWER_KEYS = ['record', 'mark', 'from'];

/** The same screen, with its own query kept, and the drawer opened on a record (or closed, with null). */
export function withRecord(id: string | null, extra: Record<string, string | undefined> = {}): string {
  const r = current();
  const own = Object.fromEntries([...r.query].filter(([k]) => !DRAWER_KEYS.includes(k)));
  return href(r.path, id ? { ...own, record: id, ...extra } : own);
}

/** The screen's own query (a tab, a filter) without the drawer's keys, for telling a screen change from a drawer change. */
export const screenKey = (r: Route) => `${r.path.join('/')}?${[...r.query].filter(([k]) => !DRAWER_KEYS.includes(k)).map(([k, v]) => `${k}=${v}`).join('&')}`;
