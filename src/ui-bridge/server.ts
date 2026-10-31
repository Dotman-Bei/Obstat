// npm run ui: serves the console (ui/dist) and its read endpoints for a finished run, on 127.0.0.1 only (T11).
// Replay mode: /events sends the whole trace at once and the browser plays it back at 1x, 4x or instantly (PRD §11.1).
// No key and no model calls.
//   --out <dir>   the run to show (default: out)
//   --port <n>    default 4320
import { existsSync, readFileSync, statSync } from 'node:fs';
import { createServer, type ServerResponse } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { loadConfig } from '../config.ts';
import { loadIndex } from '../data/index.ts';
import { RunApi } from './api.ts';

const arg = (name: string) => process.argv[process.argv.indexOf(name) + 1];
const config = loadConfig();
const outDir = resolve(process.argv.includes('--out') ? arg('--out') : config.outDir);
const port = Number(process.argv.includes('--port') ? arg('--port') : 4320);
const dist = resolve('ui', 'dist');

for (const [path, fix] of [[join(outDir, 'trace.jsonl'), 'Run npm start first, or point --out at a finished run.'], [dist, 'Build the console first: npm run ui:build']] as const) {
  if (!existsSync(path)) {
    console.error(`Missing ${path}. ${fix}`);
    process.exit(1);
  }
}

const api = new RunApi(loadIndex(config.dataDir), outDir);
const TYPES: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2', '.png': 'image/png', '.ico': 'image/x-icon' };

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

function file(res: ServerResponse, path: string) {
  res.writeHead(200, { 'Content-Type': TYPES[extname(path)] ?? 'application/octet-stream' });
  res.end(readFileSync(path));
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1');
  const path = decodeURIComponent(url.pathname);
  if (path === '/events') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.write(`event: mode\ndata: ${JSON.stringify({ mode: 'replay', source: api.source })}\n\n`);
    for (const line of api.lines) res.write(`data: ${JSON.stringify(line)}\n\n`);
    res.write('event: done\ndata: {}\n\n');
    res.end();
    return;
  }
  if (path === '/api/summary') return json(res, 200, api.summary());
  if (path === '/api/proposals') return json(res, 200, api.proposals());
  let m = path.match(/^\/api\/proposals\/([\w-]+)$/);
  if (m) {
    const p = api.proposal(m[1]);
    return p ? json(res, 200, p) : json(res, 404, { error: `No proposal ${m[1]}.` });
  }
  m = path.match(/^\/api\/records\/([\w-]+)$/);
  if (m) {
    const r = api.record(m[1]);
    return r ? json(res, 200, r) : json(res, 404, { error: `No record ${m[1]} in the dataset index.` });
  }
  if (path.startsWith('/api/')) return json(res, 404, { error: 'Unknown endpoint.' });
  // The console's own files; anything else is the single page (it routes by hash).
  const target = normalize(join(dist, path));
  if (target.startsWith(dist + sep) && existsSync(target) && statSync(target).isFile()) return file(res, target);
  return file(res, join(dist, 'index.html'));
});

server.on('error', (e: NodeJS.ErrnoException) => {
  if (e.code !== 'EADDRINUSE') throw e;
  console.error(`Port ${port} is already in use, most likely by Obstat itself: open http://127.0.0.1:${port}.`);
  console.error(`To start a second copy, pick another port: npm run ui -- --port ${port + 1}`);
  process.exit(1);
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Obstat console: http://127.0.0.1:${port}  (replaying ${api.lines.length} trace lines from ${outDir})`);
});
