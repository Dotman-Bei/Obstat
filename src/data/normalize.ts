// Name normalization (PRD T3): lowercase, Serbian Cyrillic to Latin, strip diacritics, sort tokens.

const CYRILLIC: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', ђ: 'đ', е: 'e', ж: 'ž', з: 'z', и: 'i', ј: 'j', к: 'k',
  л: 'l', љ: 'lj', м: 'm', н: 'n', њ: 'nj', о: 'o', п: 'p', р: 'r', с: 's', т: 't', ћ: 'ć', у: 'u',
  ф: 'f', х: 'h', ц: 'c', ч: 'č', џ: 'dž', ш: 'š',
};

const CYRILLIC_RE = /[Ѐ-ӿ]/;

export function hasCyrillic(s: string): boolean {
  return CYRILLIC_RE.test(s);
}

/** Serbian Cyrillic to Serbian Latin, keeping diacritics: "Јелена Марковић" -> "jelena marković". Lowercases. */
export function transliterate(s: string): string {
  let out = '';
  for (const ch of s.toLowerCase()) out += CYRILLIC[ch] ?? ch;
  return out;
}

/** Plain ASCII words: "Đurđica Marić" -> "djurdjica maric". Anything that is not a letter becomes a space. */
export function fold(s: string): string {
  return transliterate(s)
    .replace(/đ/g, 'dj')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z]+/g, ' ')
    .trim();
}

/** Order-free key, so "Jeremić Mirjana" and "Mirjana Jeremić" meet: "jeremic mirjana". */
export function nameKey(name: string): string {
  return fold(name).split(' ').filter(Boolean).sort().join(' ');
}

// Every faculty name the dataset writes in Serbian, by its folded form, mapped to the English name it also uses.
const FACULTIES: Record<string, string> = {
  'fakultet tehnickih nauka': 'Faculty of Technical Sciences',
  'tehnoloski fakultet': 'Faculty of Technology',
  'prirodno matematicki fakultet': 'Faculty of Sciences',
  'filozofski fakultet': 'Faculty of Philosophy',
  'medicinski fakultet': 'Faculty of Medicine',
  'poljoprivredni fakultet': 'Faculty of Agriculture',
  'pravni fakultet': 'Faculty of Law',
  'ekonomski fakultet u subotici': 'Faculty of Economics in Subotica',
  'gradjevinski fakultet subotica': 'Faculty of Civil Engineering Subotica',
  'tehnicki fakultet mihajlo pupin zrenjanin': 'Technical Faculty "Mihajlo Pupin" Zrenjanin',
  'institut biosens': 'BioSense Institute',
  'naucni institut za prehrambene tehnologije fins': 'Institute of Food Technology (FINS)',
};

/** The English name for a faculty however it is written; unknown names come back unchanged. */
export function canonicalFaculty(name: string): string {
  return FACULTIES[fold(name)] ?? name;
}
