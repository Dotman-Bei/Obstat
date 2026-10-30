// S5 Summary. Its question: what did the run produce, and what did it turn away?
import type { Model } from '../data/model.ts';
import { getJSON } from '../data/store.ts';
import type { Summary } from '../data/types.ts';
import { checkNames, formatNames, plural, who } from '../lib/format.ts';
import { el, html, type Markup } from '../lib/html.ts';
import { linkIds, ref } from '../lib/refs.ts';
import type { Screen } from './screen.ts';

/** A ranked list where each row carries a bar at its true share of the largest value. */
function bars(rows: { label: Markup | string; value: number; note?: string }[], tone: 'gate' | 'plain'): Markup {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return html`<ul class="bars ${tone}">${rows.map((r) => html`<li>
    <span class="bar-label">${r.label}</span><span class="bar-value num">${r.value}${r.note ? html`<span class="muted"> ${r.note}</span>` : ''}</span>
    <span class="bar-track" aria-hidden="true"><span style="width:${((r.value / max) * 100).toFixed(1)}%"></span></span>
  </li>`)}</ul>`;
}

export function summaryScreen(): Screen {
  const root = el(html`<div class="summary"></div>`);
  let s: Summary | null = null;
  let error = '';
  let model: Model | null = null;

  const load = () => {
    error = '';
    getJSON<Summary>('/api/summary').then((x) => { s = x; }).catch((e: Error) => { error = e.message; }).finally(render);
  };

  function render() {
    if (error || !s) {
      root.innerHTML = html`<header class="title-row"><div><h1>Summary</h1><p class="sub">${error ? 'The summary could not be loaded.' : 'Loading the summary.'}</p></div></header>
        ${error ? html`<p class="error">Couldn’t reach /api/summary. <button type="button" data-retry>Retry</button></p>` : ''}`.value;
      return;
    }
    const proposed = s.proposed.length;
    const researchers = new Set(s.proposed.map((p) => p.researcherId)).size;
    const challenges = new Set(s.proposed.map((p) => p.challengeId)).size;
    const failedTotal = s.failedChecks.reduce((a, c) => a + c.count, 0);
    const holds = s.holdsPerWriter.reduce((a, w) => a + w.holds, 0);
    const failedHolds = s.holdsPerWriter.reduce((a, w) => a + w.failed, 0);
    const turned = s.noMatch;

    root.innerHTML = html`
      <header class="title-row"><div><h1>Summary</h1>
        <p class="sub">${plural(proposed, 'proposal')} for ${plural(researchers, 'different researcher')} and ${plural(challenges, 'different challenge')}. ${plural(turned.total, 'challenge')} of ${s.challenges} turned away before matching.</p></div>
        <p class="stamp">Final figures for the whole run</p></header>
      <div class="summary-grid">
        <section class="panel span-8" aria-labelledby="proposed-h">
          <header><h2 id="proposed-h">Pairs proposed <span class="count num">${proposed}</span></h2><a class="card-link" href="#/proposals?show=written">Read them</a></header>
          <table class="rtable">
            <thead><tr><th>Pair</th><th>Researcher</th><th>Company and challenge</th><th>Format</th></tr></thead>
            <tbody>${s.proposed.map((p) => html`<tr class="link-row" data-href="#/proposals/${p.pairId}">
              <td class="c-main"><a class="row-title" href="#/proposals/${p.pairId}">${p.pairId}</a></td>
              <td class="c-meta">${p.researcherName} <span class="sub">${ref(p.researcherId)}</span></td>
              <td class="c-meta">${p.companyName} <span class="sub">${ref(p.challengeId)}</span></td>
              <td class="c-end">${formatNames[p.format]}</td></tr>`)}</tbody>
          </table>
        </section>
        <section class="panel span-4" aria-labelledby="abandoned-h">
          <header><h2 id="abandoned-h">Abandoned <span class="count num">${s.abandoned.length}</span></h2></header>
          ${s.abandoned.length ? html`<ul class="abandoned">${s.abandoned.map((a) => html`<li>
            <p><a class="row-title" href="#/proposals/${a.pairId}">${a.pairId}</a> · ${a.researcherName} ${ref(a.researcherId)} on ${ref(a.challengeId)}</p>
            <p class="abandon-reason">${linkIds(a.reason)}</p>
            <ul class="round-list">${(model?.holds ?? []).filter((h) => h.pairId === a.pairId).sort((x, y) => x.round - y.round).map((h) => html`<li>
              <a class="ref" href="#/holds/${h.reviewId}">${h.reviewId}</a><span>Round ${h.round}</span>
              ${h.verdict ? (h.verdict.pass ? html`<span class="pill pos">Passed</span>` : html`<span class="pill neg">Failed ${[...new Set(h.verdict.claims.map((c) => c.check))].join(', ')}</span>`) : html`<span class="pill">Checking</span>`}</li>`)}</ul>
            ${a.replacedBy ? html`<p class="replaced">The Matchmaker replaced it with <a class="row-title" href="#/proposals/${a.replacedBy}">${a.replacedBy}</a>.</p>` : ''}
          </li>`)}</ul>` : html`<p class="empty">No pair was abandoned.</p>`}
        </section>
        <section class="panel span-6" aria-labelledby="checks-h">
          <header><h2 id="checks-h">Failed checks by type <span class="count num">${failedTotal}</span></h2><a class="card-link" href="#/holds?show=failed">Failed holds</a></header>
          ${s.failedChecks.length ? bars(s.failedChecks.map((c) => ({ label: html`<span class="cg-id">${c.check}</span>${checkNames[c.check]}`, value: c.count })), 'gate') : html`<p class="empty">No check failed.</p>`}
          <p class="panel-foot">A claim can fail more than one check: attribution (C2) fails alongside the duplicate (C3) or namesake (C4) check that explains it.</p>
        </section>
        <section class="panel span-6" aria-labelledby="writers-h">
          <header><h2 id="writers-h">Holds per writer <span class="count num">${holds}</span></h2><span class="meta">${failedHolds} failed</span></header>
          <table class="writers">
            <thead><tr><th>Writer</th><th class="n">Holds</th><th class="n">Failed</th><th class="n">Passed</th><th><span class="visually-hidden">Share failed</span></th></tr></thead>
            <tbody>${s.holdsPerWriter.map((w) => html`<tr><td>${who(w.writerId)}</td><td class="n">${w.holds}</td><td class="n">${w.failed}</td><td class="n">${w.holds - w.failed}</td>
              <td class="split-cell"><span class="split" aria-hidden="true"><span class="f" style="flex:${w.failed}"></span><span class="p" style="flex:${w.holds - w.failed}"></span></span></td></tr>`)}
              <tr class="total"><td>All writers</td><td class="n">${holds}</td><td class="n">${failedHolds}</td><td class="n">${holds - failedHolds}</td><td></td></tr>
            </tbody>
          </table>
        </section>
        <section class="panel span-12" aria-labelledby="turned-h">
          <header><h2 id="turned-h">Turned away before matching <span class="count num">${turned.total}</span></h2><span class="meta">${turned.byClass.map((c) => `${c.count} ${c.cls}`).join(' · ')}</span></header>
          <div class="turned">
            <div>${bars(turned.byReason.map((r) => ({ label: r.reason, value: r.count })), 'plain')}</div>
            <div>
              <table class="rtable">
                <thead><tr><th>Challenge</th><th>Company</th><th>Why it was turned away</th></tr></thead>
                <tbody>${turned.items.map((i) => html`<tr>
                  <td class="c-main">${ref(i.challengeId)}<span class="sub">${i.title}</span></td>
                  <td class="c-meta">${i.companyName}</td>
                  <td class="c-meta c-wide">${i.reason}</td></tr>`)}</tbody>
              </table>
              <p class="panel-foot">${turned.items.length} of ${turned.total} shown. Every one, with its reason, is in out/no-match.md.</p>
            </div>
          </div>
        </section>
      </div>`.value;
  }

  root.addEventListener('click', (e) => {
    const t = e.target as Element;
    if (t.closest('[data-retry]')) load();
    const row = t.closest<HTMLElement>('tr[data-href]');
    if (row && !t.closest('a')) location.hash = row.dataset.href!;
  });
  load();
  render();

  return { title: 'Summary', nav: 'summary', el: root, update: (m: Model, reason) => { model = m; if (reason !== 'tick') render(); } };
}
