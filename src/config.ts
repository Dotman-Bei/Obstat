// Run settings (PRD T9). Defaults live here; obstat.config.json in the project root overrides any of them.
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export interface Config {
  /** Folder holding researchers.json, publications.jsonl and the rest of the EINSTEIN dataset. */
  dataDir: string;
  outDir: string;
  models: { small: string; mid: string; strong: string };
  profilers: number;
  writers: number;
  criticTimeoutMs: number;
  revisionCap: number;
  /** A loop with no event for this long is marked stalled (issue #114). */
  stallMs: number;
  /** Stop the run past this many tokens; 0 means no limit (T10). */
  tokenBudget: number;
  /** Model calls allowed per minute, across the whole run (the provider's rate limit). */
  callsPerMinute: number;
  maxConcurrentCalls: number;
  maxRetries: number;
  /** Proposals to aim for: the Matchmaker shortlists this many pairs, plus a replacement for each abandoned one. */
  pairs: number;
  /** Challenges the Analyst classifies per model call. */
  analystBatch: number;
  /** Candidates retrieved per challenge for the Analyst and the Matchmaker. */
  candidates: number;
  /** Give up on the whole run after this long. */
  runTimeoutMs: number;
}

export const defaults: Config = {
  dataDir: 'data/data',
  outDir: 'out',
  // Gemini, read from GEMINI_API_KEY. Any name in Mozaik's supportedModels works; the provider follows the name.
  models: { small: 'gemini-3.5-flash-lite', mid: 'gemini-3.5-flash-lite', strong: 'gemini-3.5-flash-lite' },
  profilers: 4,
  writers: 3,
  criticTimeoutMs: 90_000,
  revisionCap: 3,
  stallMs: 120_000,
  tokenBudget: 2_000_000,
  // Sized for Gemini's free tier (about 5 calls a minute, a small daily cap per model); raise both on a paid key.
  callsPerMinute: 5,
  maxConcurrentCalls: 3,
  maxRetries: 4,
  pairs: 3,
  analystBatch: 163,
  candidates: 5,
  runTimeoutMs: 30 * 60_000,
};

export function loadConfig(root = process.cwd()): Config {
  const file = resolve(root, 'obstat.config.json');
  if (!existsSync(file)) return { ...defaults, dataDir: resolve(root, defaults.dataDir), outDir: resolve(root, defaults.outDir) };
  const own = JSON.parse(readFileSync(file, 'utf8')) as Partial<Config>;
  const merged = { ...defaults, ...own, models: { ...defaults.models, ...own.models } };
  return { ...merged, dataDir: resolve(root, merged.dataDir), outDir: resolve(root, merged.outDir) };
}
