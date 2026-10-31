import { raw } from './html.ts';

// One outline set at 1.5px, drawn for this console. The mark (brand/mark-colour.svg) is the O held by a block on its line: obstat, it stands in the way.
const icon = (body: string, vb = 16) =>
  raw(`<svg viewBox="0 0 ${vb} ${vb}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`);

export const icons = {
  mark: raw('<svg viewBox="0 0 64 64" aria-hidden="true"><path fill-rule="evenodd" fill="var(--accent)" d="M4 30a22 22 0 1 0 44 0a22 22 0 1 0 -44 0ZM15 30a11 11 0 1 1 22 0a11 11 0 1 1 -22 0ZM4 55h56v7h-56Z"/><path fill="var(--text)" d="M50 30h10v25h-10Z"/></svg>'),
  run: icon('<path d="M2 4h7M2 8h11M5 12h7"/>'),
  holds: icon('<circle cx="8" cy="8" r="5.75"/><path d="M4 8h8"/>'),
  proposals: icon('<path d="M4 1.75h5.5L12.25 4.5v9.75H4z"/><path d="M6.5 7.5h3.5M6.5 10.5h3.5"/>'),
  summary: icon('<path d="M2.5 13.5V8M6.5 13.5V3M10.5 13.5V6M14 13.5H1.75"/>'),
  search: icon('<circle cx="7" cy="7" r="4.75"/><path d="m10.5 10.5 3.25 3.25"/>'),
  menu: icon('<path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11"/>'),
  close: icon('<path d="m4 4 8 8M12 4l-8 8"/>'),
  back: icon('<path d="M9.5 3.5 5 8l4.5 4.5"/>'),
  replay: icon('<path d="M2.75 8a5.25 5.25 0 1 0 1.6-3.8"/><path d="M2.5 2.5v3h3"/>'),
};
