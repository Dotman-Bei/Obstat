import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type Connect, type Plugin } from 'vite';
import { loadIndex } from '../src/data/index.ts';
import { RunApi } from '../src/ui-bridge/api.ts';

// The dev and preview servers answer the PRD §11.1 read endpoints from the committed run (../out) and the real
// dataset (../data/data), with the same code as npm run ui, so the console is designed against real data.
function replayApi(): Plugin {
  let api: RunApi | null = null;
  const load = () => {
    if (api) return api;
    const out = resolve(__dirname, '../out');
    const data = resolve(__dirname, '../data/data');
    for (const [path, fix] of [[out, 'run npm start in the project root'], [data, 'clone the dataset into data/ (see the README)']]) {
      if (!existsSync(path)) throw new Error(`The console needs ${path}: ${fix}.`);
    }
    return (api = new RunApi(loadIndex(data), out));
  };
  const json = (res: Parameters<Connect.NextHandleFunction>[1], status: number, body: unknown) => {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(body));
  };
  const handler: Connect.NextHandleFunction = (req, res, next) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    const path = decodeURIComponent(url.pathname);
    if (path !== '/events' && !path.startsWith('/api/')) return next();
    let run: RunApi;
    try {
      run = load();
    } catch (e) {
      return json(res, 503, { error: (e as Error).message });
    }
    if (path === '/events') {
      // Replay sends the whole trace at once; the browser plays it back at the chosen speed.
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
      res.write(`event: mode\ndata: ${JSON.stringify({ mode: 'replay', source: run.source })}\n\n`);
      for (const line of run.lines) res.write(`data: ${JSON.stringify(line)}\n\n`);
      res.write('event: done\ndata: {}\n\n');
      res.end();
      return;
    }
    if (path === '/api/summary') return json(res, 200, run.summary());
    if (path === '/api/proposals') return json(res, 200, run.proposals());
    let m = path.match(/^\/api\/proposals\/([\w-]+)$/);
    if (m) {
      const p = run.proposal(m[1]);
      return p ? json(res, 200, p) : json(res, 404, { error: `No proposal ${m[1]}.` });
    }
    m = path.match(/^\/api\/records\/([\w-]+)$/);
    if (m) {
      const r = run.record(m[1]);
      return r ? json(res, 200, r) : json(res, 404, { error: `No record ${m[1]} in the dataset index.` });
    }
    return json(res, 404, { error: 'Unknown endpoint.' });
  };
  return {
    name: 'obstat-replay-api',
    configureServer(server) { server.middlewares.use(handler); },
    configurePreviewServer(server) { server.middlewares.use(handler); },
  };
}

export default defineConfig({
  plugins: [replayApi()],
  // Two pages: the landing page at / and the terminal (the read-only console) at /console.html.
  build: { rollupOptions: { input: { main: 'index.html', console: 'console.html' } } },
  server: { host: '127.0.0.1', port: 4310, strictPort: true },
  preview: { host: '127.0.0.1', port: 4311, strictPort: true },
});
