import MiniSearch from 'minisearch';
import type { RuleKind } from '@/engine/types';

export interface SearchDoc {
  id: string;
  kind: RuleKind;
  name: string;
  text: string;
  source: string; // "Core Rules", "Lieutenant · Space Marines", ...
}

export type MatchKind = 'exact' | 'starts' | 'word' | 'fuzzy' | 'text';

export interface SearchHit extends SearchDoc {
  match: MatchKind;
  score: number;
}

const MATCH_RANK: Record<MatchKind, number> = { exact: 0, starts: 1, word: 2, fuzzy: 3, text: 4 };

/**
 * "Closest match first": an exact name beats a name that starts with the query,
 * which beats a whole word in the name, a fuzzy name match, and finally a hit in body text.
 * MiniSearch's relevance score only breaks ties inside each tier.
 */
export function createSearch(docs: SearchDoc[]) {
  const ms = new MiniSearch<SearchDoc>({
    fields: ['name', 'text'],
    storeFields: ['kind', 'name', 'text', 'source'],
    searchOptions: { boost: { name: 4 }, prefix: true, fuzzy: 0.2 },
  });
  ms.addAll(docs);

  return (query: string, kinds?: RuleKind[]): SearchHit[] => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const raw = ms.search(q, kinds?.length ? { filter: (r) => kinds.includes(r.kind as RuleKind) } : undefined);
    return raw
      .map((r) => {
        const name = String(r.name).toLowerCase();
        let match: MatchKind = 'text';
        if (name === q) match = 'exact';
        else if (name.startsWith(q)) match = 'starts';
        else if (name.split(/\s+/).some((w) => w.startsWith(q))) match = 'word';
        else if (r.match && Object.values(r.match).some((fields) => fields.includes('name'))) match = 'fuzzy';
        return {
          id: String(r.id),
          kind: r.kind as RuleKind,
          name: String(r.name),
          text: String(r.text),
          source: String(r.source),
          match,
          score: r.score,
        };
      })
      .sort((a, b) => MATCH_RANK[a.match] - MATCH_RANK[b.match] || b.score - a.score);
  };
}
