// npm run identities: loads the dataset and prints what the identity hints found.
import { loadConfig } from '../config.ts';
import { buildIdentities } from './identities.ts';
import { loadIndex } from './index.ts';

const config = loadConfig();
const started = performance.now();
const ix = loadIndex(config.dataDir);
const hints = buildIdentities(ix);
const ms = Math.round(performance.now() - started);

const name = (id: string) => ix.researchers.get(id)!.name;
const challenges = ix.challenges.size;
const pages = [...ix.pages.values()].reduce((a, p) => a + p.length, 0);
console.log(`Loaded ${config.dataDir} in ${ms} ms`);
console.log(`  ${ix.researchers.size} researchers, ${ix.publications.size} publications, ${ix.projects.size} projects, ${ix.patents.size} patents`);
console.log(`  ${ix.companies.size} companies with ${challenges} challenges, ${pages} company pages\n`);

const all = [...hints.values()];
const same = all.filter((h) => h.sameAs.length && h.canonicalId !== h.id);
console.log(`Same person, two records (${same.length}):`);
for (const h of same) console.log(`  ${h.id} ${name(h.id)} -> cite ${h.canonicalId} ${name(h.canonicalId)}\n    ${h.sameAsSignals.join('; ')}`);

const namesakes = all.filter((h) => h.namesakes.length && h.id < h.namesakes[0]);
console.log(`\nNamesakes, different people (${namesakes.length}):`);
for (const h of namesakes) {
  const other = h.namesakes[0];
  const r = ix.researchers.get(h.id)!;
  const o = ix.researchers.get(other)!;
  console.log(`  ${h.id} ${r.name} (${r.faculty}) / ${other} ${o.name} (${o.faculty})`);
}

for (const status of ['left', 'retired', 'emeritus'] as const) {
  const list = all.filter((h) => h.status === status);
  console.log(`\nStatus ${status} (${list.length}):`);
  for (const h of list) console.log(`  ${h.id} ${name(h.id)}: ${h.statusText.slice(0, 110)}${h.statusText.length > 110 ? '…' : ''}`);
}
console.log(`\nWith capacity text: ${all.filter((h) => h.capacityText).length} of ${all.length}`);
