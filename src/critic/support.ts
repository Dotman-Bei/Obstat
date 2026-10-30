// The C10 support judge: one structured-output call per review, given only each claim's cited records.
import { DeveloperMessageItem, ModelContext, UserMessageItem } from '@mozaik-ai/core';
import { FAILED, PRIORITY, type GuardedRunner } from '../llm.ts';
import type { SupportItem } from './checks/c10.ts';

const INSTRUCTION = `You check whether dataset records support sentences in a collaboration proposal. For each claim you get its text and the records it cites, and nothing else.
Pass a claim when the records state it or directly imply it; different wording is fine. Fail it when a record contradicts it, or when it states a specific fact (a number, a name, a method, a result, a date) that no cited record contains.
An availability claim passes when its quoted words appear in the researcher record. Give a reason of at most 25 words for every claim, naming the record.`;

const SCHEMA = {
  type: 'object',
  properties: {
    results: {
      type: 'array',
      items: { type: 'object', properties: { n: { type: 'integer' }, pass: { type: 'boolean' }, detail: { type: 'string' } }, required: ['n', 'pass', 'detail'] },
    },
  },
  required: ['results'],
};

/** The fields of a record that can support a sentence, trimmed. */
function evidence(item: SupportItem['records'][number]): Record<string, unknown> {
  const r = item.record as unknown as Record<string, any>;
  const pick = (keys: string[]) => Object.fromEntries(keys.filter((k) => r[k] !== undefined && r[k] !== '').map((k) => [k, typeof r[k] === 'string' ? r[k].slice(0, 1500) : r[k]]));
  switch (item.type) {
    case 'publication': return { id: item.id, ...pick(['title', 'year', 'venue', 'abstract', 'keywords', 'authors']) };
    case 'project': return { id: item.id, ...pick(['title', 'programme', 'years', 'summary', 'participants']) };
    case 'patent': return { id: item.id, ...pick(['title', 'year', 'status', 'abstract', 'inventors']) };
    case 'researcher': return { id: item.id, ...pick(['name', 'title', 'faculty', 'department', 'fields', 'keywords', 'open_to', 'notes', 'industry_experience']) };
    case 'company': return { id: item.id, ...pick(['name', 'sector', 'employees', 'founded', 'location', 'about', 'products', 'tech', 'rd_capacity']) };
    case 'challenge': return { id: item.id, ...pick(['companyId', 'text', 'detail']) };
  }
}

export function supportJudge(llm: GuardedRunner, model: string) {
  return async (items: SupportItem[]) => {
    const context = ModelContext.create().addContextItems([
      DeveloperMessageItem.create(INSTRUCTION),
      UserMessageItem.create(JSON.stringify(items.map(({ claim, records }) => ({ n: claim.n, kind: claim.kind, text: claim.text, records: records.map(evidence) })))),
    ]);
    const out = await llm.run({ model, context, structuredOutput: { name: 'support', schema: SCHEMA } }, PRIORITY.critic);
    const text = out.items.map((i) => (i as { content?: { text?: string } }).content?.text ?? '').join('');
    if (!text || text.startsWith(FAILED)) throw new Error(text ? text.slice(FAILED.length + 2, -1) : 'the model returned nothing');
    const parsed = JSON.parse(text.replace(/^```(json)?\s*|\s*```$/g, '')) as { results: { n: number; pass: boolean; detail: string }[] };
    return new Map(parsed.results.map((r) => [r.n, { pass: r.pass, detail: r.detail }]));
  };
}
