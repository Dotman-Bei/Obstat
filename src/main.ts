// npm start: one full Obstat pass. Writes out/proposals/*.md, out/trace.jsonl, out/summary.md, out/no-match.md.
//   --demo  seed the R0139 / C062-CH1 trap pair, so the judged run shows a hold on a known trap (PRD F5)
import { loadConfig } from './config.ts';
import { runObstat } from './runtime.ts';

// Mozaik's cloud SDK warns once per loop when no MOZAIK_API_KEY is set. It sends nothing; the warning only buries the trace.
const warn = console.warn.bind(console);
console.warn = (...args: unknown[]) => {
  if (typeof args[0] === 'string' && args[0].startsWith('mozaik cloud:')) return;
  warn(...args);
};
process.on('unhandledRejection', (e) => console.error('[obstat] unhandled rejection:', e));

const config = loadConfig();
const providers = new Set(Object.values(config.models).map((m) => (m.startsWith('gemini') ? 'GEMINI_API_KEY' : m.startsWith('claude') ? 'ANTHROPIC_API_KEY' : 'OPENAI_API_KEY')));
const missing = [...providers].filter((key) => !process.env[key]);
if (missing.length) {
  console.error(`Missing ${missing.join(', ')}. Put it in .env (see .env.example).`);
  process.exit(1);
}

const demo = process.argv.includes('--demo');
console.log(`Obstat: ${Object.values(config.models).filter((m, i, a) => a.indexOf(m) === i).join(', ')}${demo ? ', demo pair seeded' : ''}\n`);
try {
  const { reason, state, stats } = await runObstat({ demo });
  const written = state.shortlist.filter((p) => p.status === 'written');
  console.log(`\n${reason}. ${written.length} proposals written, ${state.shortlist.filter((p) => p.status === 'abandoned').length} abandoned.`);
  for (const p of written) console.log(`  out/proposals/${p.pairId}.md`);
  console.log(`  out/trace.jsonl, out/summary.md, out/no-match.md`);
  console.log(`${stats.calls} model calls, ${stats.tokens.toLocaleString('en')} tokens, ${stats.retries} retries; at most ${stats.maxConcurrentLoops} loops at once.`);
  process.exit(0);
} catch (e) {
  console.error(`[obstat] ${(e as Error).message}`);
  process.exit(1);
}
