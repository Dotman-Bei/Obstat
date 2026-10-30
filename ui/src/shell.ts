// The frame every screen sits in: a stone L (sidebar and top bar, no rule between them) around one white sheet.
import { derive } from './data/model.ts';
import { replay, setSpeed, store, subscribe, type Speed } from './data/store.ts';
import { clock, day, hhmm } from './lib/format.ts';
import { el, html } from './lib/html.ts';
import { icons } from './lib/icons.ts';
import { current, screenKey, withRecord } from './router.ts';
import type { NavId, Screen } from './screens/screen.ts';

export type Routes = (path: string[], query: URLSearchParams) => Screen;

const ID_PATTERN = /^(R\d{4}|SYN-(PUB|PRJ|PAT)-\d{4,5}|C\d{3}(-CH\d+)?)$/;

export interface Drawer { sync(query: URLSearchParams): void }

export function mountShell(host: HTMLElement, routes: Routes, drawer: () => Drawer) {
  const app = el(html`<div class="app">
    <nav class="sidebar" aria-label="Console" data-sidebar>
      <button class="icon-btn close" type="button" aria-label="Close menu" data-close>${icons.close}</button>
      <a class="brand" href="./" title="Obstat home">${icons.mark}<span>Obstat</span></a>
      <div class="scope"><strong data-scope-day>Run</strong><span data-scope-time>Loading the trace</span></div>
      <div class="nav">
        <a class="nav-item" href="#/run" data-nav="run">${icons.run}Run</a>
        <a class="nav-item" href="#/holds" data-nav="holds">${icons.holds}Holds</a>
        <a class="nav-item" href="#/proposals" data-nav="proposals">${icons.proposals}Proposals</a>
        <a class="nav-item" href="#/summary" data-nav="summary">${icons.summary}Summary</a>
      </div>
      <div class="phone-replay" data-phone-replay></div>
      <p class="foot" data-foot></p>
    </nav>
    <header class="topbar">
      <button class="icon-btn menu-toggle" type="button" aria-label="Open menu" aria-expanded="false" data-menu>${icons.menu}</button>
      <span class="phone-title" data-phone-title></span>
      <form class="lookup" role="search" data-lookup>
        ${icons.search}
        <label class="visually-hidden" for="lookup-input">Look up a record</label>
        <input id="lookup-input" name="id" autocomplete="off" spellcheck="false" placeholder="Look up R0539, SYN-PUB-01827, C017-CH1" aria-describedby="lookup-hint">
        <kbd aria-hidden="true">/</kbd>
        <p class="hint" id="lookup-hint" role="alert" hidden></p>
      </form>
      <div class="replay" data-replay></div>
      <button class="icon-btn lookup-toggle" type="button" aria-label="Look up a record" data-lookup-toggle>${icons.search}</button>
    </header>
    <main class="sheet" id="main" data-sheet></main>
  </div>`);
  host.replaceChildren(app);
  const $ = (k: string) => app.querySelector<HTMLElement>(`[data-${k}]`)!;

  // ---------- replay controls ----------
  const speeds: [Speed, string][] = [[1, '1×'], [4, '4×'], ['instant', 'Instant']];
  function renderReplay() {
    const live = store.mode === 'live';
    const controls = live ? '' : html`
      <div class="segmented" role="group" aria-label="Replay speed">${speeds.map(([s, label]) => html`<button type="button" data-speed="${s}" aria-pressed="${store.speed === s}">${label}</button>`)}</div>
      <button class="btn primary" type="button" data-replay-btn>${icons.replay}Replay</button>`.value;
    const clockText = !store.events.length ? '' : live
      ? html`<span class="live">Live</span> <time>${clock(store.horizon)}</time>`.value
      : html`<time>${clock(store.horizon)}</time><span class="of"> of ${clock(store.end)}</span>`.value;
    $('replay').innerHTML = `<span class="clock">${clockText}</span>${controls}`;
    $('phone-replay').innerHTML = controls;
  }
  function renderClock() {
    const t = app.querySelector('.replay .clock time');
    if (t) t.textContent = clock(store.horizon);
  }
  app.addEventListener('click', (e) => {
    const t = e.target as Element;
    const sp = t.closest<HTMLElement>('[data-speed]');
    if (sp) { const v = sp.dataset.speed!; setSpeed(v === 'instant' ? 'instant' : (Number(v) as 1 | 4)); }
    if (t.closest('[data-replay-btn]')) replay();
  });

  // ---------- the phone menu ----------
  const sidebar = $('sidebar'), menuBtn = $('menu');
  const setMenu = (open: boolean) => {
    sidebar.classList.toggle('open', open);
    menuBtn.setAttribute('aria-expanded', String(open));
    if (open) sidebar.querySelector<HTMLElement>('[data-close]')?.focus();
  };
  menuBtn.addEventListener('click', () => setMenu(true));
  $('close').addEventListener('click', () => { setMenu(false); menuBtn.focus(); });
  sidebar.addEventListener('click', (e) => { if ((e.target as Element).closest('.nav-item, .brand')) setMenu(false); });

  // ---------- record lookup ----------
  const form = $('lookup') as HTMLFormElement, input = form.querySelector('input')!, hint = form.querySelector<HTMLElement>('.hint')!;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const id = input.value.trim().toUpperCase();
    if (!ID_PATTERN.test(id)) {
      hint.textContent = 'Type a dataset ID: a researcher (R0539), a record (SYN-PUB-01827), a company (C017) or a challenge (C017-CH1).';
      hint.hidden = false;
      return;
    }
    hint.hidden = true;
    input.value = '';
    input.blur();
    form.classList.remove('open');
    location.hash = withRecord(id);
  });
  input.addEventListener('input', () => { hint.hidden = true; });
  input.addEventListener('blur', () => setTimeout(() => { hint.hidden = true; form.classList.remove('open'); }, 150));
  $('lookup-toggle').addEventListener('click', () => { form.classList.add('open'); input.focus(); });
  document.addEventListener('keydown', (e) => {
    const typing = (e.target as Element).closest('input, textarea, select');
    if (e.key === '/' && !typing) { e.preventDefault(); form.classList.add('open'); input.focus(); }
    if (e.key === 'Escape' && sidebar.classList.contains('open')) { setMenu(false); menuBtn.focus(); }
    if (e.key === 'Escape' && e.target === input) { input.value = ''; hint.hidden = true; input.blur(); }
  });

  // ---------- routing ----------
  let screen: Screen | null = null;
  let path = '';
  function route() {
    const r = current();
    const p = screenKey(r);
    if (!screen || p !== path) {
      screen?.destroy?.();
      path = p;
      screen = routes(r.path, r.query);
      $('sheet').replaceChildren(screen.el);
      app.querySelectorAll<HTMLElement>('[data-nav]').forEach((n) => {
        if (n.dataset.nav === (screen!.nav as NavId)) n.setAttribute('aria-current', 'page'); else n.removeAttribute('aria-current');
      });
      document.title = `${screen.title} · Obstat`;
      $('phone-title').textContent = screen.title;
      window.scrollTo(0, 0);
      screen.update?.(derive(store.visible(), store.horizon), 'events');
    }
    drawer().sync(r.query);
  }
  window.addEventListener('hashchange', route);

  subscribe((reason) => {
    if (reason !== 'tick') {
      // Rebuild the controls only when their state changes, so a click mid-replay is never lost.
      if (reason === 'status' || !app.querySelector('.replay .clock time')) renderReplay(); else renderClock();
      if (store.events.length) {
        $('scope-day').textContent = `Run of ${day(store.start)}`;
        $('scope-time').textContent = `${hhmm(store.start)} CET · ${store.mode === 'live' ? 'live' : 'replay'}`;
      }
      $('foot').innerHTML = store.error
        ? html`<span style="color:var(--negative)">${store.error}</span>`.value
        : store.mode === 'live'
          ? html`Read-only. Live from <span class="id">127.0.0.1</span>. Nothing here changes the run.`.value
          : html`Read-only. Replaying <span class="id">${store.source}</span>. Nothing here changes the run.`.value;
    } else renderClock();
    screen?.update?.(derive(store.visible(), store.horizon), reason);
  });

  renderReplay();
  route();
}
