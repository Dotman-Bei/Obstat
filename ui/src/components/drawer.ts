// S4 Record drawer. Its question: does this record really carry the ID the claim names?
// Opens over any screen from `?record=ID`, with `mark` (the value that decided a check) and `from` (reviewId.claim).
import { derive } from '../data/model.ts';
import { getJSON, store, subscribe } from '../data/store.ts';
import type { CheckResult, DatasetRecord, RecordType } from '../data/types.ts';
import { checkNames } from '../lib/format.ts';
import { el, html, type Markup } from '../lib/html.ts';
import { icons } from '../lib/icons.ts';
import { ID_RE, linkIds } from '../lib/refs.ts';
import { withRecord } from '../router.ts';
import type { Drawer } from '../shell.ts';

const typeNames: Record<RecordType, string> = {
  researcher: 'Researcher', publication: 'Publication', project: 'Project', patent: 'Patent', company: 'Company', challenge: 'Challenge',
};
const labels: Record<string, string> = {
  researcher_id: 'ID', publication_id: 'ID', project_id: 'ID', patent_id: 'ID', company_id: 'Company', challenge_id: 'ID',
  research_areas: 'Research areas', open_to: 'Open to', employees: 'Employees',
};
const label = (k: string) => labels[k] ?? k.charAt(0).toUpperCase() + k.slice(1).replace(/_/g, ' ');

type Person = { name: string; researcher_id: string | null; role?: string };

export function createDrawer(): Drawer {
  const dialog = el<HTMLDialogElement>(html`<dialog class="drawer" aria-labelledby="drawer-title">
    <div class="drawer-inner" data-body></div>
  </dialog>`);
  document.body.append(dialog);
  const body = dialog.querySelector<HTMLElement>('[data-body]')!;
  const trail: string[] = [];
  let openId: string | null = null;
  let token = 0;

  const close = () => { location.hash = withRecord(null); };
  dialog.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
  dialog.addEventListener('click', (e) => { if (e.target === dialog) close(); });
  dialog.addEventListener('click', (e) => {
    const t = e.target as Element;
    if (t.closest('[data-close]')) close();
    if (t.closest('[data-back]')) { const prev = trail[trail.length - 2]; if (prev) location.hash = withRecord(prev); }
    if (t.closest('[data-retry]') && openId) { const id = openId; openId = null; render(id, new URLSearchParams(location.hash.split('?')[1])); }
  });

  function why(id: string, from: string | null, mark: string | null): Markup {
    if (!from) return html``;
    const [reviewId, n] = from.split('.');
    const m = derive(store.visible(), store.horizon);
    const hold = m.holds.find((h) => h.reviewId === reviewId);
    const claim = hold?.request?.claims.find((c) => String(c.n) === n);
    if (!hold || !claim) return html``;
    const checks: CheckResult[] = hold.verdict?.checks.filter((c) => String(c.target) === n && (c.record === id || (!c.record && claim.ids.includes(id)))) ?? [];
    const failed = checks.filter((c) => !c.pass);
    const claimRef = html`Claim ${n} in <a class="ref" href="#/holds/${reviewId}">${reviewId}</a>`;
    const lead = claim.researcherId === id ? html`${claimRef} is about this researcher.`
      : claim.researcherId ? html`${claimRef} credits ${claim.researcherId} with this record.`
      : html`${claimRef} cites this record.`;
    if (failed.length) {
      return html`<div class="drawer-why is-failed">${lead} ${failed.map((c) => html`<p><strong>${c.check} ${checkNames[c.check]}.</strong> ${linkIds(c.detail ?? '')}</p>`)}</div>`;
    }
    const decisive = checks.find((c) => c.mark && c.mark === mark) ?? checks.find((c) => c.check !== 'C1') ?? checks[0];
    return html`<div class="drawer-why">${lead} ${decisive ? html`<p><strong>${decisive.check} ${checkNames[decisive.check]}.</strong> ${linkIds(decisive.detail ?? '')}</p>` : ''}</div>`;
  }

  function value(v: unknown, mark: string | null, key = ""): Markup {
    const marked = (s: string) => (mark && s === mark ? html`<mark>${linkIds(s)}</mark>` : linkIds(s));
    if (Array.isArray(v)) {
      if (v.length && typeof v[0] === 'object') {
        return html`<ol class="people">${(v as Person[]).map((p) => {
          const hit = mark && p.researcher_id === mark;
          return html`<li class="${hit ? 'hit' : ''}"><span>${p.name}${p.role ? html` <span class="muted">· ${p.role}</span>` : ''}</span>${p.researcher_id ? linkIds(p.researcher_id) : html`<span class="muted">no researcher ID</span>`}</li>`;
        })}</ol>`;
      }
      return v.length ? html`${(v as string[]).map((s, i) => html`${i ? ', ' : ''}${marked(String(s))}`)}` : html`<span class="muted">—</span>`;
    }
    if (v === '' || v == null) return html`<span class="muted">—</span>`;
    if (typeof v === 'number') return html`<span class="num">${key === 'year' ? String(v) : v.toLocaleString('en')}</span>`;
    return marked(String(v));
  }

  /** Where else this run cites the record: every claim that names or cites it, by review. */
  function inRun(id: string): Markup {
    const m = derive(store.visible(), store.horizon);
    const uses = m.holds.flatMap((h) => (h.request?.claims ?? [])
      .filter((c) => c.ids.includes(id) || c.researcherId === id)
      .map((c) => ({ h, c, failed: h.verdict?.claims.some((f) => f.n === c.n) })));
    if (!uses.length) return html`<p class="muted">No claim in this run cites ${id}.</p>`;
    return html`<ul class="uses">${uses.map(({ h, c, failed }) => html`<li>
      <a class="ref" href="#/holds/${h.reviewId}">${h.reviewId}</a><span>claim ${c.n}, ${h.pairId} round ${h.round}</span>
      <span class="pill ${failed ? 'neg' : h.verdict ? 'pos' : ''}">${failed ? 'Failed' : h.verdict ? 'Passed' : 'Checking'}</span></li>`)}</ul>`;
  }

  function rawJson(rec: Record<string, unknown>, mark: string | null): Markup {
    const needle = mark ? JSON.stringify(mark) : null;
    const lines = JSON.stringify(rec, null, 2).split('\n');
    return html`<pre class="raw"><code>${lines.map((l) => html`<span class="${needle && l.includes(needle) ? 'hit' : ''}">${l}</span>`)}</code></pre>`;
  }

  async function render(id: string, q: URLSearchParams, refresh = false) {
    const mark = q.get('mark'), from = q.get('from');
    const mine = ++token;
    // Records opened from inside the drawer stack up; going back to one drops everything after it.
    const seen = trail.indexOf(id);
    if (seen >= 0) trail.length = seen + 1; else trail.push(id);
    openId = id;
    const head = (title: Markup | string, line: Markup | string) => html`
      <header class="drawer-head">
        ${trail.length > 1 ? html`<button class="icon-btn" type="button" data-back aria-label="Back to ${trail[trail.length - 2]}">${icons.back}</button>` : ''}
        <div class="drawer-title"><p class="drawer-line">${line}</p><h2 id="drawer-title">${title}</h2></div>
        <button class="icon-btn" type="button" data-close aria-label="Close record">${icons.close}</button>
      </header>`;
    const scrolled = refresh ? body.querySelector('.drawer-body')?.scrollTop ?? 0 : 0;
    if (!refresh) body.innerHTML = html`${head(html`<span class="skeleton" style="width:240px">Loading</span>`, html`<span class="id">${id}</span>`)}
      <div class="drawer-body"><p class="skeleton" style="height:120px"></p></div>`.value;
    try {
      const rec = await getJSON<DatasetRecord>(`/api/records/${encodeURIComponent(id)}`);
      if (mine !== token) return;
      queueMicrotask(() => { const b = body.querySelector('.drawer-body'); if (b) b.scrollTop = scrolled; });
      const entries = Object.entries(rec.record).filter(([k]) => !/^(researcher|publication|project|patent|challenge)_id$/.test(k) && k !== 'name' && k !== 'title');
      body.innerHTML = html`${head(rec.title, html`${typeNames[rec.type]} · <span class="id">${rec.id}</span>`)}
        <div class="drawer-body">
          ${why(id, from, mark)}
          <section aria-labelledby="fields-h"><h3 id="fields-h">Fields</h3>
            <dl class="kv">${entries.map(([k, v]) => html`<div class="${mark && (v === mark || (Array.isArray(v) && v.some((x) => x === mark || (x as Person)?.researcher_id === mark))) ? 'hit' : ''}"><dt>${label(k)}</dt><dd>${value(v, mark, k)}</dd></div>`)}</dl>
          </section>
          <section aria-labelledby="uses-h"><h3 id="uses-h">In this run</h3>${inRun(id)}</section>
          <section aria-labelledby="raw-h"><h3 id="raw-h">Raw record</h3>${rawJson(rec.record, mark)}</section>
        </div>`.value;
    } catch (err) {
      if (mine !== token) return;
      const status = (err as { status?: number }).status;
      body.innerHTML = html`${head(status === 404 ? 'Not in the dataset' : 'Couldn’t load the record', html`<span class="id">${id}</span>`)}
        <div class="drawer-body">${status === 404
          ? html`<p>No record ${id} in the dataset index.</p>`
          : html`<p class="error">Couldn’t reach /api/records/${id}. <button type="button" data-retry>Retry</button></p>`}</div>`.value;
    }
    if (!refresh) dialog.querySelector<HTMLElement>('[data-close]')?.focus();
  }

  // "Why it is open" and "In this run" read the trace: when more of it arrives, redraw them in place.
  subscribe((reason) => {
    if (!dialog.open || !openId || reason === 'tick' || (reason === 'events' && store.playing)) return;
    render(openId, new URLSearchParams(location.hash.split('?')[1] ?? ''), true);
  });

  return {
    sync(q) {
      const id = q.get('record');
      const valid = id && new RegExp(`^${ID_RE.source}$`).test(id);
      if (!valid) {
        if (dialog.open) dialog.close();
        openId = null; trail.length = 0;
        return;
      }
      if (!dialog.open) dialog.showModal();
      if (id !== openId) render(id, q);
    },
  };
}
