// The dataset, loaded once into memory (PRD T2). Agents get IDs and slices from here, never whole files.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface Researcher {
  id: string;
  name: string;
  title: string;
  institution: string;
  faculty: string;
  department: string;
  fields: string[];
  keywords: string[];
  bio: string;
  publications: string[];
  projects: string[];
  patents: string[];
  open_to: string[];
  industry_experience: string;
  notes: string;
  language: string;
}

export interface Author { name: string; researcher_id: string | null; affiliation?: string }

export interface Publication {
  id: string;
  title: string;
  abstract: string;
  year: number;
  venue: string;
  type: string;
  keywords: string[];
  authors: Author[];
}

export interface Project {
  id: string;
  acronym: string;
  title: string;
  programme: string;
  years: string;
  summary: string;
  partners: string[];
  participants: { researcher_id: string; role: string }[];
}

export interface Patent {
  id: string;
  title: string;
  year: number;
  status: string;
  abstract: string;
  inventors: { researcher_id: string; name: string }[];
}

export interface ChallengeEntry { id: string; text: string; detail: string }

export interface Company {
  id: string;
  name: string;
  sector: string;
  employees: number;
  founded: number;
  location: string;
  about: string;
  products: string[];
  tech: string[];
  challenges: ChallengeEntry[];
  plans: string;
  rd_capacity: string;
  past_collaborations: string;
  language: string;
}

export interface Challenge extends ChallengeEntry { companyId: string }

export interface CompanyPage { company_id: string; kind: string; title: string; date: string; text: string }

export type RecordType = 'researcher' | 'publication' | 'project' | 'patent' | 'company' | 'challenge';

export type AnyRecord = Researcher | Publication | Project | Patent | Company | Challenge;

export interface DataIndex {
  researchers: Map<string, Researcher>;
  publications: Map<string, Publication>;
  projects: Map<string, Project>;
  patents: Map<string, Patent>;
  companies: Map<string, Company>;
  challenges: Map<string, Challenge>;
  pages: Map<string, CompanyPage[]>;
  /** Researcher ID -> the publications, projects and patents whose author, participant or inventor entries carry it. */
  credited: Map<string, string[]>;
}

const ID_TYPES: [RegExp, RecordType][] = [
  [/^R\d{4}$/, 'researcher'],
  [/^SYN-PUB-\d+$/, 'publication'],
  [/^SYN-PRJ-\d+$/, 'project'],
  [/^SYN-PAT-\d+$/, 'patent'],
  [/^C\d{3}-CH\d+$/, 'challenge'],
  [/^C\d{3}$/, 'company'],
];

/** The record type an ID's shape names, whether or not the record exists. */
export function recordType(id: string): RecordType | undefined {
  return ID_TYPES.find(([re]) => re.test(id))?.[1];
}

export function loadIndex(dir: string): DataIndex {
  const json = <T>(file: string, key: string): T[] => JSON.parse(readFileSync(join(dir, file), 'utf8'))[key];
  const lines = <T>(file: string): T[] => readFileSync(join(dir, file), 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l) as T);
  const byId = <T extends { id: string }>(rows: T[]) => new Map(rows.map((r) => [r.id, r]));

  const companies = byId(json<Company>('companies.json', 'companies'));
  const ix: DataIndex = {
    researchers: byId(json<Researcher>('researchers.json', 'researchers')),
    publications: byId(lines<Publication>('publications.jsonl')),
    projects: byId(json<Project>('projects.json', 'projects')),
    patents: byId(json<Patent>('patents.json', 'patents')),
    companies,
    challenges: new Map([...companies.values()].flatMap((c) => c.challenges.map((ch): [string, Challenge] => [ch.id, { ...ch, companyId: c.id }]))),
    pages: new Map(),
    credited: new Map(),
  };
  for (const page of lines<CompanyPage>('company-pages.jsonl')) {
    const list = ix.pages.get(page.company_id) ?? [];
    list.push(page);
    ix.pages.set(page.company_id, list);
  }
  for (const id of [...ix.publications.keys(), ...ix.projects.keys(), ...ix.patents.keys()]) {
    for (const rid of carriers(ix, id)) {
      const list = ix.credited.get(rid) ?? [];
      list.push(id);
      ix.credited.set(rid, list);
    }
  }
  return ix;
}

export function getRecord(ix: DataIndex, id: string): { id: string; type: RecordType; record: AnyRecord } | undefined {
  const type = recordType(id);
  if (!type) return undefined;
  const record = { researcher: ix.researchers, publication: ix.publications, project: ix.projects, patent: ix.patents, company: ix.companies, challenge: ix.challenges }[type].get(id);
  return record && { id, type, record };
}

/** The researcher IDs a publication, project or patent credits: its author, participant or inventor entries. This is what C2 reads. */
export function carriers(ix: DataIndex, id: string): string[] {
  const ids = ix.publications.get(id)?.authors.map((a) => a.researcher_id)
    ?? ix.projects.get(id)?.participants.map((p) => p.researcher_id)
    ?? ix.patents.get(id)?.inventors.map((i) => i.researcher_id)
    ?? [];
  return [...new Set(ids.filter((x): x is string => !!x))];
}

/** A one-line title for any record, for traces and the console. */
export function titleOf(record: AnyRecord): string {
  return 'name' in record ? record.name : 'title' in record ? record.title : record.text;
}
