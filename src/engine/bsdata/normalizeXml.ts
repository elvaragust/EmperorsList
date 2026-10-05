import { XMLParser } from 'fast-xml-parser';
import type { RawFile } from './raw';

/**
 * Older BSData repos (40k 10th, AoS, Kill Team) are XML (.cat/.gst).
 * The 11th-edition repo is JSON with the same tree. This converts XML into the
 * JSON shape: wrapper elements such as <selectionEntries><selectionEntry/>…
 * become plain arrays, and element text goes under "$text".
 */
const ARRAY_PARENTS: Record<string, string> = {
  selectionEntries: 'selectionEntry',
  selectionEntryGroups: 'selectionEntryGroup',
  sharedSelectionEntries: 'selectionEntry',
  sharedSelectionEntryGroups: 'selectionEntryGroup',
  entryLinks: 'entryLink',
  infoLinks: 'infoLink',
  categoryLinks: 'categoryLink',
  categoryEntries: 'categoryEntry',
  catalogueLinks: 'catalogueLink',
  profiles: 'profile',
  sharedProfiles: 'profile',
  characteristics: 'characteristic',
  rules: 'rule',
  sharedRules: 'rule',
  costs: 'cost',
  costTypes: 'costType',
  constraints: 'constraint',
  modifiers: 'modifier',
  conditions: 'condition',
  conditionGroups: 'conditionGroup',
};

const NUMERIC = new Set(['value', 'revision', 'battleScribeVersion', 'gameSystemRevision']);
const BOOLEAN = new Set(['hidden', 'collective', 'library', 'primary', 'import', 'includeChildSelections', 'shared']);

function unwrap(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(unwrap);
  if (node === null || typeof node !== 'object') return node;
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(node as Record<string, unknown>)) {
    const child = ARRAY_PARENTS[key];
    if (child) {
      const inner = val && typeof val === 'object' ? (val as Record<string, unknown>)[child] : undefined;
      out[key] = inner === undefined ? [] : (Array.isArray(inner) ? inner : [inner]).map(unwrap);
    } else if (NUMERIC.has(key) && typeof val === 'string' && val !== '' && !Number.isNaN(Number(val))) {
      out[key] = Number(val);
    } else if (BOOLEAN.has(key) && typeof val === 'string') {
      out[key] = val === 'true';
    } else {
      out[key] = unwrap(val);
    }
  }
  return out;
}

export function normalizeXml(xml: string): RawFile {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '',
    textNodeName: '$text',
    parseAttributeValue: false,
    trimValues: true,
  });
  const parsed = parser.parse(xml) as Record<string, unknown>;
  return unwrap({ catalogue: parsed.catalogue, gameSystem: parsed.gameSystem }) as RawFile;
}
