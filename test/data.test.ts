// Runs against the real EINSTEIN dataset in data/data. The traps checked here are the ones the PRD names.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { test } from 'node:test';
import { loadConfig } from '../src/config.ts';
import { buildIdentities } from '../src/data/identities.ts';
import { carriers, getRecord, loadIndex, recordType } from '../src/data/index.ts';
import { canonicalFaculty } from '../src/data/normalize.ts';

const { dataDir } = loadConfig();
const skip = existsSync(dataDir) ? false : `dataset not found at ${dataDir}`;
const ix = skip ? null! : loadIndex(dataDir);
const hints = skip ? null! : buildIdentities(ix);

test('index holds the whole dataset', { skip }, () => {
  assert.equal(ix.researchers.size, 1047);
  assert.equal(ix.publications.size, 10779);
  assert.equal(ix.projects.size, 1823);
  assert.equal(ix.patents.size, 111);
  assert.equal(ix.companies.size, 153);
  assert.equal(ix.challenges.size, 489);
  assert.equal([...ix.pages.values()].reduce((a, p) => a + p.length, 0), 917);
});

test('records resolve by ID, with their type', { skip }, () => {
  assert.equal(recordType('SYN-PUB-01827'), 'publication');
  assert.equal(recordType('C011-CH2'), 'challenge');
  assert.equal(recordType('C011'), 'company');
  assert.equal(recordType('hello'), undefined);
  assert.equal(getRecord(ix, 'C001-CH1')?.type, 'challenge');
  assert.equal((getRecord(ix, 'C001-CH1')?.record as { companyId: string }).companyId, 'C001');
  assert.equal(getRecord(ix, 'R9999'), undefined);
});

test('SYN-PUB-01827 credits R0539, not R0139', { skip }, () => {
  assert.deepEqual(carriers(ix, 'SYN-PUB-01827'), ['R0539']);
  assert.ok(ix.researchers.get('R0139')!.publications.includes('SYN-PUB-01827'));
  assert.ok(!ix.credited.get('R0139'));
});

test('every faculty name maps to an English one', { skip }, () => {
  const unmapped = [...ix.researchers.values()].map((r) => canonicalFaculty(r.faculty)).filter((f) => !/^(Faculty|Technical Faculty|BioSense|Institute|Academy|Hungarian)/.test(f));
  assert.deepEqual([...new Set(unmapped)], []);
});

test('the three duplicate profiles point to the record the works credit', { skip }, () => {
  for (const [shadow, canonical] of [['R0139', 'R0539'], ['R0556', 'R0976'], ['R0894', 'R0929']]) {
    assert.deepEqual(hints.get(shadow)!.sameAs, [canonical]);
    assert.equal(hints.get(shadow)!.canonicalId, canonical);
    assert.equal(hints.get(canonical)!.canonicalId, canonical);
  }
  assert.ok(hints.get('R0139')!.sameAsSignals.includes('reversed name order'));
  assert.ok(hints.get('R0556')!.sameAsSignals.includes('Latin and Cyrillic spellings'));
  assert.equal([...hints.values()].filter((h) => h.sameAs.length).length, 6);
});

test('namesakes stay two people', { skip }, () => {
  for (const [a, b] of [['R0128', 'R0881'], ['R0191', 'R0435']]) {
    assert.deepEqual(hints.get(a)!.namesakes, [b]);
    assert.deepEqual(hints.get(b)!.namesakes, [a]);
    assert.deepEqual(hints.get(a)!.sameAs, []);
  }
  assert.equal([...hints.values()].filter((h) => h.namesakes.length).length, 4);
});

test('stale status is read from title and notes', { skip }, () => {
  assert.equal(hints.get('R0068')!.status, 'left');
  assert.match(hints.get('R0068')!.statusText, /Left the University of Novi Sad in March 2026/);
  assert.equal(hints.get('R0881')!.status, 'emeritus');
  assert.match(hints.get('R0079')!.statusText, /consulting/);
  assert.equal([...hints.values()].filter((h) => h.status === 'emeritus').length, 20);
  // "retired dies" in R0140's industry text and "not currently on sabbatical" notes are not stale profiles
  assert.equal(hints.get('R0140')!.status, 'active');
  assert.equal(hints.get('R0128')!.status, 'active');
});
