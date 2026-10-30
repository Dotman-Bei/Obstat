// The landing page's behaviour. Everything here is an addition: without script the checks are a plain list with every
// sentence shown, the proposals are links, every section is visible and the big words keep their drawn size.

/** The live thing: the ten checks as the product's command menu. Type to filter, arrows or a tap to select. */
function commandMenu(root: HTMLElement) {
  const input = root.querySelector<HTMLInputElement>('input')!;
  const rows = [...root.querySelectorAll<HTMLLIElement>('.command-list li')];
  const empty = root.querySelector<HTMLElement>('.command-empty')!;
  const visible = () => rows.filter((r) => !r.hidden);

  const select = (row: HTMLLIElement | undefined, focus = false) => {
    if (!row) return;
    for (const r of rows) {
      const on = r === row;
      r.classList.toggle('selected', on);
      r.querySelector('button')!.setAttribute('aria-expanded', String(on));
    }
    if (focus) row.querySelector('button')!.focus();
  };

  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase().replace(/\s+/g, '');
    for (const r of rows) {
      const name = r.querySelector('.cmd-name')!.textContent!.toLowerCase();
      const id = [...r.querySelectorAll('kbd')].map((k) => k.textContent).join('').toLowerCase();
      // "c3", "3", "namesake" and "name" all find their row; "c1" does not also match C10.
      r.hidden = !!q && !(id === q || (q.startsWith('c') ? false : id === `c${q}`) || name.replace(/\s+/g, '').includes(q));
    }
    const shown = visible();
    empty.hidden = shown.length > 0;
    if (shown.length && !shown.some((r) => r.classList.contains('selected'))) select(shown[0]);
  });

  root.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const shown = visible();
    if (!shown.length) return;
    e.preventDefault();
    const at = shown.findIndex((r) => r.classList.contains('selected'));
    const next = e.key === 'ArrowDown' ? Math.min(at + 1, shown.length - 1) : Math.max(at - 1, 0);
    select(shown[next], document.activeElement !== input);
  });

  for (const r of rows) r.querySelector('button')!.addEventListener('click', () => select(r));
}

/** The proposals index: pointing at a name, or focusing it, shows that proposal's world in the frame. */
function proposalIndex(list: HTMLElement) {
  const frame = list.parentElement!.querySelector<HTMLElement>('.frame');
  const pick = (a: HTMLAnchorElement) => {
    for (const li of list.querySelectorAll('li')) li.classList.toggle('active', li.contains(a));
    for (const img of frame?.querySelectorAll<HTMLImageElement>('img') ?? []) img.classList.toggle('on', img.dataset.for === a.dataset.pick);
  };
  for (const a of list.querySelectorAll<HTMLAnchorElement>('a[data-pick]')) {
    a.addEventListener('pointerenter', () => pick(a));
    a.addEventListener('focus', () => pick(a));
  }
}

/** Each section's parts rise in once, as the section enters. */
function reveals() {
  const sections = [...document.querySelectorAll<HTMLElement>('[data-reveal]')];
  if (!('IntersectionObserver' in window)) {
    for (const s of sections) s.classList.add('in');
    return;
  }
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      e.target.classList.add('in');
      io.unobserve(e.target);
    }
  }, { rootMargin: '0px 0px -12% 0px', threshold: 0.05 });
  for (const s of sections) io.observe(s);
}

/** The big words (OPEN, OBSTAT) are SVG text; fit each viewBox to the set word so it runs margin to margin. */
function fitWords() {
  for (const svg of document.querySelectorAll<SVGSVGElement>('svg[data-fit]')) {
    const text = svg.querySelector('text');
    if (!text) continue;
    const box = text.getBBox();
    if (box.width > 0) svg.setAttribute('viewBox', `${box.x} ${box.y + box.height * 0.18} ${box.width} ${box.height * 0.74}`);
  }
}

const menu = document.querySelector<HTMLElement>('[data-command]');
if (menu) commandMenu(menu);
const index = document.querySelector<HTMLElement>('[data-index]');
if (index) proposalIndex(index);
reveals();
document.fonts.ready.then(fitWords);

// The press film is a silent loop: under reduced motion it stays on its poster frame.
if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
  for (const v of document.querySelectorAll<HTMLVideoElement>('video[data-loop]')) {
    v.removeAttribute('autoplay');
    v.pause();
  }
}
