// npm run ui:export: writes the terminal's read endpoints for a finished run as static files, so the frontend can be
// hosted with no server (Vercel serves ui/ and rewrites the endpoint paths to these files; see ui/vercel.json).
// Records: every record the run cites, and the records those link to, so the drawer can follow a link one step.
//   --out <dir>   the run to export (default: out)
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { loadConfig } from '../config.ts';
import { loadIndex } from '../data/index.ts';
import { RunApi } from './api.ts';

const ID = /\b(?:R\d{4}|SYN-(?:PUB|PRJ|PAT)-\d+|C\d{3}-CH\d+|C\d{3})\b/g;

const config = loadConfig();
const outDir = resolve(process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : config.outDir);
const target = resolve('ui', 'public', 'api');
const api = new RunApi(loadIndex(config.dataDir), outDir);

rmSync(target, { recursive: true, force: true });
mkdirSync(join(target, 'proposals'), { recursive: true });
mkdirSync(join(target, 'records'), { recursive: true });
const write = (path: string, body: unknown) => writeFileSync(join(target, path), typeof body === 'string' ? body : JSON.stringify(body));

// The event stream, as the server sends it in replay: the mode, every trace line, then done.
write('events.txt', [
  `event: mode\ndata: ${JSON.stringify({ mode: 'replay', source: api.source })}\n\n`,
  ...api.lines.map((line) => `data: ${JSON.stringify(line)}\n\n`),
  'event: done\ndata: {}\n\n',
].join(''));
write('summary.json', api.summary());
const proposals = api.proposals();
write('proposals.json', proposals);
for (const p of proposals) write(join('proposals', `${p.pairId}.json`), api.proposal(p.pairId));

// The records a screen can link to: IDs in the trace text the terminal shows, in every claim and verdict, in the
// proposals and the summary, and the lookup box's examples. Then one step further from the claims and proposals,
// so the drawer can follow a cited record's links. Bulk ID lists in event data (every classified challenge) are not
// links, so they are left out; a lookup of an ID outside this set gets the drawer's not-found message.
const scan = (text: string, into: Set<string>) => { for (const m of text.matchAll(ID)) into.add(m[0]); };
const claims = new Set<string>(['R0539', 'SYN-PUB-01827', 'C017-CH1']);
for (const line of api.lines) {
  if (/^claim\.review\.|^pair\.|^proposal\.|^gate\./.test(line.type)) scan(JSON.stringify(line.data ?? {}), claims);
}
for (const p of proposals) scan(JSON.stringify(api.proposal(p.pairId)), claims);
const ids = new Set(claims);
for (const line of api.lines) scan(line.summary, ids);
scan(JSON.stringify(api.summary()), ids);
for (const id of claims) {
  const r = api.record(id);
  if (r) scan(JSON.stringify(r.record), ids);
}
const cited = claims;
let written = 0;
for (const id of ids) {
  const r = api.record(id);
  if (!r) continue;
  write(join('records', `${id}.json`), r);
  written += 1;
}
console.log(`Exported ${api.lines.length} trace lines, ${proposals.length} proposals and ${written} records (${cited.size} cited by the run) to ${target}.`);
